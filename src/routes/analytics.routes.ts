import { Router } from 'express';
import { pool } from '../config/db';
import { requireRole } from '../middleware/auth';
import { ApiError, asyncHandler } from '../middleware/errors';
import {
  asDateOnly,
  asDateTime,
  asPositiveInt,
  asTrimmedString,
} from '../utils/validation';

export const analyticsRouter = Router();

const EMPLOYEE_POSITIONS = [
  'директор',
  'администратор',
  'официант',
  'повар',
  'кладовщик',
  'бармен',
];

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function currentDateOnly(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
}

function asMonth(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    return null;
  }

  return value;
}

// 1. Список блюд заданной категории.
analyticsRouter.get(
  '/analytics/dishes',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const categoryId = asPositiveInt(req.query.categoryId ?? req.query.category_id);
    if (categoryId === null) {
      throw new ApiError(400, 'Укажите корректный идентификатор категории');
    }

    const result = await pool.query(
      `SELECT d.dish_id AS "dishId",
              d.name,
              c.name AS "categoryName",
              d.price::float8 AS price,
              d.weight_grams AS "weightGrams",
              d.description,
              d.is_available AS "isAvailable"
       FROM dishes d
       JOIN categories c ON c.category_id = d.category_id
       WHERE d.category_id = $1
       ORDER BY d.name`,
      [categoryId]
    );

    res.json({ dishes: result.rows });
  })
);

// 2. Стоимость конкретного блюда.
analyticsRouter.get(
  '/analytics/dish-price',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const dishId = asPositiveInt(req.query.dishId ?? req.query.dish_id);
    if (dishId === null) {
      throw new ApiError(400, 'Укажите корректный идентификатор блюда');
    }

    const result = await pool.query(
      `SELECT d.dish_id AS "dishId",
              d.name,
              c.name AS "categoryName",
              d.price::float8 AS price,
              d.weight_grams AS "weightGrams",
              d.description,
              d.is_available AS "isAvailable"
       FROM dishes d
       JOIN categories c ON c.category_id = d.category_id
       WHERE d.dish_id = $1`,
      [dishId]
    );

    if (result.rowCount === 0) {
      throw new ApiError(404, 'Блюдо не найдено');
    }

    res.json({ dish: result.rows[0] });
  })
);

// 3. Брони на текущий день.
analyticsRouter.get(
  '/analytics/bookings/today',
  requireRole('admin'),
  asyncHandler(async (_req, res) => {
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
       WHERE b.booking_time::date = CURRENT_DATE
       ORDER BY b.booking_time, t.table_number`
    );

    res.json({ bookings: result.rows });
  })
);

// 4. Свободные столы на указанное время.
// Доступен и гостю: раздел бронирования на странице меню использует тот же
// расчёт, что и публичный /api/tables/free.
analyticsRouter.get(
  '/analytics/free-tables',
  asyncHandler(async (req, res) => {
    let guests: number | null = null;
    if (req.query.guests !== undefined) {
      guests = asPositiveInt(req.query.guests, 1, 20);
      if (guests === null) {
        throw new ApiError(400, 'Некорректное количество гостей');
      }
    }

    let requested = new Date();
    if (req.query.datetime !== undefined) {
      const parsed = asDateTime(req.query.datetime);
      if (parsed === null) {
        throw new ApiError(400, 'Некорректная дата и время');
      }
      requested = parsed;
    }

    const result = await pool.query(
      `SELECT t.table_id AS "tableId",
              t.table_number AS "tableNumber",
              t.capacity,
              t.location,
              'свободен'::text AS status
       FROM restaurant_tables t
       WHERE ($1::int IS NULL OR t.capacity >= $1::int)
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

    res.json({
      datetime: requested.toISOString(),
      guests,
      tables: result.rows,
    });
  })
);

// 5. Заказы конкретного официанта за смену.
analyticsRouter.get(
  '/analytics/waiter-orders',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const employeeId = asPositiveInt(
      req.query.employeeId ?? req.query.employee_id
    );
    if (employeeId === null) {
      throw new ApiError(400, 'Укажите корректный идентификатор официанта');
    }

    const date =
      req.query.date === undefined ? currentDateOnly() : asDateOnly(req.query.date);
    if (date === null) {
      throw new ApiError(400, 'Дата должна быть в формате ГГГГ-ММ-ДД');
    }

    const employeeResult = await pool.query(
      `SELECT employee_id AS "employeeId",
              last_name AS "lastName",
              first_name AS "firstName",
              middle_name AS "middleName",
              position,
              phone,
              is_active AS "isActive",
              last_name || ' ' || first_name || COALESCE(' ' || middle_name, '') AS "fullName"
       FROM employees
       WHERE employee_id = $1`,
      [employeeId]
    );

    if (employeeResult.rowCount === 0) {
      throw new ApiError(404, 'Сотрудник не найден');
    }

    const result = await pool.query(
      `SELECT o.order_id AS "orderId",
              o.created_at AS "createdAt",
              o.status,
              o.total::float8 AS total,
              o.employee_id AS "employeeId",
              e.last_name || ' ' || e.first_name AS "employeeName",
              o.table_id AS "tableId",
              t.table_number AS "tableNumber",
              COALESCE(
                json_agg(
                  json_build_object(
                    'dishId', oi.dish_id,
                    'name', d.name,
                    'quantity', oi.quantity,
                    'unitPrice', oi.unit_price::float8
                  ) ORDER BY oi.order_item_id
                ) FILTER (WHERE oi.order_item_id IS NOT NULL),
                '[]'::json
              ) AS items
       FROM orders o
       JOIN employees e ON e.employee_id = o.employee_id
       JOIN restaurant_tables t ON t.table_id = o.table_id
       LEFT JOIN order_items oi ON oi.order_id = o.order_id
       LEFT JOIN dishes d ON d.dish_id = oi.dish_id
       WHERE o.employee_id = $1
         AND o.created_at::date = $2::date
       GROUP BY o.order_id, e.employee_id, t.table_id
       ORDER BY o.created_at`,
      [employeeId, date]
    );

    res.json({
      employee: employeeResult.rows[0],
      date,
      orders: result.rows,
    });
  })
);

// 6. Топ-5 популярных блюд за месяц.
analyticsRouter.get(
  '/analytics/top-dishes',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const month =
      req.query.month === undefined ? currentMonth() : asMonth(req.query.month);
    if (month === null) {
      throw new ApiError(400, 'Месяц должен быть в формате ГГГГ-ММ');
    }

    const result = await pool.query(
      `SELECT d.dish_id AS "dishId",
              d.name,
              c.name AS "categoryName",
              SUM(oi.quantity)::int AS "quantitySold",
              SUM(oi.quantity * oi.unit_price)::float8 AS revenue
       FROM order_items oi
       JOIN orders o ON o.order_id = oi.order_id
       JOIN dishes d ON d.dish_id = oi.dish_id
       JOIN categories c ON c.category_id = d.category_id
       WHERE o.status <> 'отменён'
         AND o.created_at >= $1::date
         AND o.created_at < ($1::date + INTERVAL '1 month')
       GROUP BY d.dish_id, d.name, c.name
       ORDER BY "quantitySold" DESC, revenue DESC, d.name
       LIMIT 5`,
      [`${month}-01`]
    );

    res.json({ month, dishes: result.rows });
  })
);

// 7. История заказов за конкретную дату.
analyticsRouter.get(
  '/analytics/orders',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const date =
      req.query.date === undefined ? currentDateOnly() : asDateOnly(req.query.date);
    if (date === null) {
      throw new ApiError(400, 'Дата должна быть в формате ГГГГ-ММ-ДД');
    }

    const result = await pool.query(
      `SELECT o.order_id AS "orderId",
              o.created_at AS "createdAt",
              o.status,
              o.total::float8 AS total,
              o.employee_id AS "employeeId",
              e.last_name || ' ' || e.first_name AS "employeeName",
              o.table_id AS "tableId",
              t.table_number AS "tableNumber",
              COALESCE(
                json_agg(
                  json_build_object(
                    'dishId', oi.dish_id,
                    'name', d.name,
                    'quantity', oi.quantity,
                    'unitPrice', oi.unit_price::float8
                  ) ORDER BY oi.order_item_id
                ) FILTER (WHERE oi.order_item_id IS NOT NULL),
                '[]'::json
              ) AS items
       FROM orders o
       JOIN employees e ON e.employee_id = o.employee_id
       JOIN restaurant_tables t ON t.table_id = o.table_id
       LEFT JOIN order_items oi ON oi.order_id = o.order_id
       LEFT JOIN dishes d ON d.dish_id = oi.dish_id
       WHERE o.created_at::date = $1::date
       GROUP BY o.order_id, e.employee_id, t.table_id
       ORDER BY o.created_at
       LIMIT 200`,
      [date]
    );

    res.json({ date, orders: result.rows });
  })
);

// 8. Поставки от конкретного поставщика за период.
analyticsRouter.get(
  '/analytics/supplies',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const supplier = asTrimmedString(req.query.supplier, 150);
    if (!supplier) {
      throw new ApiError(400, 'Укажите поставщика');
    }

    const now = new Date();
    const defaultFrom = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-01`;
    const defaultTo = currentDateOnly();

    const from = req.query.from === undefined ? defaultFrom : asDateOnly(req.query.from);
    const to = req.query.to === undefined ? defaultTo : asDateOnly(req.query.to);

    if (from === null || to === null) {
      throw new ApiError(400, 'Даты периода должны быть в формате ГГГГ-ММ-ДД');
    }
    if (from > to) {
      throw new ApiError(400, 'Начало периода не может быть позже конца');
    }

    const result = await pool.query(
      `SELECT s.supply_id AS "supplyId",
              s.supply_date AS "supplyDate",
              s.supplier,
              s.invoice_number AS "invoiceNumber",
              s.amount::float8 AS amount,
              s.employee_id AS "employeeId",
              e.last_name || ' ' || e.first_name AS "employeeName"
       FROM supplies s
       JOIN employees e ON e.employee_id = s.employee_id
       WHERE s.supplier ILIKE '%' || $1 || '%'
         AND s.supply_date BETWEEN $2::date AND $3::date
       ORDER BY s.supply_date, s.supply_id`,
      [supplier, from, to]
    );

    res.json({ supplier, from, to, supplies: result.rows });
  })
);

// 9. Сумма поставки по номеру накладной.
analyticsRouter.get(
  '/analytics/supply-amount',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const invoice = asTrimmedString(req.query.invoice, 50);
    if (!invoice) {
      throw new ApiError(400, 'Укажите номер накладной');
    }

    const result = await pool.query(
      `SELECT s.supply_id AS "supplyId",
              s.supply_date AS "supplyDate",
              s.supplier,
              s.invoice_number AS "invoiceNumber",
              s.amount::float8 AS amount,
              s.employee_id AS "employeeId",
              e.last_name || ' ' || e.first_name AS "employeeName"
       FROM supplies s
       JOIN employees e ON e.employee_id = s.employee_id
       WHERE s.invoice_number = $1`,
      [invoice]
    );

    if (result.rowCount === 0) {
      throw new ApiError(404, 'Поставка с такой накладной не найдена');
    }

    res.json({ supply: result.rows[0] });
  })
);

// 10. Сотрудники по должности.
analyticsRouter.get(
  '/analytics/employees',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    let position: string | null = null;

    if (req.query.position !== undefined && req.query.position !== '') {
      position = asTrimmedString(req.query.position, 50);
      if (!position || !EMPLOYEE_POSITIONS.includes(position)) {
        throw new ApiError(400, 'Некорректная должность');
      }
    }

    const result = await pool.query(
      `SELECT employee_id AS "employeeId",
              last_name AS "lastName",
              first_name AS "firstName",
              middle_name AS "middleName",
              position,
              phone,
              is_active AS "isActive",
              last_name || ' ' || first_name || COALESCE(' ' || middle_name, '') AS "fullName"
       FROM employees
       WHERE is_active = TRUE
         AND ($1::text IS NULL OR position = $1::text)
       ORDER BY position, last_name, first_name`,
      [position]
    );

    res.json({ position, employees: result.rows });
  })
);
