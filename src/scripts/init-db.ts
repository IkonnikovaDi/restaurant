import { readFile } from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import { Client } from 'pg';

dotenv.config();

const host = process.env.DB_HOST ?? 'localhost';
const port = Number(process.env.DB_PORT ?? 5432);
const user = process.env.DB_USER ?? 'postgres';
const password = process.env.DB_PASSWORD ?? 'postgres';
const databaseName = process.env.DB_NAME ?? 'iris_restaurant';

function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

async function main(): Promise<void> {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(databaseName)) {
    throw new Error(
      'Имя базы данных может содержать только латинские буквы, цифры и подчёркивания'
    );
  }

  const adminClient = new Client({
    host,
    port,
    user,
    password,
    database: 'postgres',
  });

  await adminClient.connect();

  try {
    const exists = await adminClient.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [databaseName]
    );

    if ((exists.rowCount ?? 0) === 0) {
      await adminClient.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
      console.log(`База данных «${databaseName}» создана.`);
    } else {
      console.log(`База данных «${databaseName}» уже существует.`);
    }
  } finally {
    await adminClient.end();
  }

  const client = new Client({
    host,
    port,
    user,
    password,
    database: databaseName,
  });

  await client.connect();

  try {
    const schemaPath = path.resolve(__dirname, '..', '..', 'db', 'schema.sql');
    const seedPath = path.resolve(__dirname, '..', '..', 'db', 'seed.sql');
    const triggersPath = path.resolve(__dirname, '..', '..', 'db', 'triggers.sql');

    console.log('Применяю схему:', schemaPath);
    await client.query(await readFile(schemaPath, 'utf8'));
    console.log('Схема применена.');

    console.log('Загружаю тестовые данные:', seedPath);
    await client.query(await readFile(seedPath, 'utf8'));
    console.log('Тестовые данные загружены.');

    console.log('Применяю триггеры:', triggersPath);
    await client.query(await readFile(triggersPath, 'utf8'));
    console.log('Триггеры применены.');
  } finally {
    await client.end();
  }
}

main()
  .then(() => {
    console.log(
      'Инициализация БД завершена. Демо-вход: admin / admin123, guest / guest123.'
    );
  })
  .catch((error) => {
    console.error(
      'Ошибка инициализации БД:',
      error instanceof Error ? error.message : error
    );

    if ((error as { code?: string }).code === '28P01') {
      console.error(
        'PostgreSQL отклонил пароль. Укажите правильный DB_PASSWORD в файле .env и повторите npm run db:init.'
      );
    }

    process.exit(1);
  });
