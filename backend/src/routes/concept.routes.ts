import { Router } from 'express';
import type { Request, Response } from 'express';
import { conceptAgent } from '../agents/concept-agent';
import { SettingsRepository } from '../db/repositories/settings.repo';
import { styleCurator } from '../services/style-curator.service';
import { resolveContentProfile } from 'shared';

const router = Router();

// POST /api/v1/concept/generate
router.post('/concept/generate', async (req: Request, res: Response) => {
  const { title, language, region, audience, length, profileDefaultKey, content_profile, content_type } = req.body;

  if (!title || title.trim() === '') {
    res.status(400).json({ success: false, error: 'Title is required' });
    return;
  }

  const settings = SettingsRepository.getSettings();
  if (!settings.apiKey) {
    res.status(401).json({
      success: false,
      error: 'Gemini API Key missing — configure it in Settings.',
      code: 'API_KEY_MISSING',
    });
    return;
  }

  try {
    const brief = await conceptAgent.run(
      title,
      language || 'English',
      audience || '',
      length || '',
      settings.apiKey,
      undefined,
      content_profile,
      content_type,
      region || 'auto'
    );
    
    const profile = resolveContentProfile(content_profile || 'viral_story');
    const resolvedDefaultKey = profileDefaultKey || profile.defaultVisualStyleKey;

    const styleResult = await styleCurator.curate(
      brief,
      language || 'English',
      settings.apiKey,
      resolvedDefaultKey ? { profileDefaultKey: resolvedDefaultKey } : undefined
    );
    
    res.json({
      success: true,
      brief,
      style: {
        visual_style: styleResult.visual_style,
        style_name: styleResult.style_name,
        style_id: styleResult.style_id,
        origin: styleResult.origin,
      },
      warnings: styleResult.warnings.length > 0 ? styleResult.warnings : undefined
    });
  } catch (err: any) {
    console.error('[ConceptAgent] Route error:', err);
    res.status(500).json({ success: false, error: err.message || 'Brief generation failed' });
  }
});

// POST /api/v1/concept/regenerate-topic
router.post('/concept/regenerate-topic', async (req: Request, res: Response) => {
  const { title, chosenTitle, language, region, audience, current_content_type, profileDefaultKey, content_profile, content_type } = req.body;

  if (!title || !chosenTitle) {
    res.status(400).json({ success: false, error: 'title and chosenTitle are required' });
    return;
  }

  const settings = SettingsRepository.getSettings();
  if (!settings.apiKey) {
    res.status(401).json({
      success: false,
      error: 'Gemini API Key missing — configure it in Settings.',
      code: 'API_KEY_MISSING',
    });
    return;
  }

  try {
    const updatedFields = await conceptAgent.regenerateTopic(
      title,
      chosenTitle,
      language || 'English',
      audience || '',
      settings.apiKey,
      content_profile,
      content_type,
      region || 'auto'
    );
    
    let style = null;
    let warnings: string[] | undefined = undefined;
    if (current_content_type && updatedFields.content_type !== current_content_type) {
      const briefDummy = {
        project_topic: updatedFields.project_topic,
        content_type: updatedFields.content_type,
        engagement_blueprint: updatedFields.engagement_blueprint,
      };
      const profile = resolveContentProfile(content_profile || 'viral_story');
      const resolvedDefaultKey = profileDefaultKey || profile.defaultVisualStyleKey;
      const styleResult = await styleCurator.curate(
        briefDummy,
        language || 'English',
        settings.apiKey,
        resolvedDefaultKey ? { profileDefaultKey: resolvedDefaultKey } : undefined
      );
      style = {
        visual_style: styleResult.visual_style,
        style_name: styleResult.style_name,
        style_id: styleResult.style_id,
        origin: styleResult.origin,
      };
      if (styleResult.warnings.length > 0) {
        warnings = styleResult.warnings;
      }
    }

    res.json({
      success: true,
      topic: updatedFields.project_topic,
      content_type: updatedFields.content_type,
      engagement_blueprint: updatedFields.engagement_blueprint,
      style: style || undefined,
      warnings
    });
  } catch (err: any) {
    console.error('[ConceptAgent] Route regenerate-topic error:', err);
    res.status(500).json({ success: false, error: err.message || 'Regeneration failed' });
  }
});

export default router;

