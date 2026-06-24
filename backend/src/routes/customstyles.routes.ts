import { Router } from 'express';
import type { Request, Response } from 'express';
import { CustomStyleRepository } from '../db/repositories/customstyle.repo';

const router = Router();

// GET /api/v1/custom-styles
router.get('/', (_req: Request, res: Response) => {
  const styles = CustomStyleRepository.findAll();
  res.json({ success: true, data: styles });
});

// POST /api/v1/custom-styles
router.post('/', (req: Request, res: Response) => {
  const { name, description, render_family } = req.body;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    res.status(400).json({ success: false, error: 'Style name is required.' });
    return;
  }
  if (!description || typeof description !== 'string' || description.trim().length === 0) {
    res.status(400).json({ success: false, error: 'Style description is required.' });
    return;
  }

  const style = CustomStyleRepository.create(name.trim(), description.trim(), render_family);
  res.status(201).json({ success: true, data: style });
});

// PUT /api/v1/custom-styles/:id
router.put('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, description, render_family } = req.body;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    res.status(400).json({ success: false, error: 'Style name is required.' });
    return;
  }
  if (!description || typeof description !== 'string' || description.trim().length === 0) {
    res.status(400).json({ success: false, error: 'Style description is required.' });
    return;
  }

  const style = CustomStyleRepository.update(id, name.trim(), description.trim(), render_family);

  if (!style) {
    res.status(404).json({ success: false, error: 'Custom style not found.' });
    return;
  }
  res.json({ success: true, data: style });
});

// DELETE /api/v1/custom-styles/:id
router.delete('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const deleted = CustomStyleRepository.delete(id);
  if (!deleted) {
    res.status(404).json({ success: false, error: 'Custom style not found.' });
    return;
  }
  res.status(204).send();
});

export default router;
