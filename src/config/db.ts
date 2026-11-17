import { Pool, PoolClient, PoolConfig } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

export const dbConfig: PoolConfig = {
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  database: process.env.DB_NAME ?? 'iris_restaurant',
  user: process.env.DB_USER ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
};

export const pool = new Pool(dbConfig);

pool.on('error', (error) => {
  console.error('Неожиданная ошибка PostgreSQL:', error.message);
});

export async function checkDatabaseConnection(): Promise<void> {
  await pool.query('SELECT 1');
}

/**
 * Выполняет callback в транзакции и автоматически управляет COMMIT/ROLLBACK.
 */
export async function withTransaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Транзакция могла уже завершиться — исходную ошибку сохраняем.
    }
    throw error;
  } finally {
    client.release();
  }
}
