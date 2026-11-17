require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || 'iris_restaurant',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

(async () => {
  try {
    const tz = await pool.query("select current_setting('TimeZone') as tz, now() as n");
    console.log('TZ', tz.rows);

    const bookings = await pool.query(
      `select booking_id, customer_name, phone, booking_time,
              booking_time::date as d, table_id, status, created_at
         from bookings order by booking_id`
    );
    console.log('BOOKINGS', bookings.rows);

    const indexes = await pool.query(
      "select indexname, indexdef from pg_indexes where tablename = 'bookings'"
    );
    console.log('INDEXES', indexes.rows);

    const triggers = await pool.query(
      "select tgname, pg_get_triggerdef(oid) as def from pg_trigger where tgrelid = 'bookings'::regclass and not tgisinternal"
    );
    console.log('TRIGGERS', triggers.rows);

    const tables = await pool.query(
      'select table_id, table_number, status from restaurant_tables order by table_id'
    );
    console.log('TABLES', tables.rows);
  } catch (error) {
    console.error('ERR', error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
