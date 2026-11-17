import { NextFunction, Request, Response } from 'express';
import { UserRole } from '../types';

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.user) {
    res.status(401).json({ error: 'Требуется авторизация' });
    return;
  }

  next();
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.session.user;

    if (!user) {
      res.status(401).json({ error: 'Требуется авторизация' });
      return;
    }

    if (!roles.includes(user.role)) {
      res.status(403).json({ error: 'Недостаточно прав для выполнения операции' });
      return;
    }

    next();
  };
}
