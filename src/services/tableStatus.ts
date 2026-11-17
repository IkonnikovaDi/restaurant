import { PoolClient } from 'pg';

/**
 * Пересчитывает статус стола по активным заказам и ближайшим броням.
 * Используется после смены статуса заказа или брони.
 */
export async function refreshTableStatus(client: PoolClient, tableId: number): Promise<void> {
  await client.query(
    `UPDATE restaurant_tables AS t
     SET status = CASE
       WHEN EXISTS (
         SELECT 1
         FROM orders o
         WHERE o.table_id = t.table_id
           AND o.status IN ('новый', 'готовится', 'подан')
       ) THEN 'занят'
       WHEN EXISTS (
         SELECT 1
         FROM bookings b
         WHERE b.table_id = t.table_id
           AND b.status IN ('новая', 'подтверждена')
           AND b.booking_time BETWEEN NOW() - INTERVAL '1 hour'
                                  AND NOW() + INTERVAL '24 hours'
       ) THEN 'забронирован'
       ELSE 'свободен'
     END
     WHERE t.table_id = $1`,
    [tableId]
  );
}
