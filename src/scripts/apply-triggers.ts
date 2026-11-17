import { readFile } from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import { Client } from 'pg';

dotenv.config();

const databaseName = process.env.DB_NAME ?? 'iris_restaurant';

/**
 * Применяет db/triggers.sql к существующей базе данных.
 * Скрипт идемпотентен: триггеры пересоздаются, функции обновляются.
 */
async function main(): Promise<void> {
  const client = new Client({
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 5432),
    user: process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
    database: databaseName,
  });

  await client.connect();

  try {
    const triggersPath = path.resolve(__dirname, '..', '..', 'db', 'triggers.sql');

    console.log('Применяю триггеры:', triggersPath);
    await client.query(await readFile(triggersPath, 'utf8'));
    console.log('Триггеры применены.');
  } finally {
    await client.end();
  }
}

main()
  .then(() => {
    console.log('Готово: триггеры базы данных обновлены.');
  })
  .catch((error) => {
    console.error(
      'Ошибка применения триггеров:',
      error instanceof Error ? error.message : error
    );

    if ((error as { code?: string }).code === '42P01') {
      console.error(
        'Таблицы не найдены. Сначала примените схему: npm run db:init или psql -f db/schema.sql.'
      );
    }

    if ((error as { code?: string }).code === '28P01') {
      console.error(
        'PostgreSQL отклонил пароль. Укажите правильный DB_PASSWORD в файле .env.'
      );
    }

    process.exit(1);
  });
