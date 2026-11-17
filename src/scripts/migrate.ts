import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import { Client } from 'pg';

dotenv.config();

/**
 * Применяет SQL-файлы из db/migrations в алфавитном порядке.
 * Каждый файл должен быть идемпотентным: повторный запуск безопасен.
 */
async function main(): Promise<void> {
  const client = new Client({
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 5432),
    user: process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
    database: process.env.DB_NAME ?? 'iris_restaurant',
  });

  await client.connect();

  try {
    const migrationsDir = path.resolve(__dirname, '..', '..', 'db', 'migrations');
    const files = (await readdir(migrationsDir))
      .filter((file) => file.endsWith('.sql'))
      .sort();

    if (files.length === 0) {
      console.log('Миграций нет — база уже актуальна.');
      return;
    }

    for (const file of files) {
      const migrationPath = path.join(migrationsDir, file);
      console.log('Применяю миграцию:', migrationPath);
      await client.query(await readFile(migrationPath, 'utf8'));
      console.log(`Миграция ${file} применена.`);
    }
  } finally {
    await client.end();
  }
}

main()
  .then(() => {
    console.log('Готово: миграции базы данных применены.');
  })
  .catch((error) => {
    console.error(
      'Ошибка применения миграций:',
      error instanceof Error ? error.message : error
    );

    if ((error as { code?: string }).code === '42P01') {
      console.error(
        'Таблицы не найдены. Сначала примените схему: npm run db:init.'
      );
    }

    if ((error as { code?: string }).code === '28P01') {
      console.error(
        'PostgreSQL отклонил пароль. Укажите правильный DB_PASSWORD в файле .env.'
      );
    }

    process.exit(1);
  });
