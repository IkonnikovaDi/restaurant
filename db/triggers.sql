BEGIN;

-- ============================================================================
-- Ресторан «Лотос» — триггеры базы данных
--
-- Оставлены только три сценария:
--   1. пересчёт итоговой суммы заказа;
--   2. освобождение стола после оплаты заказа;
--   3. бронирование стола при создании брони.
--
-- Перенос брони на другой стол и изменение table_id на сайте не используются,
-- поэтому соответствующая логика удалена.
-- ============================================================================

-- Удаляем прежние версии триггеров и функций, чтобы повторный запуск был
-- безопасным и в базе не оставалось устаревших обработчиков.
DROP TRIGGER IF EXISTS trg_order_items_recalc_total ON order_items;
DROP TRIGGER IF EXISTS trg_orders_sync_table_status ON orders;
DROP TRIGGER IF EXISTS trg_bookings_sync_table_status ON bookings;
DROP TRIGGER IF EXISTS trg_orders_release_table ON orders;
DROP TRIGGER IF EXISTS trg_bookings_reserve_table ON bookings;

DROP FUNCTION IF EXISTS trg_orders_sync_table_status();
DROP FUNCTION IF EXISTS trg_bookings_sync_table_status();
DROP FUNCTION IF EXISTS refresh_table_status(INTEGER);


-- ---------------------------------------------------------------------------
-- 1. Пересчёт итоговой суммы заказа
-- ---------------------------------------------------------------------------
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

    -- Блокируем заказ, чтобы параллельные изменения позиций не оставили
    -- в orders.total устаревшую сумму.
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
        -- Позицию перенесли в другой заказ: пересчитываем оба заказа.
        PERFORM recalc_order_total(OLD.order_id);
        PERFORM recalc_order_total(NEW.order_id);
    ELSE
        PERFORM recalc_order_total(COALESCE(NEW.order_id, OLD.order_id));
    END IF;

    RETURN NULL;
END;
$$;

CREATE TRIGGER trg_order_items_recalc_total
AFTER INSERT OR UPDATE OR DELETE ON order_items
FOR EACH ROW
EXECUTE FUNCTION trg_order_items_recalc_total();


-- ---------------------------------------------------------------------------
-- 2. Освобождение стола после оплаты
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_orders_release_table()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- После оплаты заказа стол освобождается, если на нём нет другого
    -- активного заказа и нет активной брони на сегодня.
    UPDATE restaurant_tables t
       SET status = CASE
               WHEN EXISTS (
                   SELECT 1
                     FROM orders o
                    WHERE o.table_id = NEW.table_id
                      AND o.status IN ('новый', 'готовится', 'подан')
               ) THEN 'занят'
               WHEN EXISTS (
                   SELECT 1
                     FROM bookings b
                    WHERE b.table_id = NEW.table_id
                      AND b.status IN ('новая', 'подтверждена')
                      AND b.booking_time::date = CURRENT_DATE
               ) THEN 'забронирован'
               ELSE 'свободен'
           END
     WHERE t.table_id = NEW.table_id;

    RETURN NULL;
END;
$$;

COMMENT ON FUNCTION trg_orders_release_table()
    IS 'Освобождает стол после перехода заказа в статус «оплачен» или «закрыт»';

CREATE TRIGGER trg_orders_release_table
AFTER UPDATE OF status ON orders
FOR EACH ROW
WHEN (
    NEW.status IN ('оплачен', 'закрыт')
    AND OLD.status IS DISTINCT FROM NEW.status
)
EXECUTE FUNCTION trg_orders_release_table();


-- ---------------------------------------------------------------------------
-- 3. Бронирование стола при создании брони
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_bookings_reserve_table()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Бронь на сегодня переводит свободный стол в «забронирован».
    -- Занятый стол не трогаем: приоритет у активного заказа.
    IF NEW.status IN ('новая', 'подтверждена')
       AND NEW.booking_time::date = CURRENT_DATE THEN
        UPDATE restaurant_tables
           SET status = 'забронирован'
         WHERE table_id = NEW.table_id
           AND status = 'свободен';
    END IF;

    RETURN NULL;
END;
$$;

COMMENT ON FUNCTION trg_bookings_reserve_table()
    IS 'Переводит свободный стол в «забронирован» при создании брони на сегодня';

CREATE TRIGGER trg_bookings_reserve_table
AFTER INSERT ON bookings
FOR EACH ROW
EXECUTE FUNCTION trg_bookings_reserve_table();

COMMIT;
