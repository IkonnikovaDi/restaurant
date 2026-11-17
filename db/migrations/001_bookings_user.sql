-- ============================================================================
-- Миграция 001: привязка брони к гостевой учётной записи
-- ============================================================================
-- Нужна для существующих баз, созданных до появления раздела «Мои брони».
-- Скрипт идемпотентен: повторный запуск безопасен.
-- Применение: npm run db:migrate
-- ============================================================================

BEGIN;

ALTER TABLE bookings
    ADD COLUMN IF NOT EXISTS user_id INTEGER;

ALTER TABLE bookings
    DROP CONSTRAINT IF EXISTS fk_bookings_user;

ALTER TABLE bookings
    ADD CONSTRAINT fk_bookings_user
        FOREIGN KEY (user_id) REFERENCES users (user_id)
        ON UPDATE CASCADE ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings (user_id);

-- Существующие тестовые брони привязываем к демо-гостю, чтобы раздел
-- «Мои брони» не был пустым сразу после обновления.
UPDATE bookings
   SET user_id = (SELECT user_id FROM users WHERE login = 'guest')
 WHERE user_id IS NULL;

COMMIT;
