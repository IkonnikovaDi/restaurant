import { Router } from 'express';
import { pool, withTransaction } from '../config/db';
import { requireRole } from '../middleware/auth';
import { ApiError, asyncHandler } from '../middleware/errors';
import { refreshTableStatus } from '../services/tableStatus';
import { BookingStatus } from '../types';
import {
  asDateOnly,
  asDateTime,
  asPositiveInt,
  asTrimmedString,
  isPhone,
} from '../utils/validation';

export const bookingsRouter = Router();

const BOOKING_STATUSES: BookingStatus[] = ['новая', 'подтверждена', 'отменена', 'выполнена'];

const BOOKING_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  'новая': ['подтверждена', 'отменена'],
  'подтверждена': ['выполнена', 'отменена'],
  'отменена': [],
  'выполнена': [],
};

interface TableRow {
  table_id: number;
  table_number: number;
  capacity: number;
}

interface BookingRow {
  status: BookingStatus;
  table_id: number;
}

bookingsRouter.post(
  '/bookings',
  asyncHandler(async (req, res) => {
    const customerName = asTrimmedString(req.body?.customerName, 150);
    const phone = asTrimmedString(req.body?.phone, 20);
    const bookingTime = asDateTime(req.body?.bookingTime);
    const guestsCount = asPositiveInt(req.body?.guestsCount, 1, 20);
    const tableId = asPositiveInt(req.body?.tableId);

    if (!customerName) {
      throw new ApiError(400, 'Укажите ФИО клиента');
    }
    if (!phone || !isPhone(phone)) {
      throw new ApiError(400, 'Укажите корректный телефон');
    }
    if (!bookingTime) {
      throw new ApiError(400, 'Укажите корректные дату и время брони');
    }
    if (bookingTime.getTime() < Date.now() - 5 * 60 * 1000) {
      throw new ApiError(400, 'Нельзя бронировать стол на прошедшее время');
    }
    if (!guestsCount) {
      throw new ApiError(400, 'Укажите количество гостей от 1 до 20');
    }
    if (!tableId) {
      throw new ApiError(400, 'Выберите стол');
    }

    const booking = await withTransaction(async (client) => {
      const tableResult = await client.query<TableRow>(
        `SELECT table_id, table_number, capacity
         FROM restaurant_tables
         WHERE table_id = $1
         FOR UPDATE`,
        [tableId]
      );

      if (tableResult.rowCount === 0) {
        throw new ApiError(404, 'Стол не найден');
      }

      const table = tableResult.rows[0];
      if (guestsCount > table.capacity) {
        throw new ApiError(
          400,
          `Стол №${table.table_number} вмещает не более ${table.capacity} гостей`
        );
      }

      const conflict = await client.query(
        `SELECT 1
         FROM bookings
         WHERE table_id = $1
           AND booking_time = $2::timestamptz
           AND status IN ('новая', 'подтверждена')`,
        [tableId, bookingTime.toISOString()]
      );

      if ((conflict.rowCount ?? 0) > 0) {
        throw new ApiError(409, 'Этот стол уже забронирован на выбранное время');
      }

      // Новая бронь создаётся в статусе «новая»: администратор подтверждает или отменяет её в панели.
      const insertResult = await client.query(
        `INSERT INTO bookings (customer_name, phone, booking_time, guests_count, table_id, status)
         VALUES ($1, $2, $3, $4, $5, 'новая')
         RETURNING booking_id AS "bookingId",
                   customer_name AS "customerName",
                   phone,
                   booking_time AS "bookingTime",
                   guests_count AS "guestsCount",
                   table_id AS "tableId",
                   status,
                   created_at AS "createdAt"`,
        [customerName, phone, bookingTime.toISOString(), guestsCount, tableId]
      );

      await client.query(
        `UPDATE restaurant_tables
         SET status = 'забронирован'
         WHERE table_id = $1
           AND status = 'свободен'
           AND ($2::timestamptz)::date = CURRENT_DATE`,
        [tableId, bookingTime.toISOString()]
      );

      return { ...insertResult.rows[0], tableNumber: table.table_number };
    });

    res.status(201).json({ booking });
  })
);

bookingsRouter.get(
  '/bookings',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    // Без параметра date администратор видит все брони, с параметром — только за выбранный день.
    let date: string | null = null;

    if (req.query.date !== undefined && req.query.date !== '') {
      const parsed = asDateOnly(req.query.date);
      if (parsed === null) {
        throw new ApiError(400, 'Дата должна быть в формате ГГГГ-ММ-ДД');
      }
      date = parsed;
    }

    const result = await pool.query(
      `SELECT b.booking_id AS "bookingId",
              b.customer_name AS "customerName",
              b.phone,
              b.booking_time AS "bookingTime",
              b.guests_count AS "guestsCount",
              b.table_id AS "tableId",
              t.table_number AS "tableNumber",
              b.status,
              b.created_at AS "createdAt"
       FROM bookings b
       JOIN restaurant_tables t ON t.table_id = b.table_id
       WHERE ($1::date IS NULL OR b.booking_time::date = $1::date)
       ORDER BY b.booking_time DESC
       LIMIT 200`,
      [date]
    );

    res.json({ bookings: result.rows });
  })
);

bookingsRouter.patch(
  '/bookings/:id/status',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const bookingId = asPositiveInt(req.params.id);
    if (!bookingId) {
      throw new ApiError(400, 'Некорректный идентификатор брони');
    }

    const status = asTrimmedString(req.body?.status, 20);
    if (!status || !BOOKING_STATUSES.includes(status as BookingStatus)) {
      throw new ApiError(400, 'Некорректный статус брони');
    }
    const nextStatus = status as BookingStatus;

    const booking = await withTransaction(async (client) => {
      const currentResult = await client.query<BookingRow>(
        `SELECT status, table_id
         FROM bookings
         WHERE booking_id = $1
         FOR UPDATE`,
        [bookingId]
      );

      if (currentResult.rowCount === 0) {
        throw new ApiError(404, 'Бронь не найдена');
      }

      const current = currentResult.rows[0];
      if (current.status === nextStatus) {
        throw new ApiError(400, 'Бронь уже находится в этом статусе');
      }
      if (!BOOKING_TRANSITIONS[current.status].includes(nextStatus)) {
        throw new ApiError(
          400,
          `Нельзя перевести бронь из статуса «${current.status}» в «${nextStatus}»`
        );
      }

      const updatedResult = await client.query(
        `UPDATE bookings
         SET status = $1
         WHERE booking_id = $2
         RETURNING booking_id AS "bookingId",
                   customer_name AS "customerName",
                   phone,
                   booking_time AS "bookingTime",
                   guests_count AS "guestsCount",
                   table_id AS "tableId",
                   status,
                   created_at AS "createdAt"`,
        [nextStatus, bookingId]
      );

      await refreshTableStatus(client, current.table_id);

      return updatedResult.rows[0];
    });

    res.json({ booking });
  })
);
