import { Router } from 'express';
import { pool } from '../config/db';
import { requireRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/errors';

export const suppliesRouter = Router();

suppliesRouter.get(
  '/supplies',
  requireRole('admin'),
  asyncHandler(async (_req, res) => {
    const result = await pool.query(
      `SELECT s.supply_id AS "supplyId",
              s.supply_date AS "supplyDate",
              s.supplier,
              s.invoice_number AS "invoiceNumber",
              s.amount::float8 AS amount,
              s.employee_id AS "employeeId",
              e.last_name || ' ' || e.first_name AS "employeeName"
       FROM supplies s
       JOIN employees e ON e.employee_id = s.employee_id
       ORDER BY s.supply_date DESC, s.supply_id DESC
       LIMIT 200`
    );

    res.json({ supplies: result.rows });
  })
);
