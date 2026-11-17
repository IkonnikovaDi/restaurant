-- ============================================================================
-- Ресторан «Ирис» — триггеры и функции базы данных PostgreSQL
-- ============================================================================
-- Скрипт идемпотентен: триггеры пересоздаются, функции обновляются.
-- Требует уже применённой схемы db/schema.sql.
--
-- Применение:
--   psql -U postgres -d iris_restaurant -f db/triggers.sql
--   либо через код: npm run db:triggers (src/scripts/apply-triggers.ts)
--   либо вместе со схемой и данными: npm run db:init
--
-- Что делают триггеры:
--   1. order_items -> orders.total      — пересчёт суммы чека;
--   2. orders.status -> restaurant_tables.status — освобождение стола
--      после оплаты/закрытия заказа;
--   3. bookings -> restaurant_tables.status — бронирование и освобождение
--      стола при создании/отмене брони.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Пересчёт итоговой суммы заказа
-- ----------------------------------------------------------------------------
-- Сумма не приращивается через total = total + quantity * unit_price, а
-- пересчитывается как SUM по всем позициям заказа. Для обычной вставки
-- результат совпадает с формулой приращения, но такой вариант:
--   * не удваивает сумму, если заказ уже создан с рассчитанным total
--     (так делает src/routes/orders.routes.ts);
--   * корректно работает при изменении количества и удалении позиций.
--
-- Блокировка строки заказа (FOR UPDATE) сериализует параллельные изменения
-- состава одного заказа, чтобы не потерять обновления total.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION recalc_order_total(p_order_id INTEGER)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    v_total NUMERIC(12, 2);
BEGIN
    IF p_order_id IS NULL THEN
        RETURN;
    END IF;

    -- Мьютекс на уровне заказа: следующая команда увидит свежий снимок данных.
    PERFORM 1
       FROM orders
      WHERE order_id = p_order_id
        FOR UPDATE;

    IF NOT FOUND THEN
        -- Заказ уже удалён (например, каскадом) — пересчитывать нечего.
        RETURN;
    END IF;

    SELECT COALESCE(SUM(oi.quantity * oi.unit_price), 0)
      INTO v_total
      FROM order_items oi
     WHERE oi.order_id = p_order_id;

    UPDATE orders
       SET total = v_total
     WHERE order_id = p_order_id;
END;
$$;

COMMENT ON FUNCTION recalc_order_total(INTEGER)
    IS 'Пересчитывает orders.total как сумму quantity * unit_price по позициям заказа';

CREATE OR REPLACE FUNCTION trg_order_items_recalc_total()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND OLD.order_id IS DISTINCT FROM NEW.order_id THEN
        -- Позицию перенесли в другой заказ: пересчитываем оба.
        PERFORM recalc_order_total(OLD.order_id);
        PERFORM recalc_order_total(NEW.order_id);
    ELSE
        PERFORM recalc_order_total(COALESCE(NEW.order_id, OLD.order_id));
    END IF;

    RETURN NULL; -- AFTER-триггер: результат RETURN не используется
END;
$$;

DROP TRIGGER IF EXISTS trg_order_items_recalc_total ON order_items;

CREATE TRIGGER trg_order_items_recalc_total
AFTER INSERT OR UPDATE OR DELETE ON order_items
FOR EACH ROW
EXECUTE FUNCTION trg_order_items_recalc_total();

-- ----------------------------------------------------------------------------
-- 2. Синхронизация статуса стола
-- ----------------------------------------------------------------------------
-- Единая функция для триггеров заказов и броней. Приоритет статусов:
--   * есть активный заказ (новый / готовится / подан) -> «занят»;
--   * есть активная бронь на сегодня                   -> «забронирован»;
--   * иначе                                            -> «свободен».
-- Такая логика не даёт освободить стол, за которым ещё есть незакрытый заказ,
-- и не сбрасывает бронь, оформленную на текущий день.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION refresh_table_status(p_table_id INTEGER)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
    IF p_table_id IS NULL THEN
        RETURN;
    END IF;

    UPDATE restaurant_tables t
       SET status = CASE
               WHEN EXISTS (
                   SELECT 1
                     FROM orders o
                    WHERE o.table_id = p_table_id
                      AND o.status IN ('новый', 'готовится', 'подан')
               ) THEN 'занят'
               WHEN EXISTS (
                   SELECT 1
                     FROM bookings b
                    WHERE b.table_id = p_table_id
                      AND b.status IN ('новая', 'подтверждена')
                      AND b.booking_time::date = CURRENT_DATE
               ) THEN 'забронирован'
               ELSE 'свободен'
           END
     WHERE t.table_id = p_table_id;
END;
$$;

COMMENT ON FUNCTION refresh_table_status(INTEGER)
    IS 'Пересчитывает restaurant_tables.status по активным заказам и броням на сегодня';

-- ----------------------------------------------------------------------------
-- 3. Изменение статуса заказа -> освобождение стола
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_orders_sync_table_status()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Триггер вызывается только для статусов «оплачен» и «закрыт».
    -- Стол станет «свободен», если на нём нет других активных заказов
    -- и нет активной брони на сегодня.
    PERFORM refresh_table_status(NEW.table_id);

    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_sync_table_status ON orders;

CREATE TRIGGER trg_orders_sync_table_status
AFTER UPDATE OF status ON orders
FOR EACH ROW
WHEN (
    NEW.status IN ('оплачен', 'закрыт')
    AND OLD.status IS DISTINCT FROM NEW.status
)
EXECUTE FUNCTION trg_orders_sync_table_status();

-- ----------------------------------------------------------------------------
-- 4. Создание и отмена брони -> статус стола
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_bookings_sync_table_status()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- Бронь на сегодня переводит свободный стол в «забронирован».
        -- Занятый стол останется «занят» (приоритет активного заказа).
        PERFORM refresh_table_status(NEW.table_id);
        RETURN NULL;
    END IF;

    -- UPDATE: бронь могли перенести на другой стол.
    IF NEW.table_id IS DISTINCT FROM OLD.table_id THEN
        PERFORM refresh_table_status(OLD.table_id);
        PERFORM refresh_table_status(NEW.table_id);
        RETURN NULL;
    END IF;

    -- Отмена или выполнение брони освобождает стол, если он больше не нужен.
    IF NEW.status IS DISTINCT FROM OLD.status
       AND NEW.status IN ('отменена', 'выполнена') THEN
        PERFORM refresh_table_status(NEW.table_id);
        RETURN NULL;
    END IF;

    -- Подтверждение брони (новая -> подтверждена) и прочие изменения статуса.
    IF NEW.status IS DISTINCT FROM OLD.status THEN
        PERFORM refresh_table_status(NEW.table_id);
    END IF;

    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_bookings_sync_table_status ON bookings;

CREATE TRIGGER trg_bookings_sync_table_status
AFTER INSERT OR UPDATE OF status, table_id ON bookings
FOR EACH ROW
EXECUTE FUNCTION trg_bookings_sync_table_status();

COMMIT;

-- ============================================================================
-- Примеры проверки (выполнять вручную, вне данного скрипта)
-- ============================================================================
-- 1. Пересчёт суммы заказа:
--    INSERT INTO orders (status, employee_id, table_id)
--    VALUES ('новый', 3, 1) RETURNING order_id;
--    INSERT INTO order_items (order_id, dish_id, quantity, unit_price)
--    VALUES (<order_id>, 4, 2, 520.00);
--    SELECT total FROM orders WHERE order_id = <order_id>;  -- 1040.00
--
-- 2. Освобождение стола после оплаты:
--    UPDATE orders SET status = 'оплачен' WHERE order_id = <order_id>;
--    SELECT status FROM restaurant_tables WHERE table_id = 1; -- свободен
--
-- 3. Бронь на сегодня и её отмена:
--    INSERT INTO bookings (customer_name, phone, booking_time, guests_count, table_id, status)
--    VALUES ('Тестов Тест', '+7 (913) 000-00-00', NOW() + INTERVAL '2 hours', 2, 1, 'новая');
--    SELECT status FROM restaurant_tables WHERE table_id = 1; -- забронирован
--    UPDATE bookings SET status = 'отменена' WHERE booking_id = <booking_id>;
--    SELECT status FROM restaurant_tables WHERE table_id = 1; -- свободен
-- ============================================================================
