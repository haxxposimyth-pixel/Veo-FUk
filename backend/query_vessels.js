const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.resolve('data/viral-video-studio.db');
const db = new Database(dbPath);

const promptIds = [
  '9e5d7f62-6748-410d-b7ea-6cd20711b076',
  'fa17ccb9-d2b6-439d-bab9-51f8c06f064d',
  'f9095742-a45b-4d7c-b986-ca0d10df11b2',
  '786b069e-9e84-4ea1-a8d3-c1ce1f892010'
];

for (const id of promptIds) {
  const row = db.prepare('SELECT id, project_id, phase_number, scene_number, prompt_number, visual, avoid, connection, raw_json FROM veo_prompts WHERE id = ?').get(id);
  if (row) {
    console.log(`\nPrompt Row ID: ${row.id}`);
    console.log(`  Project ID: ${row.project_id}`);
    console.log(`  Phase Number: ${row.phase_number}`);
    console.log(`  Scene Number: ${row.scene_number}`);
    console.log(`  Prompt Number: ${row.prompt_number}`);
    console.log(`  Visual: ${row.visual}`);
    console.log(`  Avoid: ${row.avoid}`);
    console.log(`  Connection: ${row.connection}`);
  } else {
    console.log(`Prompt ID ${id} not found`);
  }
}
db.close();
