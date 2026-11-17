import { Router } from 'express';
import { pool } from '../config/db';
import { requireRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/errors';

export const employeesRouter = Router();

employeesRouter.get(
  '/employees',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const position = typeof req.query.position === 'string' ? req.query.position : null;

    const result = await pool.query(
      `SELECT employee_id AS "employeeId",
              last_name AS "lastName",
              first_name AS "firstName",
              middle_name AS "middleName",
              position,
              phone,
              is_active AS "isActive",
              last_name || ' ' || first_name || COALESCE(' ' || middle_name, '') AS "fullName"
       FROM employees
       WHERE is_active = TRUE
         AND ($1::text IS NULL OR position = $1)
       ORDER BY position, last_name, first_name`,
      [position]
    );

    res.json({ employees: result.rows });
  })
);
