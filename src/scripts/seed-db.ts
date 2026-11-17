import { readFile } from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import { Client } from 'pg';

dotenv.config();

const databaseName = process.env.DB_NAME ?? 'iris_restaurant';

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
    const seedPath = path.resolve(__dirname, '..', '..', 'db', 'seed.sql');
    console.log('Загружаю тестовые данные:', seedPath);
    await client.query(await readFile(seedPath, 'utf8'));
    console.log('Тестовые данные загружены.');
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(
    'Ошибка загрузки тестовых данных:',
    error instanceof Error ? error.message : error
  );
  process.exit(1);
});
