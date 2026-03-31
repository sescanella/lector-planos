import { Router, Request, Response } from 'express';
import { getPool } from '../db';
import { isValidUUID } from '../utils/validation';

const router = Router();

const VALID_FIELD_TYPES = ['material', 'union', 'cut', 'metadata'];
const VALID_CORRECTION_TYPES = ['add', 'modify', 'delete'];

// GET /api/v1/spools/:spoolId — Get extracted spool data
router.get('/:spoolId', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    if (!pool) {
      res.status(500).json({ error: 'internal_error', message: 'Database not available' });
      return;
    }

    const spoolId = req.params.spoolId as string;
    if (!isValidUUID(spoolId)) {
      res.status(400).json({ error: 'validation_error', message: 'Invalid spool ID format' });
      return;
    }

    const { rows: spoolRows } = await pool.query(
      'SELECT spool_id, file_id, page_number, spool_number, confidence_score, created_at, updated_at FROM spool WHERE spool_id = $1',
      [spoolId]
    );

    if (spoolRows.length === 0) {
      res.status(404).json({ error: 'not_found', message: 'Spool not found', resource_id: spoolId });
      return;
    }

    const spool = spoolRows[0];

    const [materials, unions, cuts, metadata] = await Promise.all([
      pool.query(
        'SELECT material_id, material_type, quantity, unit, specification, confidence_score FROM material WHERE spool_id = $1',
        [spoolId]
      ),
      pool.query(
        'SELECT union_id, union_type, size, quantity, specification, confidence_score FROM spool_union WHERE spool_id = $1',
        [spoolId]
      ),
      pool.query(
        'SELECT cut_id, cut_type, location, angle, quantity, specification, confidence_score FROM cut WHERE spool_id = $1',
        [spoolId]
      ),
      pool.query(
        'SELECT drawing_number, revision, date_created, material_grade, pressure_rating, temperature_rating, total_weight, weight_unit, notes, confidence_score FROM spool_metadata WHERE spool_id = $1',
        [spoolId]
      ),
    ]);

    res.json({
      spool_id: spool.spool_id,
      spool_number: spool.spool_number,
      confidence_score: spool.confidence_score,
      metadata: metadata.rows[0] || null,
      materials: materials.rows,
      unions: unions.rows,
      cuts: cuts.rows,
    });
  } catch (err) {
    console.error('Error getting spool:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'internal_error', message: 'An unexpected error occurred' });
  }
});

// POST /api/v1/spools/:spoolId/corrections — Submit correction
router.post('/:spoolId/corrections', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    if (!pool) {
      res.status(500).json({ error: 'internal_error', message: 'Database not available' });
      return;
    }

    const spoolId = req.params.spoolId as string;
    if (!isValidUUID(spoolId)) {
      res.status(400).json({ error: 'validation_error', message: 'Invalid spool ID format' });
      return;
    }

    const { rows: spoolRows } = await pool.query(
      'SELECT spool_id FROM spool WHERE spool_id = $1',
      [spoolId]
    );

    if (spoolRows.length === 0) {
      res.status(404).json({ error: 'not_found', message: 'Spool not found', resource_id: spoolId });
      return;
    }

    const { field_type, field_id, original_value, corrected_value, correction_type } = req.body || {};

    if (!field_type || !VALID_FIELD_TYPES.includes(field_type)) {
      res.status(400).json({
        error: 'validation_error',
        message: 'Invalid field_type',
        details: [{ field: 'field_type', message: `Must be one of: ${VALID_FIELD_TYPES.join(', ')}` }],
      });
      return;
    }

    if (!correction_type || !VALID_CORRECTION_TYPES.includes(correction_type)) {
      res.status(400).json({
        error: 'validation_error',
        message: 'Invalid correction_type',
        details: [{ field: 'correction_type', message: `Must be one of: ${VALID_CORRECTION_TYPES.join(', ')}` }],
      });
      return;
    }

    if (original_value === undefined || corrected_value === undefined) {
      res.status(400).json({
        error: 'validation_error',
        message: 'Missing required fields',
        details: [{ field: 'original_value/corrected_value', message: 'Both values are required' }],
      });
      return;
    }

    const { rows } = await pool.query(
      `INSERT INTO correction (spool_id, field_type, field_id, original_value, corrected_value, correction_type)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING correction_id, spool_id, created_at`,
      [spoolId, field_type, field_id || null, original_value, corrected_value, correction_type]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Error creating correction:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'internal_error', message: 'An unexpected error occurred' });
  }
});

export default router;
