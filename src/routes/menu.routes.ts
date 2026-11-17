import { Router } from 'express';
import { pool } from '../config/db';
import { ApiError, asyncHandler } from '../middleware/errors';
import { asPositiveInt, asTrimmedString } from '../utils/validation';

export const menuRouter = Router();

interface CategoryWithDishesRow {
  categoryId: number;
  name: string;
  description: string | null;
  sortOrder: number;
  dishes: unknown[];
}

menuRouter.get(
  '/menu',
  asyncHandler(async (_req, res) => {
    const result = await pool.query<CategoryWithDishesRow>(
      `SELECT c.category_id AS "categoryId",
              c.name,
              c.description,
              c.sort_order AS "sortOrder",
              COALESCE(
                json_agg(
                  json_build_object(
                    'dishId', d.dish_id,
                    'name', d.name,
                    'price', d.price,
                    'weightGrams', d.weight_grams,
                    'description', d.description,
                    'isAvailable', d.is_available
                  ) ORDER BY d.name
                ) FILTER (WHERE d.dish_id IS NOT NULL),
                '[]'::json
              ) AS dishes
       FROM categories c
       LEFT JOIN dishes d
         ON d.category_id = c.category_id
        AND d.is_available = TRUE
       WHERE c.is_active = TRUE
       GROUP BY c.category_id
       ORDER BY c.sort_order, c.name`
    );

    res.json({ categories: result.rows });
  })
);

menuRouter.get(
  '/categories',
  asyncHandler(async (req, res) => {
    const isAdmin = req.session.user?.role === 'admin';
    const result = await pool.query(
      `SELECT c.category_id AS "categoryId",
              c.name,
              c.description,
              c.sort_order AS "sortOrder",
              c.is_active AS "isActive",
              COUNT(d.dish_id)::int AS "dishesCount"
       FROM categories c
       LEFT JOIN dishes d ON d.category_id = c.category_id
       WHERE ($1::boolean = TRUE OR c.is_active = TRUE)
       GROUP BY c.category_id
       ORDER BY c.sort_order, c.name`,
      [isAdmin]
    );

    res.json({ categories: result.rows });
  })
);

menuRouter.get(
  '/dishes',
  asyncHandler(async (req, res) => {
    let categoryId: number | null = null;
    if (req.query.category_id !== undefined) {
      categoryId = asPositiveInt(req.query.category_id);
      if (categoryId === null) {
        throw new ApiError(400, 'Некорректный идентификатор категории');
      }
    }

    let search: string | null = null;
    if (req.query.search !== undefined) {
      search = asTrimmedString(req.query.search, 100);
      if (search === null) {
        throw new ApiError(400, 'Некорректная поисковая строка');
      }
    }

    const isAdmin = req.session.user?.role === 'admin';
    const result = await pool.query(
      `SELECT d.dish_id AS "dishId",
              d.name,
              d.price,
              d.weight_grams AS "weightGrams",
              d.description,
              d.is_available AS "isAvailable",
              d.category_id AS "categoryId",
              c.name AS "categoryName"
       FROM dishes d
       JOIN categories c ON c.category_id = d.category_id
       WHERE ($1::int IS NULL OR d.category_id = $1)
         AND (
           $2::text IS NULL
           OR d.name ILIKE '%' || $2 || '%'
           OR COALESCE(d.description, '') ILIKE '%' || $2 || '%'
         )
         AND (d.is_available = TRUE OR $3::boolean = TRUE)
       ORDER BY c.sort_order, d.name`,
      [categoryId, search, isAdmin]
    );

    res.json({ dishes: result.rows });
  })
);

menuRouter.get(
  '/dishes/:id',
  asyncHandler(async (req, res) => {
    const dishId = asPositiveInt(req.params.id);
    if (dishId === null) {
      throw new ApiError(400, 'Некорректный идентификатор блюда');
    }

    const isAdmin = req.session.user?.role === 'admin';
    const result = await pool.query(
      `SELECT d.dish_id AS "dishId",
              d.name,
              d.price,
              d.weight_grams AS "weightGrams",
              d.description,
              d.is_available AS "isAvailable",
              d.category_id AS "categoryId",
              c.name AS "categoryName"
       FROM dishes d
       JOIN categories c ON c.category_id = d.category_id
       WHERE d.dish_id = $1
         AND (d.is_available = TRUE OR $2::boolean = TRUE)`,
      [dishId, isAdmin]
    );

    if (result.rowCount === 0) {
      throw new ApiError(404, 'Блюдо не найдено');
    }

    res.json({ dish: result.rows[0] });
  })
);
