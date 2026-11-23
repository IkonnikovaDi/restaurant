CREATE EXTENSION IF NOT EXISTS pgcrypto;

DROP TABLE IF EXISTS order_items CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS bookings CASCADE;
DROP TABLE IF EXISTS supplies CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS dishes CASCADE;
DROP TABLE IF EXISTS categories CASCADE;
DROP TABLE IF EXISTS restaurant_tables CASCADE;
DROP TABLE IF EXISTS employees CASCADE;

CREATE TABLE categories (
    category_id SERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    sort_order  INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
    is_active   BOOLEAN NOT NULL DEFAULT TRUE
);

COMMENT ON TABLE categories IS 'Категории меню ресторана';

CREATE TABLE dishes (
    dish_id      SERIAL PRIMARY KEY,
    category_id  INTEGER NOT NULL,
    name         VARCHAR(150) NOT NULL,
    price        NUMERIC(10, 2) NOT NULL CHECK (price > 0),
    weight_grams INTEGER CHECK (weight_grams > 0),
    description  TEXT,
    is_available BOOLEAN NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_dishes_category
        FOREIGN KEY (category_id) REFERENCES categories (category_id)
        ON UPDATE CASCADE ON DELETE RESTRICT
);

COMMENT ON TABLE dishes IS 'Позиции меню';

CREATE TABLE employees (
    employee_id SERIAL PRIMARY KEY,
    last_name   VARCHAR(100) NOT NULL,
    first_name  VARCHAR(100) NOT NULL,
    middle_name VARCHAR(100),
    position    VARCHAR(50) NOT NULL,
    phone       VARCHAR(20) NOT NULL,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT chk_employees_position CHECK (
        position IN ('директор', 'администратор', 'официант', 'повар', 'кладовщик', 'бармен')
    ),
    CONSTRAINT chk_employees_phone CHECK (phone ~ '^[0-9+() -]{10,20}$')
);

COMMENT ON TABLE employees IS 'Работники ресторана';

CREATE TABLE restaurant_tables (
    table_id     SERIAL PRIMARY KEY,
    table_number INTEGER NOT NULL UNIQUE CHECK (table_number > 0),
    capacity     INTEGER NOT NULL CHECK (capacity BETWEEN 1 AND 20),
    location     VARCHAR(50) NOT NULL,
    status       VARCHAR(20) NOT NULL DEFAULT 'свободен',
    CONSTRAINT chk_tables_location CHECK (
        location IN ('зал', 'центр', 'у окна', 'vip-зона', 'терраса')
    ),
    CONSTRAINT chk_tables_status CHECK (
        status IN ('свободен', 'забронирован', 'занят')
    )
);

COMMENT ON TABLE restaurant_tables IS 'Столы ресторанного зала';

CREATE TABLE orders (
    order_id    SERIAL PRIMARY KEY,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status      VARCHAR(20) NOT NULL DEFAULT 'новый',
    total       NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (total >= 0),
    employee_id INTEGER NOT NULL,
    table_id    INTEGER NOT NULL,
    CONSTRAINT fk_orders_employee
        FOREIGN KEY (employee_id) REFERENCES employees (employee_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_orders_table
        FOREIGN KEY (table_id) REFERENCES restaurant_tables (table_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT chk_orders_status CHECK (
        status IN ('новый', 'готовится', 'подан', 'оплачен', 'закрыт', 'отменён')
    )
);

COMMENT ON TABLE orders IS 'Заказы посетителей';

--Состав заказа: ассоциативная сущность между заказами и блюдами
CREATE TABLE order_items (
    order_item_id SERIAL PRIMARY KEY,
    order_id      INTEGER NOT NULL,
    dish_id       INTEGER NOT NULL,
    quantity      INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 100),
    unit_price    NUMERIC(10, 2) NOT NULL CHECK (unit_price > 0),
    CONSTRAINT fk_order_items_order
        FOREIGN KEY (order_id) REFERENCES orders (order_id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_order_items_dish
        FOREIGN KEY (dish_id) REFERENCES dishes (dish_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT uq_order_items_order_dish UNIQUE (order_id, dish_id)
);

COMMENT ON TABLE order_items IS 'Состав заказа, цена фиксируется на момент оформления';

CREATE TABLE supplies (
    supply_id      SERIAL PRIMARY KEY,
    supply_date    DATE NOT NULL DEFAULT CURRENT_DATE,
    supplier       VARCHAR(150) NOT NULL,
    invoice_number VARCHAR(50) NOT NULL UNIQUE,
    amount         NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
    employee_id    INTEGER NOT NULL,
    CONSTRAINT fk_supplies_employee
        FOREIGN KEY (employee_id) REFERENCES employees (employee_id)
        ON UPDATE CASCADE ON DELETE RESTRICT
);

COMMENT ON TABLE supplies IS 'Поставки продуктов от поставщиков';

CREATE TABLE bookings (
    booking_id    SERIAL PRIMARY KEY,
    customer_name VARCHAR(150) NOT NULL,
    phone         VARCHAR(20) NOT NULL,
    booking_time  TIMESTAMPTZ NOT NULL,
    guests_count  INTEGER NOT NULL CHECK (guests_count > 0),
    table_id      INTEGER NOT NULL,
    -- Гостевая учётная запись, создавшая бронь. NULL для броней, оформленных
    -- администратором или до появления личного кабинета гостя.
    user_id       INTEGER,
    status        VARCHAR(20) NOT NULL DEFAULT 'подтверждена',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_bookings_table
        FOREIGN KEY (table_id) REFERENCES restaurant_tables (table_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT chk_bookings_phone CHECK (phone ~ '^[0-9+() -]{10,20}$'),
    CONSTRAINT chk_bookings_status CHECK (
        status IN ('новая', 'подтверждена', 'отменена', 'выполнена')
    )
);

COMMENT ON TABLE bookings IS 'Бронирования столов клиентами';


CREATE TABLE users (
    user_id       SERIAL PRIMARY KEY,
    login         VARCHAR(50) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role          VARCHAR(20) NOT NULL,
    full_name     VARCHAR(150) NOT NULL,
    employee_id   INTEGER,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_users_employee
        FOREIGN KEY (employee_id) REFERENCES employees (employee_id)
        ON UPDATE CASCADE ON DELETE SET NULL,
    CONSTRAINT chk_users_role CHECK (role IN ('admin', 'waiter', 'guest'))
);

COMMENT ON TABLE users IS 'Учётные записи для входа в веб-приложение';

-- Внешний ключ брони на пользователя добавляется отдельно: таблица users
-- создаётся после bookings, поэтому ссылку нельзя объявить внутри CREATE TABLE.
ALTER TABLE bookings
    ADD CONSTRAINT fk_bookings_user
        FOREIGN KEY (user_id) REFERENCES users (user_id)
        ON UPDATE CASCADE ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- Индексы для типовых запросов
-- ---------------------------------------------------------------------------
CREATE INDEX idx_dishes_category ON dishes (category_id);
CREATE INDEX idx_orders_employee ON orders (employee_id);
CREATE INDEX idx_orders_table ON orders (table_id);
CREATE INDEX idx_orders_created_at ON orders (created_at);
CREATE INDEX idx_order_items_order ON order_items (order_id);
CREATE INDEX idx_bookings_table_time ON bookings (table_id, booking_time);
CREATE INDEX idx_bookings_time ON bookings (booking_time);
CREATE INDEX idx_bookings_user ON bookings (user_id);
CREATE INDEX idx_supplies_date ON supplies (supply_date);

-- Активная бронь на конкретное время должна быть уникальной.
-- Отменённые и выполненные брони не мешают повторно занять тот же слот.
CREATE UNIQUE INDEX uq_bookings_active_slot
    ON bookings (table_id, booking_time)
    WHERE status IN ('новая', 'подтверждена');
