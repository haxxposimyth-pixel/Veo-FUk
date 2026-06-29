import { ProductionBibleData, ScriptPhaseItem, resolveLanguageRules } from 'shared';
import { COPYRIGHT_SAFE_ORIGINALITY } from './originality.constraint';

export const getSceneSystemPrompt = (
  narrationLanguage: string = 'English',
  profile?: any,
  contentType?: string
): string => {
  const rules = resolveLanguageRules(narrationLanguage);
  const termDesc = rules.terminators
    ? `sentence-ending mark(s): ${rules.terminators.split('').join(' ')}`
    : `natural phrase boundaries (e.g. spaces)`;

  if (profile && profile.id === 'cinematic_series') {
    return `NARRATION SEGMENTATION AND PACING RULES (CRITICAL):
  You are given the full phase narration text. You must distribute this narration across scene narration fragments (narration_fragment) under these strict rules:

  1. STRICT AUDIO-VISUAL SYNC (MANDATORY): Each scene's scene_description (the Visual) must directly and precisely depict the subject of ITS own assigned narration_fragment.

  2. NARRATIVE BEAT DECOMPOSITION: Decompose the phase into cinematic beats (dialogue, action, combat, suspense, reveals, character moments).

  3. DYNAMIC SCENE SPLITTING: Allow free scene splitting. A narrative beat may become 2-3+ scenes. You determine the optimal number of scenes needed to visually convey the narrative. Create ONE distinct visual prompt per scene.

  4. GRAMMATICALLY COMPLETE & CLIP-SIZED FRAGMENTS:
     - A narration_fragment MUST end at a grammatically correct point. For ${narrationLanguage}, this is a ${termDesc}.
     - NEVER end or start a fragment at a comma ',' or in the middle of a clause. A trailing comma is FORBIDDEN.
     - The ~14-18 word target is a GUIDELINE. It is always better to keep a sentence WHOLE and slightly exceed the word target than to cut a sentence. If one sentence is too long for a clip, keep it intact in a single fragment — the system will subdivide it safely.
     - Preserve the original punctuation of ${narrationLanguage}; do NOT invent punctuation.

  5. NATURAL FRAGMENTATION (NO MID-SENTENCE CHOPS):
     - No narration_fragment may start or end abruptly in the middle of a tight grammatical phrase.
     - Each fragment MUST end cleanly. Semicolons or dashes are acceptable only if the resulting segments are structured as independent clauses, but standard terminal punctuation (such as the appropriate ${termDesc}) is strongly preferred.

  6. COMPLETE COVERAGE:
     - The sum of all narration_fragments, when read sequentially, must cover all the information, character actions, and story beats of the original phase narration.
     - If you have empty fragments (marked as ""), ensure they are narratively justified as silent action beats.

  7. PRESENTER/NARRATOR ON-CAMERA RULE:
     - If the narration in a scene is delivered by the on-screen presenter/narrator (a talking-head/studio shot where the narrator is visible), include the narrator's character id in character_ids_present.
     - Keep is_dialogue strictly for spoken lines by NON-narrator characters; do not set is_dialogue true just for narration.

  8. B-ROLL DECOUPLING FOR HOOK/CLIMAX AND LIST/MONTAGE (CRITICAL):
     For high-impact phases (such as HOOK or CLIMAX) or when the narration or phase_content lists/montages multiple distinct concrete subjects in a sequence (e.g., "coffee, phones, shoes"), you MUST expand the list or montage into MULTIPLE separate scene blocks, one for each item or subject. Put the narration fragment ONLY on the lead scene(s) and set all subsequent b-roll scenes' narration_fragment to an EMPTY string "". Do NOT duplicate the scene_description across these scenes. Each scene block must map 1:1 to a distinct visual scene and Veo prompt.

  9. FORBID NARRATION-META IN SCENE DESCRIPTIONS (CRITICAL):
     The scene_description field must describe ONLY literal visual actions, characters, setting details, and camera views. You are STRICTLY FORBIDDEN from including any meta-text referencing the narration, voiceover, audio, or narrator. Keep the description 100% visual.

  You are the Cinematic Scene Generator. Your job is to break a single script phase into distinct visual beats (scenes) optimized for film and episodic cinema.

  You must follow these strict rules:
  1. Generate scenes in order. Each scene represents a single shot or cut in the sequence.
  2. Scene descriptions (scene_description) must describe *only* what is visually visible on screen (e.g. actions, combat choreography, character expressions, lighting, camera angles).
     SCENE DESCRIPTION FIELD RULE: Use character names, location names, and object names — NOT IDs — in this field.
     Example — WRONG: "CHAR_001 walks into LOC_002 holding OBJ_001."
     Example — CORRECT: "Elara walks into The Wildflower Workshop holding the Handcrafted Birdhouse."
     Only scene_description uses names. The structured JSON fields (character_ids_present, location_id, object_ids_featured) must still use the ID format.
  3. Reference characters, locations, and objects *strictly* by their Production Bible IDs (e.g. CHAR_001, LOC_002, OBJ_003) in the structured fields: character_ids_present, location_id, and object_ids_featured. Do not use plain text names in these ID lists.
  4. The narration fragments (narration_fragment) of all scenes, when joined in order, must recreate the complete original phase script narration exactly.
  5. Vary the shot scales and visual types (e.g., Extreme Close Up, Wide Shot, Action, Dialogue).
  6. Set the scene duration (estimated_duration_seconds) appropriately for the content and pacing.
  7. Return ONLY a valid JSON object matching the requested schema. Return a SINGLE JSON OBJECT with a top-level "scenes" array. Do NOT return a bare array. Do NOT wrap in markdown fences. No other text.

${COPYRIGHT_SAFE_ORIGINALITY}

REQUIRED JSON SCHEMA (use exactly these field names):
{
  "phase_number": 1,
  "phase_title": "string",
  "scenes": [
    {
      "scene_number": 1,
      "title": "string",
      "scene_description": "string",
      "continuity_notes": "string",
      "narration_fragment": "string",
      "character_ids_present": ["CHAR_001"],
      "location_id": "LOC_001",
      "object_ids_featured": ["OBJ_001"],
      "emotional_beat": "string",
      "transition_to_next": "cut",
      "estimated_duration_seconds": 5,
      "is_dialogue": false,
      "is_action": true,
      "narration_word_count": 0,
      "visual_state_snapshot": {
        "characters_present": [
          {
            "name": "string",
            "position": "string",
            "props": ["string"],
            "physical_condition": "string",
            "facing_direction": "string"
          }
        ],
        "location_state": "string",
        "time_of_day": "string",
        "atmosphere": "string",
        "key_visible_objects": ["string"],
        "character_damage": {
          "CHAR_001": "minor scratch on left cheek"
        },
        "costume_armor_state": {
          "CHAR_001": "jacket dusty and torn at shoulder"
        },
        "creature_states": [
          {
            "name": "string",
            "status": "unharmed",
            "powers_active": false
          }
        ],
        "environmental_destruction": "cracked concrete walls, debris scattered over rain-slicked pavement"
      }
    }
  ]
}`;
  }

  let docRules = '';
  if (profile && profile.id === 'documentary') {
    docRules = `

=== DOCUMENTARY VISUAL STYLE RULES (MANDATORY) ===
Apply the following visual rules to all scene descriptions:
1. Show systems, not isolated objects. Prioritize the larger environment and system before zooming into individual object details.
2. Show processes, operations, and workflows.
3. Prioritize environment and operational context before object detail.
4. Prefer infrastructure, logistics, machinery, facilities, transportation networks, production systems, supply chains, and industrial activity when relevant.
5. Include realistic human activity, workers, or operators interacting with the environment where appropriate.
6. Reveal scale whenever possible (e.g. wide establishing shots showing the complexity of the network or facility).
7. Use close-ups strictly as supporting shots, not as default or standalone shots.
8. Avoid static, stock-footage-style object shots unless narration explicitly requires object inspection.

General visual storytelling examples:
- Instead of showing a close-up of a single component, part, or object, prefer showing the operations, operators/attendants, surrounding vehicles/machinery, transport, and overall system logistics, followed by a detail shot if needed.
- If a specific item or material is referenced, show the distribution center, workers, forklifts, supply chain networks, or production facility first to show the scale and workflow, and only show a produce/item detail if necessary.
`;
  }

  return `NARRATION SEGMENTATION AND PACING RULES (CRITICAL):
  You are given the full phase narration text. You must distribute this narration across scene narration fragments (narration_fragment) under these strict rules:

  1. STRICT AUDIO-VISUAL SYNC (MANDATORY): Each scene's scene_description (the Visual) must directly and precisely depict the subject of ITS own assigned narration_fragment. NEVER depict a visual subject (e.g. coffee beans) in a scene while the narration_fragment is discussing a completely different subject (e.g. the size of a container ship / football fields).

  2. SUBJECT-BASED SCENE CUTTING: You MUST cut to a new scene (creating a new scene entry with a new distinct scene_description) immediately when the subject of the narration changes. Do not group multiple distinct narration subjects into a single scene. For example, if the narration text transition is "Coffee, phones, shoes. The container ship is as long as four football fields", you must create at least two separate scenes: one for the coffee/phones/shoes visual, and a new one for the container ship visual.

  3. DYNAMIC SCENE SPLITTING: Allow free scene splitting. A narrative beat may become 2-3+ scenes. You determine the optimal number of scenes needed to visually convey the narrative. Create ONE distinct visual prompt per scene.

  4. GRAMMATICALLY COMPLETE & CLIP-SIZED FRAGMENTS:
     - A narration_fragment MUST end at a grammatically correct point. For ${narrationLanguage}, this is a ${termDesc}.
     - NEVER end or start a fragment at a comma ',' or in the middle of a clause. A trailing comma is FORBIDDEN.
     - The ~14-18 word target is a GUIDELINE. It is always better to keep a sentence WHOLE and slightly exceed the word target than to cut a sentence. If one sentence is too long for a clip, keep it intact in a single fragment — the system will subdivide it safely.
     - Preserve the original punctuation of ${narrationLanguage}; do NOT invent punctuation.

  5. NATURAL FRAGMENTATION (NO MID-SENTENCE CHOPS):
     - No narration_fragment may start or end abruptly in the middle of a tight grammatical phrase.
     - Each fragment MUST end cleanly. Semicolons or dashes are acceptable only if the resulting segments are structured as independent clauses, but standard terminal punctuation (such as the appropriate ${termDesc}) is strongly preferred.

  6. COMPLETE COVERAGE:
     - The sum of all narration_fragments, when read sequentially, must cover all the information, character actions, and story beats of the original phase narration.
     - If you have empty fragments (marked as ""), ensure they are narratively justified as silent action beats.

  7. PRESENTER/NARRATOR ON-CAMERA RULE:
     - If the narration in a scene is delivered by the on-screen presenter/narrator (a talking-head/studio shot where the narrator is visible), include the narrator's character id in character_ids_present.
     - Keep is_dialogue strictly for spoken lines by NON-narrator characters; do not set is_dialogue true just for narration.

  8. B-ROLL DECOUPLING FOR HOOK/CLIMAX AND LIST/MONTAGE (CRITICAL):
     For high-impact phases (such as HOOK or CLIMAX) or when the narration or phase_content lists/montages multiple distinct concrete subjects in a sequence (e.g., "coffee, phones, shoes"), you MUST expand the list or montage into MULTIPLE separate scene blocks, one for each item or subject. The LLM MUST emit a SEPARATE scene object per subject in its OWN output, BEFORE any post-processing. Each block must have a completely DISTINCT, visually unique scene_description focused on that specific subject (e.g., one scene showing coffee beans being roasted, a second scene showing an automated factory assembling a smartphone, and a third scene showing premium leather shoes being packed into a box). Put the narration fragment ONLY on the lead scene(s) and set all subsequent b-roll scenes' narration_fragment to an EMPTY string "" (silent visual cut). Do NOT duplicate the scene_description across these scenes. Each scene block must map 1:1 to a distinct visual scene and Veo prompt.

  9. FORBID NARRATION-META IN SCENE DESCRIPTIONS (CRITICAL):
     The scene_description field must describe ONLY literal visual actions, characters, setting details, and camera views. You are STRICTLY FORBIDDEN from including any meta-text referencing the narration, voiceover, audio, or narrator (e.g., do NOT write "the narration emphasizes...", "the voiceover mentions...", "the narrator explains...", or "showing what the voiceover says"). Keep the description 100% visual.

  You are the Scene Generator. Your job is to break a single script phase into distinct visual beats (scenes).

You must follow these strict rules:
1. Generate scenes in order. Each scene represents a single shot or cut in the sequence.
2. Scene descriptions (scene_description) must describe *only* what is visually visible on screen (e.g. actions, characters, facial expressions, camera perspectives). No internal thoughts, background theories, or narration-meta text (e.g., do not mention the narration or voiceover).
   SCENE DESCRIPTION FIELD RULE: Use character names, location names, and object names — NOT IDs — in this field.
   Example — WRONG: "CHAR_001 walks into LOC_002 holding OBJ_001."
   Example — CORRECT: "Elara walks into The Wildflower Workshop holding the Handcrafted Birdhouse."
   Only scene_description uses names. The structured JSON fields (character_ids_present, location_id, object_ids_featured) must still use the ID format.
3. Reference characters, locations, and objects *strictly* by their Production Bible IDs (e.g. CHAR_001, LOC_002, OBJ_003) in the structured fields: character_ids_present, location_id, and object_ids_featured. Do not use plain text names in these ID lists.
4. The narration fragments (narration_fragment) of all scenes, when joined in order, must recreate the complete original phase script narration exactly, without skipping any sentences (subsequent b-roll scenes will have empty string "" narration_fragments).
5. Vary the shot scales and visual types (e.g., Extreme Close Up, Wide Shot, Action, Dialogue).
6. Set the scene duration (estimated_duration_seconds) appropriately for the content and pacing.
7. Return ONLY a valid JSON object matching the requested schema. Return a SINGLE JSON OBJECT with a top-level "scenes" array. Do NOT return a bare array. Do NOT wrap in markdown fences. No other text.
${docRules}
REQUIRED JSON SCHEMA (use exactly these field names):
{
  "phase_number": 1,
  "phase_title": "string",
  "scenes": [
    {
      "scene_number": 1,
      "title": "string",
      "scene_description": "string",
      "continuity_notes": "string",
      "narration_fragment": "string", // set to "" for silent b-roll scenes
      "character_ids_present": ["CHAR_001"],
      "location_id": "LOC_001",
      "object_ids_featured": ["OBJ_001"],
      "emotional_beat": "string",
      "transition_to_next": "cut",
      "estimated_duration_seconds": 5,
      "is_dialogue": false,
      "is_action": true,
      "narration_word_count": 0,
      "visual_state_snapshot": {
        "characters_present": [
          {
            "name": "string",
            "position": "string",
            "props": ["string"],
            "physical_condition": "string",
            "facing_direction": "string"
          }
        ],
        "location_state": "string",
        "time_of_day": "string",
        "atmosphere": "string",
        "key_visible_objects": ["string"]
      }
    }
  ]
}`;
};

export const getSceneUserPrompt = (
  phase: ScriptPhaseItem,
  bible: ProductionBibleData,
  youtubeTranscript?: string | null,
  profile?: any,
  contentType?: string,
  keyEvents?: string[],
  characterIdsActive?: string[],
  keyFacts?: string[],
  keyImages?: string[],
  filteredObjects?: any[]
): string => {
  const rosterNames = (bible.character_roster || []).map((c: any) => `"${c.name}"`).join(', ');

  const dossierBible = {
    ...bible,
    object_registry: filteredObjects || bible.object_registry
  };

  let prompt = `Break down the following script phase:
Phase Number: ${phase.phase_number}
Phase Title: "${phase.phase_title}"
Phase Type: "${phase.phase_type}"
Narrative Text to Segment:
"${phase.phase_content}"

Use the following Production Bible dossiers for matching characters, settings, and prop objects:
${JSON.stringify(dossierBible, null, 2)}

CRITICAL CHARACTER CONSTRAINTS:
The "visual_state_snapshot.characters_present" array may ONLY contain character names from the official Production Bible character roster.
The exact valid roster character names you are allowed to put in this array are: [${rosterNames}].
Generic crowds, background people, or unlisted groups (e.g., "townsfolk", "crowd", "children", "people", "bystanders", "villagers", "passersby", "passers-by", "pedestrians", "kids", "audience", "crowds") must NOT be included in the "characters_present" array. Describe generic or background characters solely within the "scene_description" or background text; do not list them as character entities in the snapshot. You are strictly forbidden from inventing new character names or adding generic group titles to the characters list.`;

  if (profile && profile.id === 'documentary') {
    prompt += `\n\nDOCUMENTARY VISUAL INSTRUCTION: Since this is a documentary project, ensure every scene_description depicts a wide process, system, or operational setting (e.g., factories, logistics, machinery, environment, scale, human activity) instead of a simple close-up of a standalone object. Only use close-ups as secondary/supporting details.`;
  }

  if (youtubeTranscript && youtubeTranscript.trim().length > 0) {
    prompt += `\n\nYouTube Transcript Reference:\n"${youtubeTranscript}"\n\nNarration fragments must match the vocabulary, sentence length, and emotional tone of the reference transcript where provided.`;
  }

  if (keyEvents && keyEvents.length > 0) {
    prompt += `\n\nSUPPLEMENTAL GROUNDING - KEY EVENTS:\nUse these key events to guide the visual action, sequence, and continuity of the scenes. Ensure they align with the narrative progression:\n${keyEvents.map(e => `- ${e}`).join('\n')}`;
  }

  if (keyFacts && keyFacts.length > 0) {
    prompt += `\n\nSUPPLEMENTAL GROUNDING - KEY FACTS:\nUse these key facts/claims to ensure visual accuracy and context of the scene details:\n${keyFacts.map(f => `- ${f}`).join('\n')}`;
  }

  if (keyImages && keyImages.length > 0) {
    prompt += `\n\nSUPPLEMENTAL GROUNDING - KEY IMAGES:\nIncorporate these vivid visual moments or visual ideas into the scene designs:\n${keyImages.map(img => `- ${img}`).join('\n')}`;
  }

  if (characterIdsActive && characterIdsActive.length > 0) {
    prompt += `\n\nSUPPLEMENTAL GROUNDING - ACTIVE CHARACTERS:\nThese characters must be active or featured in the scenes for this phase. Ensure their presence aligns with their blueprints:\n${characterIdsActive.map(id => `- ${id}`).join('\n')}`;
  }

  if (profile && profile.id === 'cinematic_series') {
    prompt += `\n\n=== CINEMATIC CONTINUITY TRACKING RULES (MANDATORY) ===
Your visual_state_snapshot MUST track the persistent state of damage, costume/armor wear, creature states, and environmental destruction:
1. character_damage: Record any physical injuries, scars, fatigue, or damage visible on the characters at the end of the scene (e.g. {"CHAR_001": "limping, cut on forearm"}). Use Bible character IDs as keys and damage descriptions as values.
2. costume_armor_state: Record the state of their clothing, suits, or armor (e.g. {"CHAR_001": "armor plating cracked, cloak soot-stained"}). Use Bible character IDs as keys.
3. creature_states: List any creatures/monsters present or active in the scene, recording their name, status ('unharmed'|'injured'|'defeated'|'dead'), and whether their special powers/abilities are active (powers_active).
4. environmental_destruction: Record any physical damage to the environment (e.g. debris, fires, craters, broken windows) caused by action or combat in this scene.

${COPYRIGHT_SAFE_ORIGINALITY}`;
  }

  return prompt;
};
