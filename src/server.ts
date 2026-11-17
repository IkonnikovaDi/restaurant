import path from 'node:path';
import dotenv from 'dotenv';
import express from 'express';
import session from 'express-session';

import './types';
import { checkDatabaseConnection } from './config/db';
import { errorHandler, notFoundHandler } from './middleware/errors';
import { authRouter } from './routes/auth.routes';
import { bookingsRouter } from './routes/bookings.routes';
import { employeesRouter } from './routes/employees.routes';
import { menuRouter } from './routes/menu.routes';
import { ordersRouter } from './routes/orders.routes';
import { suppliesRouter } from './routes/supplies.routes';
import { tablesRouter } from './routes/tables.routes';

dotenv.config();

const app = express();
const port = Number(process.env.PORT ?? 3000);
const publicDir = path.join(__dirname, '..', 'public');
const sessionSecret = process.env.SESSION_SECRET ?? 'iris_restaurant_dev_secret_change_me';

if (!process.env.SESSION_SECRET) {
  console.warn(
    'SESSION_SECRET не задан в .env — используется значение по умолчанию для разработки.'
  );
}

app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));

app.use(
  session({
    name: 'iris.sid',
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 8 * 60 * 60 * 1000,
    },
  })
);

app.use('/api/auth', authRouter);
app.use('/api', menuRouter);
app.use('/api', tablesRouter);
app.use('/api', employeesRouter);
app.use('/api', suppliesRouter);
app.use('/api', ordersRouter);
app.use('/api', bookingsRouter);

app.get('/', (req, res) => {
  res.redirect(req.session.user ? '/index.html' : '/login.html');
});

app.use('/api', notFoundHandler);
app.use(express.static(publicDir, { index: false }));
app.use(errorHandler);

async function start(): Promise<void> {
  try {
    await checkDatabaseConnection();
    console.log('Подключение к PostgreSQL установлено.');
  } catch (error) {
    console.error('Не удалось подключиться к PostgreSQL.');
    console.error(error instanceof Error ? error.message : error);
    console.error('Проверьте параметры в .env и выполните npm run db:init.');
    process.exit(1);
  }

  app.listen(port, () => {
    console.log(`Ресторан «Ирис» запущен: http://localhost:${port}/login.html`);
  });
}

void start();

export { app };
