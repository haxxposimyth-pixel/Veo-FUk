import db from '../connection';
import crypto from 'crypto';
import type { CustomStyle } from 'shared';

export const CustomStyleRepository = {
  findAll(): CustomStyle[] {
    return db.prepare('SELECT * FROM custom_styles ORDER BY updated_at DESC').all() as CustomStyle[];
  },

  findById(id: string): CustomStyle | null {
    const row = db.prepare('SELECT * FROM custom_styles WHERE id = ?').get(id);
    return row ? (row as CustomStyle) : null;
  },

  create(name: string, description: string, renderFamily?: string | null): CustomStyle {
    const id = crypto.randomUUID();
    db.prepare(
      'INSERT INTO custom_styles (id, name, description, render_family) VALUES (?, ?, ?, ?)'
    ).run(id, name, description, renderFamily || null);
    return this.findById(id)!;
  },

  update(id: string, name: string, description: string, renderFamily?: string | null): CustomStyle | null {
    db.prepare(
      'UPDATE custom_styles SET name = ?, description = ?, render_family = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(name, description, renderFamily || null, id);
    return this.findById(id);
  },

  delete(id: string): boolean {
    const result = db.prepare('DELETE FROM custom_styles WHERE id = ?').run(id);
    return result.changes > 0;
  },
};

