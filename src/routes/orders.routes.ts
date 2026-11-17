import { Router } from 'express';
import { pool, withTransaction } from '../config/db';
import { requireRole } from '../middleware/auth';
import { ApiError, asyncHandler } from '../middleware/errors';
import { refreshTableStatus } from '../services/tableStatus';
import { OrderItemInput, OrderStatus } from '../types';
import { asDateOnly, asPositiveInt, asTrimmedString } from '../utils/validation';

export const ordersRouter = Router();

const ORDER_STATUSES: OrderStatus[] = [
  'новый',
  'готовится',
  'подан',
  'оплачен',
  'закрыт',
  'отменён',
];

const STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  'новый': ['готовится', 'отменён'],
  'готовится': ['подан', 'отменён'],
  'подан': ['оплачен', 'отменён'],
  'оплачен': ['закрыт'],
  'закрыт': [],
  'отменён': [],
};

const TERMINAL_STATUSES: OrderStatus[] = ['оплачен', 'закрыт', 'отменён'];

interface TableRow {
  table_id: number;
  table_number: number;
}

interface EmployeeRow {
  position: string;
  is_active: boolean;
  full_name: string;
}

interface DishRow {
  dish_id: number;
  name: string;
  price: string;
}

interface CurrentOrderRow {
  status: OrderStatus;
  table_id: number;
}

function parseItems(raw: unknown): OrderItemInput[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new ApiError(400, 'Добавьте в заказ хотя бы одно блюдо');
  }
  if (raw.length > 50) {
    throw new ApiError(400, 'Слишком много позиций в заказе');
  }

  const merged = new Map<number, number>();

  for (const item of raw) {
    if (typeof item !== 'object' || item === null) {
      throw new ApiError(400, 'Некорректная позиция заказа');
    }

    const record = item as Record<string, unknown>;
    const dishId = asPositiveInt(record.dishId);
    const quantity = asPositiveInt(record.quantity, 1, 100);

    if (!dishId || !quantity) {
      throw new ApiError(
        400,
        'У каждой позиции должны быть блюдо и количество от 1 до 100'
      );
    }

    merged.set(dishId, (merged.get(dishId) ?? 0) + quantity);
  }

  return Array.from(merged, ([dishId, quantity]) => ({ dishId, quantity }));
}

ordersRouter.post(
  '/orders',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const tableId = asPositiveInt(req.body?.tableId);
    const employeeId = asPositiveInt(req.body?.employeeId);

    if (!tableId) {
      throw new ApiError(400, 'Выберите стол');
    }
    if (!employeeId) {
      throw new ApiError(400, 'Выберите официанта');
    }

    const items = parseItems(req.body?.items);

    const order = await withTransaction(async (client) => {
      const tableResult = await client.query<TableRow>(
        `SELECT table_id, table_number
         FROM restaurant_tables
         WHERE table_id = $1
         FOR UPDATE`,
        [tableId]
      );

      if (tableResult.rowCount === 0) {
        throw new ApiError(404, 'Стол не найден');
      }

      const table = tableResult.rows[0];

      const employeeResult = await client.query<EmployeeRow>(
        `SELECT position,
                is_active,
                last_name || ' ' || first_name || COALESCE(' ' || middle_name, '') AS full_name
         FROM employees
         WHERE employee_id = $1`,
        [employeeId]
      );

      if (employeeResult.rowCount === 0) {
        throw new ApiError(404, 'Сотрудник не найден');
      }

      const employee = employeeResult.rows[0];
      if (!employee.is_active) {
        throw new ApiError(400, 'Сотрудник неактивен');
      }
      if (employee.position !== 'официант') {
        throw new ApiError(400, 'Заказ может оформить только официант');
      }

      const activeOrder = await client.query(
        `SELECT 1
         FROM orders
         WHERE table_id = $1
           AND status IN ('новый', 'готовится', 'подан')
         LIMIT 1`,
        [tableId]
      );

      if ((activeOrder.rowCount ?? 0) > 0) {
        throw new ApiError(409, 'За этим столом уже есть активный заказ');
      }

      const dishIds = items.map((item) => item.dishId);
      const dishesResult = await client.query<DishRow>(
        `SELECT dish_id, name, price
         FROM dishes
         WHERE dish_id = ANY($1::int[])
           AND is_available = TRUE`,
        [dishIds]
      );

      if (dishesResult.rowCount !== dishIds.length) {
        throw new ApiError(400, 'Некоторые блюда недоступны или не найдены');
      }

      const dishesById = new Map(dishesResult.rows.map((row) => [row.dish_id, row]));
      let total = 0;

      const orderItems = items.map((item) => {
        const dish = dishesById.get(item.dishId);
        if (!dish) {
          throw new ApiError(400, 'Блюдо не найдено');
        }

        const unitPrice = Number(dish.price);
        total += unitPrice * item.quantity;

        return {
          dishId: item.dishId,
          name: dish.name,
          quantity: item.quantity,
          unitPrice,
        };
      });

      total = Math.round(total * 100) / 100;

      const orderResult = await client.query<{
        order_id: number;
        created_at: string;
        status: OrderStatus;
      }>(
        `INSERT INTO orders (status, total, employee_id, table_id)
         VALUES ('новый', $1, $2, $3)
         RETURNING order_id, created_at, status`,
        [total.toFixed(2), employeeId, tableId]
      );

      const created = orderResult.rows[0];

      for (const item of orderItems) {
        await client.query(
          `INSERT INTO order_items (order_id, dish_id, quantity, unit_price)
           VALUES ($1, $2, $3, $4)`,
          [created.order_id, item.dishId, item.quantity, item.unitPrice.toFixed(2)]
        );
      }

      await client.query(
        `UPDATE restaurant_tables
         SET status = 'занят'
         WHERE table_id = $1`,
        [tableId]
      );

      return {
        orderId: created.order_id,
        createdAt: created.created_at,
        status: created.status,
        total,
        employeeId,
        employeeName: employee.full_name,
        tableId,
        tableNumber: table.table_number,
        items: orderItems,
      };
    });

    res.status(201).json({ order });
  })
);

ordersRouter.get(
  '/orders',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    let status: OrderStatus | null = null;
    if (req.query.status !== undefined) {
      if (
        typeof req.query.status !== 'string' ||
        !ORDER_STATUSES.includes(req.query.status as OrderStatus)
      ) {
        throw new ApiError(400, 'Некорректный статус заказа');
      }
      status = req.query.status as OrderStatus;
    }

    let date: string | null = null;
    if (req.query.date !== undefined) {
      date = asDateOnly(req.query.date);
      if (date === null) {
        throw new ApiError(400, 'Дата должна быть в формате ГГГГ-ММ-ДД');
      }
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
       WHERE ($1::text IS NULL OR o.status = $1)
         AND ($2::date IS NULL OR o.created_at::date = $2)
       GROUP BY o.order_id, e.employee_id, t.table_id
       ORDER BY o.created_at DESC
       LIMIT 200`,
      [status, date]
    );

    res.json({ orders: result.rows });
  })
);

ordersRouter.get(
  '/orders/:id',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const orderId = asPositiveInt(req.params.id);
    if (!orderId) {
      throw new ApiError(400, 'Некорректный идентификатор заказа');
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
       WHERE o.order_id = $1
       GROUP BY o.order_id, e.employee_id, t.table_id`,
      [orderId]
    );

    if (result.rowCount === 0) {
      throw new ApiError(404, 'Заказ не найден');
    }

    res.json({ order: result.rows[0] });
  })
);

ordersRouter.patch(
  '/orders/:id/status',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const orderId = asPositiveInt(req.params.id);
    if (!orderId) {
      throw new ApiError(400, 'Некорректный идентификатор заказа');
    }

    const status = asTrimmedString(req.body?.status, 20);
    if (!status || !ORDER_STATUSES.includes(status as OrderStatus)) {
      throw new ApiError(400, 'Некорректный статус заказа');
    }
    const nextStatus = status as OrderStatus;

    const order = await withTransaction(async (client) => {
      const currentResult = await client.query<CurrentOrderRow>(
        `SELECT status, table_id
         FROM orders
         WHERE order_id = $1
         FOR UPDATE`,
        [orderId]
      );

      if (currentResult.rowCount === 0) {
        throw new ApiError(404, 'Заказ не найден');
      }

      const current = currentResult.rows[0];
      if (current.status === nextStatus) {
        throw new ApiError(400, 'Заказ уже находится в этом статусе');
      }
      if (!STATUS_TRANSITIONS[current.status].includes(nextStatus)) {
        throw new ApiError(
          400,
          `Нельзя перевести заказ из статуса «${current.status}» в «${nextStatus}»`
        );
      }

      const updatedResult = await client.query(
        `UPDATE orders
         SET status = $1
         WHERE order_id = $2
         RETURNING order_id AS "orderId",
                   created_at AS "createdAt",
                   status,
                   total::float8 AS total,
                   employee_id AS "employeeId",
                   table_id AS "tableId"`,
        [nextStatus, orderId]
      );

      if (TERMINAL_STATUSES.includes(nextStatus)) {
        await refreshTableStatus(client, current.table_id);
      }

      return updatedResult.rows[0];
    });

    res.json({ order });
  })
);
