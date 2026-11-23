import { NextFunction, Request, Response } from 'express';
import { UserRole } from '../types';

const KNOWN_ROLES: readonly UserRole[] = ['admin', 'waiter', 'guest'];

/**
 * Проверяет, что в сессии есть авторизованный пользователь.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.user) {
    res.status(401).json({ error: 'Требуется авторизация' });
    return;
  }

  next();
}

/**
 * Проверяет, что роль пользователя входит в список разрешённых.
 * Неизвестные роли считаются невалидными и получают 403.
 */
export function requireRole(...roles: UserRole[]) {
  if (roles.length === 0) {
    throw new Error('requireRole должен получить хотя бы одну роль');
  }

  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.session.user;

    if (!user) {
      res.status(401).json({ error: 'Требуется авторизация' });
      return;
    }

    if (!KNOWN_ROLES.includes(user.role) || !roles.includes(user.role)) {
      res.status(403).json({ error: 'Недостаточно прав для выполнения операции' });
      return;
    }

    next();
  };
}

/** Только администратор. */
export const requireAdmin = requireRole('admin');

/** Только официант. */
export const requireWaiter = requireRole('waiter');

/** Сотрудник ресторана: администратор или официант. */
export const requireStaff = requireRole('admin', 'waiter');

/** Только гость. */
export const requireGuest = requireRole('guest');
