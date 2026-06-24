const fs = require('fs');
const { getBibleSystemPrompt } = require('./backend/dist/prompts/production-bible.prompt');

function applyBibleSystemPromptModifications(prompt) {
  let normalized = prompt.replace(/\r\n/g, '\n');

  // Replace Objects rule clamp
  const targetObjectsRule = `3. Objects     → 2–6 entries, IDs: OBJ_001, OBJ_002, …`;
  const replacementObjectsRule = `OBJECT REGISTRY — MANDATORY EXHAUSTIVE REGISTRATION:
The object_registry must contain EVERY physical object that will visibly appear in any scene of this video. This is not a list of symbolic or thematic objects only. It is a complete inventory of everything visible on screen.`;

  normalized = normalized.replace(targetObjectsRule, replacementObjectsRule);

  const targetInstructions = `7. Return ONLY raw JSON — no markdown fences, no prose before or after.`;
  const replacementInstructions = `7. Return ONLY raw JSON — no markdown fences, no prose before or after.

CHARACTER APPEARANCE LOCK — MANDATORY FOR EVERY CHARACTER:
For each character in the character_roster, you must generate a complete appearance_lock object. These values are permanent and will be injected into every scene prompt that features this character. They cannot be changed by any downstream agent.`;

  normalized = normalized.replace(targetInstructions, replacementInstructions);

  const targetExample = `"appearance_lock": {
        "character_type": "human | creature | animal | robot | object | abstract",
        "physical_description": "string detailing exact physical structure, species details, wings, robotic features, scales",
        "style_notes": "string describing how this character renders in the chosen style (e.g. 'Pixar-style soft clay shader, large expressive eyes')",
        "ethnicity": "string (optional, human only)",
        "approximate_age": "string (optional)",
        "gender": "string (optional)",
        "skin_tone": "string (optional, human only)",
        "hair": "string (optional, human only)",
        "eyes": "string (optional)",
        "face_structure": "string (optional)",
        "distinguishing_features": "string (optional)",
        "primary_clothing": "string (optional)",
        "clothing_colors": ["string"] (optional),
        "clothing_era": "string (optional)",
        "accessories": "string (optional)",
        "forbidden_appearance_changes": ["string"]
      }`;

  const replacementExample = `"appearance_lock": {
        "character_type": "human",
        "physical_description": "human female, athletic build, defined jawline",
        "style_notes": "Pixar-style 3D render, warm skin tone subsurface scattering, expressive large eyes"
      }`;

  const oldNormalized = normalized;
  normalized = normalized.replace(targetExample, replacementExample);
  console.log("Did targetExample match replace?", oldNormalized !== normalized);

  return normalized;
}

const sys = getBibleSystemPrompt();
const modified = applyBibleSystemPromptModifications(sys);
// Write to test_sys.txt
fs.writeFileSync('test_sys.txt', modified);
console.log("Done");
