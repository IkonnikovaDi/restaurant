import { Router } from 'express';
import { pool } from '../config/db';
import { ApiError, asyncHandler } from '../middleware/errors';
import { asDateTime, asPositiveInt } from '../utils/validation';

export const tablesRouter = Router();

const TABLE_STATUSES = ['свободен', 'забронирован', 'занят'];

tablesRouter.get(
  '/tables',
  asyncHandler(async (req, res) => {
    let status: string | null = null;
    if (req.query.status !== undefined) {
      if (typeof req.query.status !== 'string' || !TABLE_STATUSES.includes(req.query.status)) {
        throw new ApiError(400, 'Некорректный статус стола');
      }
      status = req.query.status;
    }

    let guests: number | null = null;
    if (req.query.guests !== undefined) {
      guests = asPositiveInt(req.query.guests, 1, 20);
      if (guests === null) {
        throw new ApiError(400, 'Некорректное количество гостей');
      }
    }

    const result = await pool.query(
      `SELECT table_id AS "tableId",
              table_number AS "tableNumber",
              capacity,
              location,
              status
       FROM restaurant_tables
       WHERE ($1::text IS NULL OR status = $1)
         AND ($2::int IS NULL OR capacity >= $2)
       ORDER BY table_number`,
      [status, guests]
    );

    res.json({ tables: result.rows });
  })
);

tablesRouter.get(
  '/tables/free',
  asyncHandler(async (req, res) => {
    let guests: number | null = null;
    if (req.query.guests !== undefined) {
      guests = asPositiveInt(req.query.guests, 1, 20);
      if (guests === null) {
        throw new ApiError(400, 'Некорректное количество гостей');
      }
    }

    let requested: Date | null = new Date();
    if (req.query.datetime !== undefined) {
      requested = asDateTime(req.query.datetime);
      if (requested === null) {
        throw new ApiError(400, 'Некорректная дата и время');
      }
    }

    const result = await pool.query(
      `SELECT t.table_id AS "tableId",
              t.table_number AS "tableNumber",
              t.capacity,
              t.location,
              t.status
       FROM restaurant_tables t
       WHERE ($1::int IS NULL OR t.capacity >= $1)
         AND t.status <> 'занят'
         AND NOT EXISTS (
           SELECT 1
           FROM bookings b
           WHERE b.table_id = t.table_id
             AND b.status IN ('новая', 'подтверждена')
             AND b.booking_time BETWEEN $2::timestamptz - INTERVAL '2 hours'
                                    AND $2::timestamptz + INTERVAL '2 hours'
         )
         AND NOT EXISTS (
           SELECT 1
           FROM orders o
           WHERE o.table_id = t.table_id
             AND o.status IN ('новый', 'готовится', 'подан')
         )
       ORDER BY t.capacity, t.table_number`,
      [guests, requested.toISOString()]
    );

    res.json({ tables: result.rows });
  })
);
