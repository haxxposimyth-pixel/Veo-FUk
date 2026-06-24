import fs from 'fs';
import path from 'path';

// Define DB paths
const prodDbPath = path.resolve('backend/data/viral-video-studio.db');
const tempDbPath = path.resolve('backend/data/viral-video-studio-temp.db');

console.log('prodDbPath exists:', fs.existsSync(prodDbPath), 'at', prodDbPath);

console.log('Copying production database to temp...');
fs.copyFileSync(prodDbPath, tempDbPath);
console.log('tempDbPath exists:', fs.existsSync(tempDbPath), 'at', tempDbPath);

// Set environment variable before requiring database connection
process.env.DB_PATH = './backend/data/viral-video-studio-temp.db';

// Require instead of import to prevent ES6 import hoisting
const dbModule = require('../db/connection');
const db = dbModule.default;
const absoluteDbPath = dbModule.absoluteDbPath;
console.log('Resolved DB Path from connection:', absoluteDbPath);

const { BibleRepository } = require('../db/repositories/bible.repo');
const { ScriptRepository } = require('../db/repositories/script.repo');
const { SceneRepository } = require('../db/repositories/scene.repo');
const { SettingsRepository } = require('../db/repositories/settings.repo');
const { sceneAgent } = require('../agents/scene-agent');

async function main() {
  const projectId = 'b6eeaddf-0c57-478b-a6ef-3b79960cb9c4';
  const phaseNumber = 1;

  try {
    const projCheck = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
    console.log('Project check in DB:', projCheck);

    console.log('\n--- FETCHING OLD SCENE DESCRIPTIONS ---');
    const oldScenes = db.prepare('SELECT scene_number, title, scene_description, narration_fragment FROM scenes WHERE project_id = ? AND phase_number = ? ORDER BY scene_number ASC').all(projectId, phaseNumber) as any[];
    oldScenes.forEach((s) => {
      console.log(`Scene ${s.scene_number}: [${s.title}] ${s.scene_description}`);
    });

    const bible = BibleRepository.findByProjectId(projectId);
    if (!bible) throw new Error('Bible not found');
    const bibleData = JSON.parse(bible.raw_json);

    const phase = ScriptRepository.findPhaseByNumber(projectId, phaseNumber);
    if (!phase) throw new Error('Phase not found');

    const settings = SettingsRepository.getSettings();

    const phaseItem = {
      phase_number: phase.phase_number,
      phase_type: phase.phase_type as any,
      phase_title: phase.phase_title,
      phase_content: phase.phase_content,
      narration_text: phase.narration_text ?? '',
      narration_word_count: phase.narration_word_count ?? 0,
      key_events: [],
      character_ids_active: [],
      location_id_primary: '',
      estimated_duration_seconds: 0,
      viral_hook_rating: 0,
    };

    console.log('\n--- RUNNING SCENE AGENT (DRY RUN) ---');
    const result = await sceneAgent.run(
      phaseItem,
      bibleData,
      projectId,
      phaseNumber,
      0,
      undefined,
      settings.model,
      { temperature: settings.temperature, maxOutputTokens: settings.maxTokens }
    );

    console.log('\n--- NEW GENERATED SCENE DESCRIPTIONS ---');
    result.scenes.forEach((s: any) => {
      console.log(`Scene ${s.scene_number}: [${s.title}] ${s.scene_description}`);
    });

    console.log('\n--- COMPARISON ANALYSIS ---');
    const old1 = oldScenes[0]?.scene_description || '';
    const old2 = oldScenes[1]?.scene_description || '';
    const new1 = result.scenes[0]?.scene_description || '';
    const new2 = result.scenes[1]?.scene_description || '';

    const isOld1CloseUp = old1.toLowerCase().includes('close-up') || old1.toLowerCase().includes('closeup');
    const isOld2CloseUp = old2.toLowerCase().includes('close-up') || old2.toLowerCase().includes('closeup');
    const isNew1DocStyle = new1.toLowerCase().includes('distribution') || new1.toLowerCase().includes('worker') || new1.toLowerCase().includes('scale') || new1.toLowerCase().includes('process') || new1.toLowerCase().includes('truck') || new1.toLowerCase().includes('market') || new1.toLowerCase().includes('logistics') || new1.toLowerCase().includes('wholesale');
    const isNew2DocStyle = new2.toLowerCase().includes('fuel') || new2.toLowerCase().includes('station') || new2.toLowerCase().includes('queue') || new2.toLowerCase().includes('attendant') || new2.toLowerCase().includes('transfer') || new2.toLowerCase().includes('logistics') || new2.toLowerCase().includes('tanker');

    console.log(`Old Scene 1: ${old1}`);
    console.log(`New Scene 1: ${new1}`);
    console.log(`Old Scene 2: ${old2}`);
    console.log(`New Scene 2: ${new2}`);

    const passed = (isNew1DocStyle || !new1.toLowerCase().includes('extreme close-up')) && (isNew2DocStyle || !new2.toLowerCase().includes('close-up of a gasoline nozzle'));
    console.log(`\nVerification Judgment: ${passed ? 'PASS' : 'FAIL'}`);

    db.close();
    // Delete temp DB
    console.log('\nDeleting temp database...');
    fs.unlinkSync(tempDbPath);
    console.log('Done.');

  } catch (error) {
    console.error('Error during dry run:', error);
    try {
      db.close();
    } catch {}
  }
}

main();
