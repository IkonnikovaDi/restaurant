import { Router } from 'express';
import { pool } from '../config/db';
import { requireAuth } from '../middleware/auth';
import { ApiError, asyncHandler } from '../middleware/errors';
import { SessionUser, UserRole } from '../types';
import { asTrimmedString } from '../utils/validation';

export const authRouter = Router();

interface AuthRow {
  user_id: number;
  login: string;
  role: UserRole;
  full_name: string;
  employee_id: number | null;
}

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const login = asTrimmedString(req.body?.login, 50);
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!login || password.length === 0) {
      throw new ApiError(400, 'Укажите логин и пароль');
    }

    const result = await pool.query<AuthRow>(
      `SELECT user_id, login, role, full_name, employee_id
       FROM users
       WHERE login = $1
         AND password_hash = crypt($2, password_hash)`,
      [login, password]
    );

    if (result.rowCount === 0) {
      throw new ApiError(401, 'Неверный логин или пароль');
    }

    const row = result.rows[0];
    const user: SessionUser = {
      userId: row.user_id,
      login: row.login,
      role: row.role,
      fullName: row.full_name,
      employeeId: row.employee_id,
    };

    req.session.user = user;
    await new Promise<void>((resolve, reject) => {
      req.session.save((error) => (error ? reject(error) : resolve()));
    });

    res.json({ user });
  })
);

authRouter.post('/logout', (req, res) => {
  req.session.destroy((error) => {
    if (error) {
      res.status(500).json({ error: 'Не удалось завершить сессию' });
      return;
    }

    res.clearCookie('iris.sid');
    res.json({ message: 'Выход выполнен' });
  });
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.session.user });
});
