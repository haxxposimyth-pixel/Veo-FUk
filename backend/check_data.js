const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new Database(dbPath);

const projects = db.prepare('SELECT * FROM projects').all();
console.log('Projects:', projects);

if (projects.length > 0) {
  const scenes = db.prepare('SELECT * FROM scenes WHERE project_id = ?').all(projects[0].id);
  console.log('Scenes in first project:', scenes.map(s => ({ id: s.id, phase: s.phase_number, scene: s.scene_number, veo_prompt_generated: s.veo_prompt_generated })));
}
