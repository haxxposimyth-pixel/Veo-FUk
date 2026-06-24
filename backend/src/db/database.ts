import Database from 'better-sqlite3';
import path from 'path';

// Resolve database file path
const dbPath = path.resolve(__dirname, '../../database.sqlite');
const db = new Database(dbPath);

// Enable foreign key support
db.pragma('foreign_keys = ON');

/**
 * Initializes the SQLite schema. Creates all tables if they do not exist.
 */
export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      topic TEXT NOT NULL,
      visual_style TEXT NOT NULL,
      language TEXT NOT NULL,
      aspect_ratio TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS production_bibles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL UNIQUE,
      json_data TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS scripts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL UNIQUE,
      json_data TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS phases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      phase_number INTEGER NOT NULL,
      phase_title TEXT NOT NULL,
      phase_content TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      UNIQUE(project_id, phase_number),
      FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS scenes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      phase_number INTEGER NOT NULL,
      scene_number INTEGER NOT NULL,
      json_data TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      UNIQUE(project_id, phase_number, scene_number),
      FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS veo_prompts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      phase_number INTEGER NOT NULL,
      scene_number INTEGER NOT NULL,
      json_data TEXT NOT NULL,
      UNIQUE(project_id, phase_number, scene_number),
      FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
    );
  `);
}

export default db;
