-- 1. Список блюд заданной категории
-- Параметр: $1 — идентификатор категории

SELECT d.dish_id      AS "dishId",
       d.name,
       c.name         AS "categoryName",
       d.price::float8 AS price,
       d.weight_grams AS "weightGrams",
       d.description,
       d.is_available AS "isAvailable"
  FROM dishes d
  JOIN categories c ON c.category_id = d.category_id
 WHERE d.category_id = $1::int
 ORDER BY d.name;

-- 2. Стоимость конкретного блюда
-- Параметр: $1 — идентификатор блюда
SELECT d.dish_id      AS "dishId",
       d.name,
       c.name         AS "categoryName",
       d.price::float8 AS price,
       d.weight_grams AS "weightGrams",
       d.description,
       d.is_available AS "isAvailable"
  FROM dishes d
  JOIN categories c ON c.category_id = d.category_id
 WHERE d.dish_id = $1::int;

-- 3. Брони на текущий день
SELECT b.booking_id    AS "bookingId",
       b.customer_name AS "customerName",
       b.phone,
       b.booking_time  AS "bookingTime",
       b.guests_count  AS "guestsCount",
       b.table_id      AS "tableId",
       t.table_number  AS "tableNumber",
       b.status,
       b.created_at    AS "createdAt"
  FROM bookings b
  JOIN restaurant_tables t ON t.table_id = b.table_id
 WHERE b.booking_time::date = CURRENT_DATE
 ORDER BY b.booking_time, t.table_number;

-- 4. Свободные столы на указанное время
-- Параметры: $1 — количество гостей (NULL — без ограничения),
--            $2 — дата и время (timestamptz)
SELECT t.table_id     AS "tableId",
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
 ORDER BY t.capacity, t.table_number;

-- 5. Заказы конкретного официанта за смену (за указанную дату)
-- Параметры: $1 — идентификатор официанта, $2 — дата смены
SELECT o.order_id    AS "orderId",
       o.created_at  AS "createdAt",
       o.status,
       o.total::float8 AS total,
       o.employee_id AS "employeeId",
       e.last_name || ' ' || e.first_name AS "employeeName",
       o.table_id    AS "tableId",
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
 WHERE o.employee_id = $1::int
   AND o.created_at::date = $2::date
 GROUP BY o.order_id, e.employee_id, t.table_id
 ORDER BY o.created_at;

-- 6. Топ-5 популярных блюд за месяц
-- Параметр: $1 — первый день месяца (date)
SELECT d.dish_id       AS "dishId",
       d.name,
       c.name          AS "categoryName",
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
 LIMIT 5;

-- 7. История заказов за конкретную дату
-- Параметр: $1 — дата
SELECT o.order_id    AS "orderId",
       o.created_at  AS "createdAt",
       o.status,
       o.total::float8 AS total,
       o.employee_id AS "employeeId",
       e.last_name || ' ' || e.first_name AS "employeeName",
       o.table_id    AS "tableId",
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
 ORDER BY o.created_at;

-- 8. Поставки от конкретного поставщика за период
-- Параметры: $1 — поставщик (частичное совпадение),
--            $2 — начало периода, $3 — конец периода
SELECT s.supply_id      AS "supplyId",
       s.supply_date    AS "supplyDate",
       s.supplier,
       s.invoice_number AS "invoiceNumber",
       s.amount::float8 AS amount,
       s.employee_id    AS "employeeId",
       e.last_name || ' ' || e.first_name AS "employeeName"
  FROM supplies s
  JOIN employees e ON e.employee_id = s.employee_id
 WHERE s.supplier ILIKE '%' || $1::text || '%'
   AND s.supply_date BETWEEN $2::date AND $3::date
 ORDER BY s.supply_date, s.supply_id;

-- 9. Сумма поставки по номеру накладной
-- Параметр: $1 — номер накладной
SELECT s.supply_id      AS "supplyId",
       s.supply_date    AS "supplyDate",
       s.supplier,
       s.invoice_number AS "invoiceNumber",
       s.amount::float8 AS amount,
       s.employee_id    AS "employeeId",
       e.last_name || ' ' || e.first_name AS "employeeName"
  FROM supplies s
  JOIN employees e ON e.employee_id = s.employee_id
 WHERE s.invoice_number = $1::text;


-- 10. Сотрудники по должности
-- Параметр: $1 — должность (NULL — все сотрудники)
SELECT employee_id AS "employeeId",
       last_name   AS "lastName",
       first_name  AS "firstName",
       middle_name AS "middleName",
       position,
       phone,
       is_active   AS "isActive",
       last_name || ' ' || first_name || COALESCE(' ' || middle_name, '') AS "fullName"
  FROM employees
 WHERE is_active = TRUE
   AND ($1::text IS NULL OR position = $1::text)
 ORDER BY position, last_name, first_name;