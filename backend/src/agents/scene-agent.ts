import { BaseAgent } from './base-agent';
import { getSceneSystemPrompt, getSceneUserPrompt } from '../prompts/scene.prompt';
import { sceneAgentOutputSchema, sceneItemSchema, SceneBreakdownData, ProductionBibleData, ScriptPhaseItem, MIN_NARRATION_WORDS_PER_SCENE, getWordCount, getRequiredClipCount, splitNarrationIntoFragments, getSentenceParts, resolveLanguageRules, resolveContentProfile, getProfilePacingFactor, getDurationAwareClipCount } from 'shared';
import logger from '../utils/logger';
import db from '../db/connection';
import crypto from 'crypto';
import { z } from 'zod';
import { SceneRepository } from '../db/repositories/scene.repo';
import { ContinuityRepository } from '../db/repositories/continuity.repo';
import { getNextCamera } from './veo-agent';

// Migrate DB schema safely
try {
  db.exec('ALTER TABLE scenes ADD COLUMN visual_state_snapshot TEXT DEFAULT NULL;');
} catch (e) {
  // Column already exists or table is locked
}
try {
  db.exec('ALTER TABLE scenes ADD COLUMN continuity_stale INTEGER DEFAULT 0;');
} catch (e) {
  // Column already exists or table is locked
}

import { extendedSceneItemSchema, extendedSceneAgentOutputSchema, strictVisualStateSnapshotSchema } from 'shared';

// Monkeypatch SceneRepository to support visual_state_snapshot
const originalCreateOrUpdateBatch = SceneRepository.createOrUpdateBatch;
SceneRepository.createOrUpdateBatch = function (
  projectId: string,
  phaseId: string,
  phaseNumber: number,
  scenes: any[]
) {
  const result = originalCreateOrUpdateBatch.call(this, projectId, phaseId, phaseNumber, scenes);
  try {
    const updateStmt = db.prepare('UPDATE scenes SET visual_state_snapshot = ? WHERE project_id = ? AND phase_number = ? AND scene_number = ?');
    db.transaction(() => {
      for (const s of scenes) {
        const snapshotStr = s.visual_state_snapshot ? JSON.stringify(s.visual_state_snapshot) : null;
        updateStmt.run(snapshotStr, projectId, phaseNumber, s.scene_number);
      }
    })();
  } catch (err: any) {
    console.error('[SceneAgent] Failed to update visual_state_snapshot in createOrUpdateBatch:', err);
  }
  return this.findByPhase(projectId, phaseNumber);
};

const originalUpdateScene = SceneRepository.updateScene;
SceneRepository.updateScene = function (id: string, scene: any) {
  const result = originalUpdateScene.call(this, id, scene);
  try {
    const snapshotStr = scene.visual_state_snapshot ? JSON.stringify(scene.visual_state_snapshot) : null;
    const staleVal = scene.continuity_stale !== undefined ? (scene.continuity_stale ? 1 : 0) : 0;
    db.prepare('UPDATE scenes SET visual_state_snapshot = ?, continuity_stale = ? WHERE id = ?').run(snapshotStr, staleVal, id);
  } catch (err: any) {
    console.error('[SceneAgent] Failed to update visual_state_snapshot/continuity_stale in updateScene:', err);
  }
  return this.findById(id);
};

function getLevenshteinDistance(a: string, b: string): number {
  const tmp: number[][] = [];
  for (let i = 0; i <= a.length; i++) {
    tmp[i] = [i];
  }
  for (let j = 0; j <= b.length; j++) {
    tmp[0][j] = j;
  }
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      tmp[i][j] = Math.min(
        tmp[i - 1][j] + 1, // deletion
        tmp[i][j - 1] + 1, // insertion
        tmp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1) // substitution
      );
    }
  }
  return tmp[a.length][b.length];
}

// === VVS OPT FIX-2 MATCHING START ===
function resolveCharacterName(
  rawName: string,
  bibleRoster: Array<{ name: string }>,
  maxDistance: number = 2
): string | null {
  const lower = rawName.toLowerCase().trim();

  // Exact match (case-insensitive)
  const exact = bibleRoster.find(c => c.name.toLowerCase() === lower);
  if (exact) return exact.name;

  // Fuzzy match within maxDistance
  let bestMatch: string | null = null;
  let bestDistance = Infinity;
  for (const character of bibleRoster) {
    const dist = getLevenshteinDistance(lower, character.name.toLowerCase());
    if (dist <= maxDistance && dist < bestDistance) {
      bestDistance = dist;
      bestMatch = character.name;
    }
  }
  return bestMatch; // null if no match within distance
}
// === VVS OPT FIX-2 MATCHING END ===

export class SceneAgent extends BaseAgent {
  constructor() {
    super('SceneAgent');
  }

  private findBestRosterMatch(name: string, roster: any[]): any {
    if (!name) return null;
    const cleanName = name.toLowerCase().trim();
    let bestMatch: any = null;
    let minDistance = 999;

    for (const char of roster) {
      const rosterName = (char.name || '').toLowerCase().trim();
      if (cleanName === rosterName) {
        return char;
      }
      const dist = getLevenshteinDistance(cleanName, rosterName);
      if (dist <= 2 && dist < minDistance) {
        minDistance = dist;
        bestMatch = char;
      }
    }
    return bestMatch;
  }

  private findBestObjectMatch(name: string, registry: any[]): any {
    if (!name) return null;
    const cleanName = name.toLowerCase().trim();
    let bestMatch: any = null;
    let minDistance = 999;

    for (const obj of registry) {
      const objName = (obj.name || '').toLowerCase().trim();
      if (cleanName === objName) {
        return obj;
      }
      const dist = getLevenshteinDistance(cleanName, objName);
      if (dist <= 2 && dist < minDistance) {
        minDistance = dist;
        bestMatch = obj;
      }
    }
    return bestMatch;
  }

  private checkUnmatchedCharacters(scenes: any[], bible: ProductionBibleData): boolean {
    for (const scene of scenes) {
      const snapshot = scene.visual_state_snapshot;
      if (!snapshot || !snapshot.characters_present) continue;
      for (const char of snapshot.characters_present) {
        const name = char.name;
        if (typeof name === 'string' && !this.findBestRosterMatch(name, bible.character_roster)) {
          return true;
        }
      }
    }
    return false;
  }

  private getUnmatchedCharacterNames(scenes: any[], bible: ProductionBibleData): string[] {
    const names = new Set<string>();
    for (const scene of scenes) {
      const snapshot = scene.visual_state_snapshot;
      if (!snapshot || !snapshot.characters_present) continue;
      for (const char of snapshot.characters_present) {
        const name = char.name;
        if (typeof name === 'string' && !this.findBestRosterMatch(name, bible.character_roster)) {
          names.add(name);
        }
      }
    }
    return Array.from(names);
  }

  private checkTimeOfDayRegression(scenes: any[], projectId: string, phaseId: string) {
    function getTimeOfDayRank(tod: string): number | null {
      const t = (tod || '').toLowerCase().trim();
      if (t.includes('morning')) return 1;
      if (t.includes('afternoon')) return 2;
      if (t.includes('evening') || t.includes('sunset') || t.includes('dusk')) return 3;
      if (t.includes('night') || t.includes('dark')) return 4;
      return null;
    }

    for (let i = 1; i < scenes.length; i++) {
      const prevScene = scenes[i - 1];
      const currScene = scenes[i];
      const prevSnapshot = prevScene.visual_state_snapshot;
      const currSnapshot = currScene.visual_state_snapshot;

      if (!prevSnapshot || !currSnapshot) continue;

      const prevTod = prevSnapshot.time_of_day;
      const currTod = currSnapshot.time_of_day;

      const prevRank = getTimeOfDayRank(prevTod);
      const currRank = getTimeOfDayRank(currTod);

      if (prevRank !== null && currRank !== null && currRank < prevRank) {
        ContinuityRepository.create({
          project_id: projectId,
          phase_id: phaseId,
          prompt_number: currScene.scene_number,
          field: 'visual_state_snapshot.time_of_day',
          issue: `Time of day moved backwards from "${prevTod}" to "${currTod}" within the same phase.`,
          suggestion: `Ensure time of day progress is chronological (morning -> afternoon -> evening -> night), or write a transition explaining the time jump.`,
          cross_phase: 0
        });
      }
    }
  }

  private async validateAndProcessScenes(
    scenes: any[],
    bible: ProductionBibleData,
    projectId: string,
    phaseId: string,
    phaseNumber: number,
    apiKey: string | undefined,
    modelName?: string,
    config?: { temperature?: number; maxOutputTokens?: number },
    onChunk?: (chunk: string) => void,
    isRegenSingle = false,
    originalPromptContext?: { prompt: string; systemInstruction: string; userPrompt: string; injection: string }
  ): Promise<any[]> {
    // === VVS OPT FIX-2 RETRY-REMOVE START ===
    // Removed LLM re-prompt call for unmatched character names, replaced by local fuzzy matching.
    // === VVS OPT FIX-2 RETRY-REMOVE END ===

    if (phaseId) {
      if (isRegenSingle) {
        db.prepare('DELETE FROM continuity_warnings WHERE project_id = ? AND phase_id = ? AND prompt_number = ?')
          .run(projectId, phaseId, scenes[0].scene_number);
      } else {
        ContinuityRepository.deleteByPhase(projectId, phaseId);
      }
    }

    for (const scene of scenes) {
      scene.title = scene.title ?? '';
      scene.scene_description = scene.scene_description ?? '';
      scene.continuity_notes = scene.continuity_notes ?? '';
      scene.narration_fragment = scene.narration_fragment ?? '';
      const snapshot = scene.visual_state_snapshot;
      if (!snapshot) continue;

      let sceneHasUnmatchedChar = false;

      if (snapshot.characters_present && Array.isArray(snapshot.characters_present)) {
        const genericTerms = ['townsfolk', 'crowd', 'crowds', 'people', 'children', 'kids', 'bystanders', 'passersby', 'passers-by', 'pedestrians', 'villagers', 'audience'];
        snapshot.characters_present = snapshot.characters_present.filter((char: any) => {
          const charName = char.name;
          if (typeof charName !== 'string') return true;

          // === VVS OPT FIX-2 STEP-C START ===
          const canonicalName = resolveCharacterName(charName, bible.character_roster || []);
          if (canonicalName) {
            char.name = canonicalName;
            console.info(`[SceneAgent] Normalized character name: "${charName}" → "${canonicalName}" (fuzzy match)`);
            return true;
          }

          if (genericTerms.includes(charName.toLowerCase().trim())) {
            console.info(`[SceneAgent] Dropped generic/background character entity: "${charName}"`);
            return false;
          }

          sceneHasUnmatchedChar = true;
          console.warn(`[SceneAgent] Unresolved character name: "${charName}" — no Bible match within distance 2. Scene marked needs_review.`);
          if (phaseId) {
            ContinuityRepository.create({
              project_id: projectId,
              phase_id: phaseId,
              prompt_number: scene.scene_number,
              field: 'visual_state_snapshot',
              issue: `Character "${charName}" in visual_state_snapshot does not exist in the Production Bible character roster.`,
              suggestion: `Correct "${charName}" to one of the roster characters: ${(bible.character_roster || []).map(c => c.name).join(', ')}.`,
              cross_phase: 0
            });
          }
          return true;
          // === VVS OPT FIX-2 STEP-C END ===
        });
      }

      if (sceneHasUnmatchedChar) {
        scene.status = 'needs_review';
      } else {
        scene.status = 'done';
      }

      const objectKeys = ['key_visible_objects', 'key_objects_visible'];
      for (const key of objectKeys) {
        if (snapshot[key] && Array.isArray(snapshot[key])) {
          const normalizedObjects: string[] = [];
          for (const obj of snapshot[key]) {
            if (typeof obj !== 'string') continue;

            const match = bible.object_registry?.find(reg => {
              const regName = (reg.name || '').toLowerCase().trim();
              const regId = (reg.id || reg.object_id || '').toLowerCase().trim();
              const objName = obj.toLowerCase().trim();
              if (!regName) return false;
              return objName.includes(regName) || regName.includes(objName) || (regId && (objName === regId || objName.includes(regId)));
            });

            if (match) {
              const matchedName = match.name || match.id || match.object_id || obj;
              normalizedObjects.push(matchedName);
            } else {
              const noteToAdd = `Auto-removed unregistered object: ${obj}. Register in Production Bible if needed.`;
              if (scene.continuity_notes) {
                scene.continuity_notes = `${scene.continuity_notes}\n${noteToAdd}`;
              } else {
                scene.continuity_notes = noteToAdd;
              }

              try {
                db.prepare(`
                  INSERT INTO agent_logs (id, project_id, agent_name, model_used, status, input_prompt, output_response)
                  VALUES (?, ?, ?, ?, 'success', ?, 'unmatched')
                `).run(
                  crypto.randomUUID(),
                  projectId,
                  'SceneAgent_ObjectValidator',
                  modelName || 'gemini-2.5-flash',
                  obj
                );
              } catch (logErr: any) {
                console.error(`[SceneAgent] Failed to log removal: ${logErr.message}`);
              }
            }
          }
          snapshot[key] = normalizedObjects;
        }
      }

      // Ensure both keys are in sync
      if (snapshot.key_objects_visible && !snapshot.key_visible_objects) {
        snapshot.key_visible_objects = snapshot.key_objects_visible;
      } else if (snapshot.key_visible_objects && !snapshot.key_objects_visible) {
        snapshot.key_objects_visible = snapshot.key_visible_objects;
      }
    }

    if (phaseId) {
      this.checkTimeOfDayRegression(scenes, projectId, phaseId);
    }

    return scenes;
  }

  /**
   * Generates the scene storyboard breakdown for a single phase of the script, returning a structured list of scenes.
   */
  async run(
    phase: ScriptPhaseItem,
    bible: ProductionBibleData,
    projectId: string,
    phaseNumber: number,
    _ignoredSceneCountTarget: number,
    apiKey: string | undefined,
    modelName?: string,
    config?: { temperature?: number; maxOutputTokens?: number },
    onChunk?: (chunk: string) => void,
    youtubeTranscript?: string | null
  ): Promise<SceneBreakdownData> {
    const narrationSource = phase.narration_text;

    if (!narrationSource || narrationSource.trim().length === 0) {
      db.prepare("UPDATE phases SET status = 'failed' WHERE project_id = ? AND phase_number = ?")
        .run(projectId, phase.phase_number);
      throw new Error("Phase narration_text is empty — regenerate script phase.");
    }

    const project = db.prepare('SELECT narration_language, content_type, content_profile FROM projects WHERE id = ?').get(projectId) as { narration_language: string; content_type?: string; content_profile?: string } | undefined;
    const narrationLanguage = project?.narration_language || bible?.meta?.language || 'English';
    const profileKey = project?.content_profile || 'viral_story';
    const contentType = project?.content_type || 'auto';
    const profile = resolveContentProfile(profileKey);

    let keyEvents: string[] = phase.key_events || [];
    let keyFacts: string[] = (phase as any).key_facts || [];
    let keyImages: string[] = (phase as any).key_images || [];
    let characterIdsActive: string[] = phase.character_ids_active || [];

    try {
      const scriptRow = db.prepare('SELECT raw_json FROM scripts WHERE project_id = ?').get(projectId) as { raw_json: string } | undefined;
      if (scriptRow) {
        const scriptData = JSON.parse(scriptRow.raw_json);
        const scriptPhase = scriptData?.phases?.find((p: any) => p.phase_number === phase.phase_number);
        if (scriptPhase) {
          if ((!keyEvents || keyEvents.length === 0) && scriptPhase.key_events) {
            keyEvents = scriptPhase.key_events;
          }
          if ((!keyFacts || keyFacts.length === 0) && scriptPhase.key_facts) {
            keyFacts = scriptPhase.key_facts;
          }
          if ((!keyImages || keyImages.length === 0) && scriptPhase.key_images) {
            keyImages = scriptPhase.key_images;
          }
          if ((!characterIdsActive || characterIdsActive.length === 0) && scriptPhase.character_ids_active) {
            characterIdsActive = scriptPhase.character_ids_active;
          }
        }
      }
    } catch (dbErr: any) {
      logger.warn(`[SceneAgent] Could not load phase arrays from script DB: ${dbErr.message}`);
    }

    const wordCount = getWordCount(narrationSource, narrationLanguage);

    // Build a phase-filtered object registry subset
    const fullRegistry = bible.object_registry || [];
    let filteredRegistry = [...fullRegistry]; // default to full

    // We only filter if we have some relevance signals
    const hasSignals = 
      (characterIdsActive && characterIdsActive.length > 0) || 
      (phase.location_id_primary) || 
      (phase.phase_content && phase.phase_content.trim().length > 0) || 
      (phase.narration_text && phase.narration_text.trim().length > 0) || 
      (keyEvents && keyEvents.length > 0) || 
      (keyImages && keyImages.length > 0) || 
      (keyFacts && keyFacts.length > 0);

    if (hasSignals) {
      const activeCharIds = new Set(characterIdsActive.map(id => id.toLowerCase().trim()));
      
      // Resolve active character names from characterIdsActive
      const activeCharNames = new Set<string>();
      if (bible.character_roster) {
        for (const char of bible.character_roster) {
          if (char.id && activeCharIds.has(char.id.toLowerCase().trim())) {
            if (char.name) {
              activeCharNames.add(char.name.toLowerCase().trim());
            }
          }
        }
      }

      // Resolve primary location names/IDs
      const primaryLocId = (phase.location_id_primary || '').toLowerCase().trim();
      let primaryLocName = '';
      if (bible.location_roster && primaryLocId) {
        const loc = bible.location_roster.find(l => (l.id || '').toLowerCase().trim() === primaryLocId || (l.name || '').toLowerCase().trim() === primaryLocId);
        if (loc && loc.name) {
          primaryLocName = loc.name.toLowerCase().trim();
        }
      }

      // Collect all text from narration, events, facts, images to search for object name mentions
      const textsToSearch: string[] = [];
      if (phase.phase_content) textsToSearch.push(phase.phase_content);
      if (phase.narration_text) textsToSearch.push(phase.narration_text);
      if (keyEvents) textsToSearch.push(...keyEvents);
      if (keyImages) textsToSearch.push(...keyImages);
      if (keyFacts) textsToSearch.push(...keyFacts);
      const combinedSearchText = textsToSearch.join(' ').toLowerCase();

      const matchedObjects = fullRegistry.filter((obj: any) => {
        // Rule 1: Always keep hero props
        if ((obj as any).is_hero_prop) {
          return true;
        }

        // Rule 2: Keep objects associated with active characters or location
        const ownerOrLoc = (obj.owner_or_location || obj.owner || '').toLowerCase().trim();
        if (ownerOrLoc) {
          if (activeCharIds.has(ownerOrLoc) || activeCharNames.has(ownerOrLoc)) {
            return true;
          }
          if (primaryLocId && (ownerOrLoc === primaryLocId || ownerOrLoc === primaryLocName)) {
            return true;
          }
        }

        // Rule 3: Keep objects whose name appears in narration/events/images/facts
        const objName = (obj.name || '').toLowerCase().trim();
        if (objName && combinedSearchText.includes(objName)) {
          return true;
        }

        return false;
      });

      // Fail-safe: if the filtered list is empty, fall back to the full registry (no regression)
      if (matchedObjects.length > 0) {
        filteredRegistry = matchedObjects;
      }
    }

    let system = getSceneSystemPrompt(narrationLanguage, profile, contentType);
    const visualStatePrompt = `
VISUAL STATE SNAPSHOT — REQUIRED FOR EVERY SCENE:
At the end of each scene breakdown, provide a visual_state_snapshot that records the exact visual state at the END of this scene. This snapshot is passed to the next scene as its starting state.

Rules:
- characters_present: list of characters in the scene with fields:
  - name: character name e.g. 'Sarah' (must be a string matching a Bible roster name)
  - position: where each character is standing/sitting/moving at scene end e.g. 'standing at market stall, facing left'
  - props: exactly what each character is holding at scene end e.g. ['leather satchel open', 'single paper note raised in right hand']
  - physical_condition: any change from baseline e.g. 'sweating, slightly bent forward under load' or 'relaxed, upright'
  - facing_direction: which direction character faces at scene end e.g. 'facing camera', 'turned away right', 'looking upward'
- location_state: describe any change to the location from its baseline e.g. 'market stall now crowded with 3 additional merchants', 'same as scene open'
- time_of_day: must be consistent with previous scene unless a time jump is explicitly written in the narration
- atmosphere: must be consistent with previous scene unless explicitly changed
- key_visible_objects: all significant props or objects visible in frame at scene end
`;

    const sequentialRulePrompt = `
SCENE-TO-SCENE CONTINUITY RULE:
When generating scenes sequentially within a phase, pass the previous scene's visual_state_snapshot as context to the next scene generation:

PREVIOUS SCENE VISUAL STATE (your scene must begin from this state — do not contradict it):
Characters: [previous snapshot characters_present summary]
Location state: [previous snapshot location_state]
Time of day: [previous snapshot time_of_day]
Atmosphere: [previous snapshot atmosphere]
Objects visible: [previous snapshot key_visible_objects]

Your scene description must be visually continuous from this state. If your scene starts differently, you must write a brief transition in the scene_description field explaining what changed and why.
`;

    const formatObjectRegistry = (registry: any[]): string => {
      if (!registry || registry.length === 0) {
        return 'None';
      }
      return registry.map(obj => {
        const id = obj.object_id || obj.id || 'N/A';
        const name = obj.name || 'N/A';
        const ownerOrLoc = obj.owner_or_location || obj.owner || 'None';
        const desc = obj.visual_description || obj.description || 'No description';
        const firstLineDesc = desc.split(/[.\n]/)[0].trim();
        return `${id} | ${name} | Owner/Location: ${ownerOrLoc} | ${firstLineDesc}`;
      }).join('\n');
    };

    // === VVS OPT FIX-1C START ===
    const slimRegistry = (filteredRegistry).map((obj: any) => ({
      object_id: obj.object_id,
      name: obj.name,
    }));
    const objectsInventoryPrompt = `
REGISTERED OBJECT NAMES — use these exact names when referencing objects in key_visible_objects:
${JSON.stringify(slimRegistry, null, 0)}

HARD RULE: Do not invent any object that does not appear in this list. If a scene requires an object that is not registered, describe the scene without that object. Do not create new object names, variant names, or partial descriptions that do not match a registered entry.

When referencing an object in visual_state_snapshot.key_objects_visible, use the exact name from the registry above. Do not paraphrase, rename, or describe it differently — use the registered name exactly so the continuity system can match it.
`;
    // === VVS OPT FIX-1C END ===

    system = `${system}\n\n${visualStatePrompt}\n\n${sequentialRulePrompt}\n\n${objectsInventoryPrompt}\n\nCRITICAL JSON FORMATTING AND SCHEMA RULES:\n- "scene_number" MUST be a positive integer starting at 1 (1, 2, 3, etc.). It MUST NOT be 0.\n- "transition_to_next" MUST be a valid string (e.g. "cut", "dissolve", "fade", or "none"). It MUST NOT be null under any circumstances. If there is no specific transition, default to "cut".`;

    system = system.replace(
      'scene narration fragments (narration_fragment) under these strict rules:',
      'scene narration fragments (narration_fragment) under these strict rules:\n\n  NARRATION FRAGMENT RULE: The narration_fragment must not describe the visual action of the scene. It must add information that is invisible in the image — a character\'s internal thought, a historical fact, a consequence, a strategic context, or an irony. If the scene shows a soldier falling, the narration does not say \'the soldier falls.\' It says what that fall means, costs, or reveals. Caption narration is rejected.'
    );



    let previousSceneStateContext = '';
    if (phaseNumber > 1) {
      try {
        const lastSceneRow = db.prepare(`
          SELECT raw_json, visual_state_snapshot FROM scenes
          WHERE project_id = ? AND phase_number = ?
          ORDER BY scene_number DESC
          LIMIT 1
        `).get(projectId, phaseNumber - 1) as { raw_json: string; visual_state_snapshot: string | null } | undefined;
        if (lastSceneRow) {
          const snapshot = lastSceneRow.visual_state_snapshot 
            ? JSON.parse(lastSceneRow.visual_state_snapshot)
            : (JSON.parse(lastSceneRow.raw_json).visual_state_snapshot || null);
          if (snapshot) {
            const chars = snapshot.characters_present || [];
            const charsSummary = chars.map((c: any) => {
              const name = c.name || c.character_id || 'Unknown';
              const pos = c.position || c.current_position || '';
              const props = (c.props || c.props_held || []).join(', ');
              const cond = c.physical_condition || '';
              const face = c.facing_direction || '';
              return `${name}: position='${pos}', props='${props}', condition='${cond}', facing='${face}'`;
            }).join('; ');
            const locState = snapshot.location_state || '';
            const tod = snapshot.time_of_day || '';
            const atmos = snapshot.atmosphere || snapshot.weather_or_atmosphere || '';
            const objs = (snapshot.key_visible_objects || snapshot.key_objects_visible || []).join(', ');

            previousSceneStateContext = `PREVIOUS SCENE VISUAL STATE (your scene 1 must begin from this state — do not contradict it):
Characters: ${charsSummary || 'None'}
Location state: ${locState}
Time of day: ${tod}
Atmosphere: ${atmos}
Objects visible: ${objs}

Your scene description must be visually continuous from this state. If your scene starts differently, you must write a brief transition in the scene_description field explaining what changed and why.`;
          }
        }
      } catch (err: any) {
        console.error(`[SceneAgent] Failed to resolve previous phase last scene snapshot: ${err.message}`);
      }
    }

    let user = getSceneUserPrompt(phase, bible, youtubeTranscript, profile, contentType, keyEvents, characterIdsActive, keyFacts, keyImages, filteredRegistry);

    // Add phase_type context injection into user prompt
    user = `${user}\n\nPHASE TYPE: ${phase.phase_type}\nFeel free to split scenes as much as needed for the best visual flow.`;

    if (previousSceneStateContext) {
      user = `${user}\n\n${previousSceneStateContext}`;
    }

    const injection = `Voiceover narration for this phase (${wordCount} words):
${narrationSource}

Distribute this narration evenly. Each scene gets exactly 
~20 words of narration_fragment from this text. 
Do not invent new narration — only use the text above.`;

    let finalResult: SceneBreakdownData | null = null;
    let splitScenes: any[] = [];

    for (let attempt = 1; attempt <= 2; attempt++) {
      const result = await this.generateStructured<SceneBreakdownData>(
        projectId,
        apiKey,
        modelName,
        {
          prompt: `${user}\n\n${injection}`,
          systemInstruction: system,
          schema: extendedSceneAgentOutputSchema,
          temperature: config?.temperature,
          maxOutputTokens: config?.maxOutputTokens,
          maxRepairAttempts: 3,
          phaseNumber: phaseNumber,
        },
        onChunk
      );

      if (result && result.scenes && result.scenes.length > 0) {
        const tempSplitScenes: any[] = [];
        const rules = resolveLanguageRules(narrationLanguage);

        // Expose pacing configuration constants
        const PACING_FACTOR_HIGH = 1.5;
        const PACING_FACTOR_MEDIUM = 1.25;
        const PACING_FACTOR_LOW = 1.0;
        const HOOK_PHASE_BOOST_FACTOR = 1.5;
        const TARGET_CLIP_LENGTH_SECONDS = 8;
        const MAX_CLIPS_PER_SCENE_LIMIT = 5;

        const PHASE_TYPE_DENSITY_MAP: Record<string, number> = {
          hook: 1.75,
          climax: 1.75,
          build_up: 1.0,
          escalation: 1.0,
          outro: 1.0,
        };

        // Determine profile pacing factor
        let pacingFactor = getProfilePacingFactor(profile);

        // Hook boost applies only if we aren't explicitly on a calm/low pacing profile
        const isCalmProfile = profile?.id === 'documentary' || profile?.id === 'industry_profile' || profile?.id === 'tutorial';
        const isHookPhase = phase.phase_type?.toLowerCase() === 'hook';
        if (isHookPhase && !isCalmProfile) {
          pacingFactor = Math.max(pacingFactor, HOOK_PHASE_BOOST_FACTOR);
        }

        const phaseTypeKey = (phase.phase_type || '').toLowerCase().trim();
        const phaseTypeFactor = PHASE_TYPE_DENSITY_MAP[phaseTypeKey] ?? 1.0;
        const finalPacingFactor = pacingFactor * phaseTypeFactor;

        const bRollVisuals = [
          "The camera shifts to a close-up angle, highlighting the textures and subtle motions of the subject.",
          "An alternative side profile view focusing on the physical form and immediate setting.",
          "A wider camera perspective showing the subject within its surrounding environment.",
          "A high-angle view looking down to capture the geometric alignment and spatial context.",
          "A low-angle dramatic shot emphasizing the scale, height, and presence of the subject.",
          "A macro insert shot focusing on a specific movement or intricate texture.",
          "A tracking shot panning slowly across the surface, revealing additional details."
        ];

        for (const scene of result.scenes) {
          const baseWordCount = getWordCount(scene.narration_fragment || '', narrationLanguage);
          const sentenceCount = getSentenceParts(scene.narration_fragment || '', narrationLanguage).length;
          const minClips = (rules.wordCountStrategy === 'char' && baseWordCount > 0) ? 2 : 1;

          // Estimate spoken seconds using word count and speaking rate, then pacing-adjust
          const baselineClipCount = getDurationAwareClipCount(
            baseWordCount,
            narrationLanguage,
            finalPacingFactor,
            TARGET_CLIP_LENGTH_SECONDS
          );

          const floors = Math.max(minClips, sentenceCount);
          const requestedClipCount = Math.min(
            MAX_CLIPS_PER_SCENE_LIMIT,
            Math.max(floors, Math.ceil(baselineClipCount))
          );

          const fragments = splitNarrationIntoFragments(scene.narration_fragment || '', requestedClipCount, narrationLanguage);
          
          // Pad the fragments with empty strings if requestedClipCount exceeds actualClipCount
          while (fragments.length < requestedClipCount) {
            fragments.push('');
          }

          const actualClipCount = fragments.length;
          if (actualClipCount > 1) {
            let prevCamera = (scene as any).camera || 'static';
            let prevShotType = (scene as any).shot_type || 'medium';
            const shotTypes = ['establishing', 'wide', 'medium', 'close_up', 'extreme_close_up'];
            for (let i = 0; i < actualClipCount; i++) {
              const clonedScene = JSON.parse(JSON.stringify(scene));
              clonedScene.narration_fragment = fragments[i] ?? '';
              
              // TITLE part suffix
              clonedScene.title = `${scene.title} (Part ${i + 1})`;
              
              // CAMERA progression
              let cam = prevCamera;
              if (i > 0) {
                const cleanPrevCam = prevCamera.replace(/\s*\(Angle\s+[A-Za-z]\)\s*/gi, '').trim();
                cam = getNextCamera(cleanPrevCam);
              }
              clonedScene.camera = cam;
              prevCamera = cam;

              // SHOT TYPE rotation
              let st = clonedScene.shot_type || 'medium';
              if (i > 0 && st === prevShotType) {
                const idx = shotTypes.indexOf(st);
                const nextIdx = (idx !== -1 ? idx + 1 : 0) % shotTypes.length;
                st = shotTypes[nextIdx];
              }
              clonedScene.shot_type = st;
              prevShotType = st;

              // VISUAL / scene_description continuation (ensure unique description per part)
              if (i > 0) {
                clonedScene.scene_description = `${scene.scene_description} ${bRollVisuals[i % bRollVisuals.length]}`;
              }

              // visual_state_snapshot only on the last fragment
              if (i < actualClipCount - 1) {
                clonedScene.visual_state_snapshot = null;
              }

              tempSplitScenes.push(clonedScene);
            }
          } else {
            tempSplitScenes.push(scene);
          }
        }

        if (tempSplitScenes.length > 0) {
          splitScenes = tempSplitScenes;
          finalResult = result;
          break;
        }
      }

      if (attempt === 1) {
        console.warn(`[SceneAgent] Attempt 1 yielded 0 scenes for Phase ${phaseNumber}. Retrying once...`);
      }
    }

    if (!finalResult || splitScenes.length === 0) {
      return {
        phase_number: phase.phase_number,
        phase_title: phase.phase_title,
        total_scenes: 0,
        scenes: []
      };
    }

    const dbPhase = db.prepare('SELECT id FROM phases WHERE project_id = ? AND phase_number = ?').get(projectId, phaseNumber) as { id: string } | undefined;
    const phaseId = dbPhase?.id || '';

    const originalPromptContext = {
      prompt: `${user}\n\n${injection}`,
      systemInstruction: system,
      userPrompt: user,
      injection
    };

    // Cost control: bound total scenes per phase with a sane cap (reuse the MAX_CLIPS pattern)
    const MAX_SCENES_PER_PHASE = 15;
    if (splitScenes.length > MAX_SCENES_PER_PHASE) {
      logger.info(`[SceneAgent] Cost control: capping split scenes from ${splitScenes.length} to ${MAX_SCENES_PER_PHASE}`);
      splitScenes = splitScenes.slice(0, MAX_SCENES_PER_PHASE);
    }

    // Renumber sequentially starting from 1
    for (let i = 0; i < splitScenes.length; i++) {
      splitScenes[i].scene_number = i + 1;
    }

    finalResult.scenes = splitScenes;

    finalResult.scenes = await this.validateAndProcessScenes(
      finalResult.scenes,
      bible,
      projectId,
      phaseId,
      phaseNumber,
      apiKey,
      modelName,
      config,
      onChunk,
      false,
      originalPromptContext
    );

    // Post-generation validation removed

    return finalResult;
  }

  /**
   * Regenerates a single scene to make it visually richer and follow the script better.
   */
  async regenerateScene(
    projectId: string,
    currentScene: any,
    phaseContent: string,
    bible: ProductionBibleData,
    apiKey: string | undefined,
    modelName?: string,
    config?: { temperature?: number; maxOutputTokens?: number },
    onChunk?: (chunk: string) => void
  ): Promise<any> {
    const prompt = `You are a storyboard artist and director. Regenerate this specific scene to make it visually richer, have better flow, and match the style lock.

Scene Details:
${JSON.stringify(currentScene, null, 2)}

Phase Script context:
"${phaseContent}"

Production Bible Visual Style & Universe:
${JSON.stringify(bible, null, 2)}

Please output a rewritten, elevated scene JSON with all fields intact, but the visuals, continuity, narration, and details refined. You must return a JSON object that strictly adheres to the scene schema, keeping the same scene_number and ID structure.`;

    const regenerated = await this.generateStructured<any>(
      projectId,
      apiKey,
      modelName,
      {
        prompt,
        schema: extendedSceneItemSchema,
        temperature: config?.temperature,
        maxOutputTokens: config?.maxOutputTokens,
        phaseNumber: currentScene.phase_number,
      },
      onChunk
    );

    const dbPhase = db.prepare('SELECT id FROM phases WHERE project_id = ? AND phase_number = ?').get(projectId, currentScene.phase_number) as { id: string } | undefined;
    const phaseId = dbPhase?.id || '';

    const originalPromptContext = {
      prompt,
      systemInstruction: '',
      userPrompt: '',
      injection: ''
    };

    const processed = await this.validateAndProcessScenes(
      [regenerated],
      bible,
      projectId,
      phaseId,
      currentScene.phase_number,
      apiKey,
      modelName,
      config,
      onChunk,
      true,
      originalPromptContext
    );

    return processed[0];
  }

  /**
   * Extracts ONLY the visual_state_snapshot for an edited scene based on description and narration,
   * optionally taking the previous scene's snapshot as context.
   */
  async extractSnapshot(
    projectId: string,
    sceneDescription: string,
    narrationFragment: string,
    bible: ProductionBibleData,
    apiKey: string | undefined,
    modelName?: string,
    config?: { temperature?: number; maxOutputTokens?: number },
    previousSnapshot?: any
  ): Promise<any> {
    let previousStateContext = '';
    if (previousSnapshot) {
      const chars = previousSnapshot.characters_present || [];
      const charsSummary = chars.map((c: any) => {
        const name = c.name || c.character_id || 'Unknown';
        const pos = c.position || c.current_position || '';
        const props = (c.props || c.props_held || []).join(', ');
        const cond = c.physical_condition || '';
        const face = c.facing_direction || '';
        return `${name}: position='${pos}', props='${props}', condition='${cond}', facing='${face}'`;
      }).join('; ');
      const locState = previousSnapshot.location_state || '';
      const tod = previousSnapshot.time_of_day || '';
      const atmos = previousSnapshot.atmosphere || previousSnapshot.weather_or_atmosphere || '';
      const objs = (previousSnapshot.key_visible_objects || previousSnapshot.key_objects_visible || []).join(', ');

      previousStateContext = `\nPREVIOUS SCENE VISUAL STATE (this scene begins from this state — do not contradict it unless the scene description explicitly transitions):
Characters: ${charsSummary || 'None'}
Location state: ${locState}
Time of day: ${tod}
Atmosphere: ${atmos}
Objects visible: ${objs}`;
    }

    const prompt = `You are a visual continuity supervisor. Analyze the following scene description and narration fragment, then extract the exact visual state at the END of this scene.

Scene Description:
"${sceneDescription}"

Narration Fragment:
"${narrationFragment}"
${previousStateContext}

Production Bible Universe:
${JSON.stringify(bible, null, 2)}

Provide the visual_state_snapshot that records the exact visual state at the END of this scene.
Rules:
- characters_present: list of characters in the scene with fields:
  - name: character name e.g. 'Sarah' (must be a string matching a Bible roster name)
  - position: where each character is standing/sitting/moving at scene end e.g. 'standing at market stall, facing left'
  - props: exactly what each character is holding at scene end e.g. ['leather satchel open', 'single paper note raised in right hand']
  - physical_condition: any change from baseline e.g. 'sweating, slightly bent forward under load' or 'relaxed, upright'
  - facing_direction: which direction character faces at scene end e.g. 'facing camera', 'turned away right', 'looking upward'
- location_state: describe any change to the location from its baseline e.g. 'market stall now crowded with 3 additional merchants', 'same as scene open'
- time_of_day: must be consistent with the scene description
- atmosphere: must be consistent with the scene description
- key_visible_objects: all significant props or objects visible in frame at scene end (from the Bible's registered objects list if applicable, or objects present in the scene)

You must return valid JSON matching the schema.`;

    const originalAgentName = this.agentName;
    (this as any).agentName = 'SceneAgent_SnapshotRefresh';

    try {
      const snapshot = await this.generateStructured<any>(
        projectId,
        apiKey,
        modelName,
        {
          prompt,
          schema: strictVisualStateSnapshotSchema,
          temperature: config?.temperature,
          maxOutputTokens: config?.maxOutputTokens,
        }
      );

      // Normalize character names in the snapshot
      if (snapshot.characters_present && Array.isArray(snapshot.characters_present)) {
        for (const char of snapshot.characters_present) {
          const charName = char.name;
          if (typeof charName === 'string') {
            const match = this.findBestRosterMatch(charName, bible.character_roster);
            if (match) {
              char.name = match.name;
            }
          }
        }
      }

      // Normalize objects in the snapshot
      const objectKeys = ['key_visible_objects', 'key_objects_visible'];
      for (const key of objectKeys) {
        if (snapshot[key] && Array.isArray(snapshot[key])) {
          const normalizedObjects: string[] = [];
          for (const obj of snapshot[key]) {
            if (typeof obj !== 'string') continue;
            const match = bible.object_registry?.find(reg => {
              const regName = (reg.name || '').toLowerCase().trim();
              const regId = (reg.id || reg.object_id || '').toLowerCase().trim();
              const objName = obj.toLowerCase().trim();
              if (!regName) return false;
              return objName.includes(regName) || regName.includes(objName) || (regId && (objName === regId || objName.includes(regId)));
            });
            if (match) {
              normalizedObjects.push(match.name || match.id || match.object_id || obj);
            } else {
              normalizedObjects.push(obj);
            }
          }
          snapshot[key] = normalizedObjects;
        }
      }

      // Ensure key_visible_objects and key_objects_visible are in sync
      if (snapshot.key_objects_visible && !snapshot.key_visible_objects) {
        snapshot.key_visible_objects = snapshot.key_objects_visible;
      } else if (snapshot.key_visible_objects && !snapshot.key_objects_visible) {
        snapshot.key_objects_visible = snapshot.key_visible_objects;
      }

      return snapshot;
    } finally {
      (this as any).agentName = originalAgentName;
    }
  }
}
export const sceneAgent = new SceneAgent();

