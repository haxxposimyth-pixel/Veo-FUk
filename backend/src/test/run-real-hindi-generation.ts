import { storyPlannerAgent } from '../agents/story-planner-agent';
import { productionBibleAgent } from '../agents/production-bible-agent';
import db from '../db/connection';
import crypto from 'crypto';

async function test() {
  console.log('=== RUNNING REAL HINDI GENERATION TEST ===\n');
  const projectId = 'test-hindi-' + crypto.randomUUID().slice(0, 8);
  const topic = 'A day in the life of a local tea stall (Chai Tapri) owner in a busy Indian market street.';
  const visualStyle = 'Cinematic Realism';
  const language = 'Hindi';
  const aspectRatio = '16:9';

  console.log(`Creating project: ${projectId}`);
  db.prepare(`
    INSERT INTO projects (id, title, topic, status, visual_style, narration_language, aspect_ratio)
    VALUES (?, 'Chai Tapri Story', ?, 'setup', ?, ?, ?)
  `).run(projectId, topic, visualStyle, language, aspectRatio);

  try {
    console.log('\n--- 1. Generating Story Plan ---');
    const storyPlan = await storyPlannerAgent.run(
      topic,
      visualStyle,
      language,
      aspectRatio,
      projectId,
      undefined,
      'gemini-2.5-flash'
    );
    console.log('Story Plan Outline:', storyPlan.story_outline);
    console.log('Character List:', JSON.stringify(storyPlan.character_list, null, 2));
    console.log('Location List:', JSON.stringify(storyPlan.location_list, null, 2));
    console.log('Object List:', JSON.stringify(storyPlan.object_list, null, 2));

    console.log('\n--- 2. Generating Production Bible ---');
    const bible = await productionBibleAgent.run(
      topic,
      visualStyle,
      language,
      aspectRatio,
      projectId,
      undefined,
      'gemini-2.5-flash',
      undefined,
      undefined,
      undefined,
      storyPlan
    );

    console.log('Production Bible Meta:', JSON.stringify(bible.meta, null, 2));
    if (bible.character_roster && bible.character_roster.length > 0) {
      console.log('\n--- 3. Sample Character Roster Entry & Appearance Lock ---');
      const char = bible.character_roster[0];
      console.log('Character Name:', char.name);
      console.log('Role:', char.role);
      console.log('Description:', char.physical_description);
      console.log('Appearance Lock Details:');
      console.log(JSON.stringify(char.appearance_lock, null, 2));
    }

  } catch (err: any) {
    console.error('Error during generation:', err);
  } finally {
    console.log(`\nCleaning up project: ${projectId}`);
    db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
    db.prepare('DELETE FROM production_bibles WHERE project_id = ?').run(projectId);
    db.close();
  }
}

test().catch(console.error);
