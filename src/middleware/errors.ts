import { NextFunction, Request, Response } from 'express';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type AsyncRouteHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<unknown>;

export function asyncHandler(handler: AsyncRouteHandler) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

interface PgErrorLike {
  code?: string;
  constraint?: string;
  detail?: string;
}

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (error instanceof ApiError) {
    res.status(error.status).json({ error: error.message });
    return;
  }

  const pgError = error as PgErrorLike;

  switch (pgError?.code) {
    case '23505':
      res.status(409).json({
        error: 'Запись с такими данными уже существует',
        details: pgError.detail,
      });
      return;
    case '23503':
      res.status(409).json({
        error: 'Операция нарушает ссылочную целостность данных',
        details: pgError.detail,
      });
      return;
    case '23514':
      res.status(400).json({
        error: 'Значение не проходит проверку ограничений базы данных',
        details: pgError.detail,
      });
      return;
    case '22P02':
      res.status(400).json({ error: 'Некорректный формат переданных данных' });
      return;
    default:
      break;
  }

  console.error('Необработанная ошибка сервера:', error);
  res.status(500).json({ error: 'Внутренняя ошибка сервера' });
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: 'Маршрут не найден' });
}
