import { Router, Request, Response } from 'express';
import db from '../db/connection';
import { VeoPromptRepository } from '../db/repositories/veoprompt.repo';
import { assembleVeoFullPrompt } from '../agents/veo-agent';

const router = Router();

// POST /api/v1/admin/repair-narration-wordcounts
router.post('/repair-narration-wordcounts', async (req: Request, res: Response) => {
  try {
    const phases = db.prepare('SELECT * FROM phases').all() as any[];
    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const phase of phases) {
      try {
        const text = phase.narration_text || '';
        const currentCount = phase.narration_word_count;
        const actualCount = text.trim().split(/\s+/).filter(Boolean).length;

        if (currentCount !== actualCount) {
          db.prepare('UPDATE phases SET narration_word_count = ? WHERE id = ?')
            .run(actualCount, phase.id);
          
          // Also sync in scripts raw_json table if possible
          const script = db.prepare('SELECT * FROM scripts WHERE project_id = ?').get(phase.project_id) as any;
          if (script) {
            const scriptData = JSON.parse(script.raw_json);
            const idx = scriptData.phases.findIndex((p: any) => p.phase_number === phase.phase_number);
            if (idx !== -1) {
              scriptData.phases[idx].narration_word_count = actualCount;
              db.prepare('UPDATE scripts SET raw_json = ? WHERE id = ?')
                .run(JSON.stringify(scriptData), script.id);
            }
          }
          
          updated++;
        } else {
          skipped++;
        }
      } catch (err: any) {
        errors.push(`Phase ID ${phase.id}: ${err.message}`);
      }
    }

    // Recalculate prompt numbers for all projects to fix legacy prompt numbering
    const projects = db.prepare('SELECT id FROM projects').all() as any[];
    for (const p of projects) {
      try {
        await VeoPromptRepository._recalculatePromptNumbers(p.id);
      } catch (err: any) {
        errors.push(`Project Prompt Recalculation ID ${p.id}: ${err.message}`);
      }
    }

    res.json({ updated, skipped, errors });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/admin/remove-all-warning-tags
router.post('/remove-all-warning-tags', (req: Request, res: Response) => {
  try {
    const prompts = db.prepare('SELECT * FROM veo_prompts').all() as any[];
    let updated = 0;

    for (const prompt of prompts) {
      const narration = prompt.narration || '';
      if (narration.includes('[WARNING:')) {
        const cleanNarration = narration.replace(/\[WARNING:.*?\]/g, '').trim();
        
        let rawJson = prompt.raw_json;
        try {
          const parsed = JSON.parse(prompt.raw_json);
          parsed.narration = cleanNarration;
          if (parsed.veo_full_prompt) {
            parsed.veo_full_prompt = parsed.veo_full_prompt.replace(/\[WARNING:.*?\]/g, '').trim();
          }
          rawJson = JSON.stringify(parsed);
        } catch (jsonErr) {
          // ignore
        }

        db.prepare(`
          UPDATE veo_prompts
          SET narration = ?, raw_json = ?
          WHERE id = ?
        `).run(cleanNarration, rawJson, prompt.id);

        updated++;
      }
    }

    res.json({ updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/admin/repair-veo-full-prompts
router.post('/repair-veo-full-prompts', (req: Request, res: Response) => {
  try {
    const prompts = db.prepare(`
      SELECT vp.*, s.title as scene_title FROM veo_prompts vp
      JOIN scenes s ON vp.scene_id = s.id
      WHERE vp.scene_id IS NOT NULL
    `).all() as any[];

    let updated = 0;
    let failed = 0;

    for (const prompt of prompts) {
      try {
        const parsed = JSON.parse(prompt.raw_json);
        const index = Number(prompt.prompt_number) || 1;
        const sceneTitle = prompt.scene_title || 'Untitled Scene';

        let dur = Number(parsed.duration_seconds);
        if (isNaN(dur) || !Number.isInteger(dur) || dur <= 0) {
          dur = 8;
        }
        parsed.duration_seconds = dur;
        if (!parsed.scene_type) {
          parsed.scene_type = 'standard';
        }

        // Re-assemble full prompt
        const fullPrompt = assembleVeoFullPrompt(parsed, index, sceneTitle);
        parsed.veo_full_prompt = fullPrompt;

        db.prepare(`
          UPDATE veo_prompts
          SET raw_json = ?, scene_type = ?
          WHERE id = ?
        `).run(JSON.stringify(parsed), parsed.scene_type, prompt.id);

        updated++;
      } catch (err) {
        console.error(`Failed to repair veo_full_prompt for ID ${prompt.id}:`, err);
        failed++;
      }
    }

    res.json({ updated, failed });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
