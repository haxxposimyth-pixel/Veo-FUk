import { BaseAgent } from './base-agent';
import {
  getScriptSystemPrompt,
  getScriptUserPrompt,
  getPhaseRegeneratePrompt,
  getLastSentences,
  getFirstSentences,
  getPhaseGenerationPrompt,
  buildAudienceDirectives,
  getNarrationSpinePrompt,
  getPhaseExpansionPrompt,
  getOutlinePrompt,
  getNarrationFillPrompt,
} from '../prompts/script.prompt';
import {
  scriptAgentOutputSchema,
  scriptPhaseItemSchema,
  scriptExtractionSchema,
  phaseRegenerateSchema,
  validateRehookSchema,
  scriptSpineOutputSchema,
  scriptPhaseExpansionSchema,
  buildPhasePlan,
  scriptOutlineOutputSchema,
  getWordCount,
  resolveLanguageRules,
  resolveContentProfile,
  SOFT_MIN_NARRATION_WORDS
} from 'shared';
import type { ProductionBibleData, ScriptData, ScriptTone, PhasePlan, LanguageRules } from 'shared';
import { z } from 'zod';
import pLimit from 'p-limit';

import logger from '../utils/logger';
import { ScriptRepository } from '../db/repositories/script.repo';
import { ProjectRepository } from '../db/repositories/project.repo';

type ExtractedContent = z.infer<typeof scriptExtractionSchema>;

export const optimizedScriptPhaseItemSchema = z.intersection(
  scriptPhaseItemSchema,
  z.object({
    key_facts: z.array(z.string()).optional().default([]),
    key_images: z.array(z.string()).optional().default([]),
    key_events: z.array(z.string()).optional().default([]),
    characters_mentioned: z.array(z.string()).optional().default([]),
  })
);
// === VVS OPT FIX-6 SCHEMA END ===

function buildLockedContentSection(
  facts: string[],
  images: string[],
  events: string[],
  characters: string[]
): string {
  const formatList = (items: string[]) => {
    if (items.length === 0) return "- None";
    return items.map(item => `- ${item}`).join('\n');
  };

  return `CONTENT ALREADY COVERED IN EARLIER PHASES — HARD RULES:
The following content has already been presented to the viewer. You MUST NOT repeat, restate, paraphrase, or re-describe any of the following in this phase:

LOCKED FACTS (do not restate these numbers or statistics):
${formatList(facts)}

LOCKED IMAGES (do not reuse these visual descriptions or sensory details):
${formatList(images)}

LOCKED EVENTS (do not re-explain these historical events):
${formatList(events)}

LOCKED CHARACTERS (these characters have already been introduced — do not re-introduce them, only continue their story):
${formatList(characters)}

Violation of any locked item means the output fails quality review. Each phase must introduce NEW facts, NEW images, and NEW events that have not appeared anywhere above.`;
}

function getCombinedLockedContent(
  extractionMap: Map<number, ExtractedContent>,
  maxPhase: number
) {
  const factsSet = new Set<string>();
  const imagesSet = new Set<string>();
  const eventsSet = new Set<string>();
  const charsSet = new Set<string>();

  for (let i = 1; i <= maxPhase; i++) {
    const ext = extractionMap.get(i);
    if (ext) {
      (ext.facts || []).forEach(f => { if (f?.trim()) factsSet.add(f.trim()); });
      (ext.images || []).forEach(img => { if (img?.trim()) imagesSet.add(img.trim()); });
      (ext.events || []).forEach(e => { if (e?.trim()) eventsSet.add(e.trim()); });
      (ext.characters_used || []).forEach(c => { if (c?.trim()) charsSet.add(c.trim()); });
    }
  }

  return {
    facts: Array.from(factsSet),
    images: Array.from(imagesSet),
    events: Array.from(eventsSet),
    characters_used: Array.from(charsSet),
  };
}

export function applySystemPromptModifications(prompt: string): string {
  let normalized = prompt.replace(/\r\n/g, '\n');

  // 1. Character usage instruction addition
  const targetChar = `1. Use ONLY character IDs (CHAR_xxx), location IDs (LOC_xxx), and object IDs (OBJ_xxx) from\n   the Production Bible in all structured JSON fields (e.g. character_ids_active, location_id_primary). Never invent new IDs.`;
  const replacementChar = `1. Use ONLY character IDs (CHAR_xxx), location IDs (LOC_xxx), and object IDs (OBJ_xxx) from\n   the Production Bible in all structured JSON fields (e.g. character_ids_active, location_id_primary). Never invent new IDs. Named historical characters may only appear in phases whose narrative context falls within their known lifetime or historical period. To use a historical character symbolically across multiple time periods, you must first establish in an earlier phase — using explicit narration — that they are being used as a symbolic frame and not as a literal participant in the later event.`;
  normalized = normalized.replace(targetChar, replacementChar);

  // 2. Rhetorical question rule in UNIVERSAL PROHIBITIONS
  const targetProhibitions = `8. Do not repeat any noun, verb, or adjective that appeared in Phase 1 unless it is a named character or location. The vocabulary must expand as the video progresses."`;
  const replacementProhibitions = `8. Do not repeat any noun, verb, or adjective that appeared in Phase 1 unless it is a named character or location. The vocabulary must expand as the video progresses.
9. RHETORICAL QUESTION RULE: A question that ends a phase is only permitted in Phase 1 Beat 3 (the curiosity gap). In all other phases, a question asked in narration must be answered within the same phase or in the opening sentence of the very next phase. Questions asked purely for dramatic effect — where no answer follows — are prohibited. They train the viewer to expect payoffs that never arrive, which destroys trust and accelerates dropout. Before writing any question in phases 2 through 10, confirm that the answer exists in the same phase or the next one. If it does not, replace the question with a declarative statement that delivers the information directly."`;
  normalized = normalized.replace(targetProhibitions, replacementProhibitions);

  // 3. Phase title rules
  const targetContinuity = `## CROSS-PHASE CONTINUITY RULES:`;
  const titleRules = `PHASE TITLE RULES — MANDATORY:
1. Every phase title must be unique. No two phases in this script may share the same title or a title that is a minor variation of another.
2. Phase titles must NOT be thematic labels that describe the topic in abstract terms. Titles like 'The Weight of Iron', 'The Paper Breakthrough', or 'The Collapse of Trust' are thematic labels — they tell the viewer what the phase is about without telling them what happens. These are forbidden.
3. Phase titles must describe the specific dramatic action, event, or turning point of that phase — what happens concretely, not what it means abstractly.
4. Good title structure examples: 'The Day the Song Emperor Banned Iron Coins', 'One Loaf. Two Hundred Billion Marks.', 'The Banker Who Burned His Own Currency to Stay Warm', 'Nixon Ends the Gold Standard in Ninety Seconds'.
5. The title should make a viewer scanning a chapter list feel compelled to jump to that timestamp. If the title does not create anticipation or curiosity, rewrite it.
6. Maximum 8 words per title.

`;
  normalized = normalized.replace(targetContinuity, titleRules + targetContinuity);

  // 4. Narration is not a caption rule
  const targetVoiceRule = `9. Every paragraph must end on either a revelation, a question, or a consequence — never a summary statement."`;
  const replacementVoiceRule = `9. Every paragraph must end on either a revelation, a question, or a consequence — never a summary statement.
10. NARRATION IS NOT A CAPTION RULE: Narration must never describe what the viewer can already see on screen. If the visual shows a man sprinting across dust, the narration must not say 'he sprints across the dust.' If the visual shows boys training with spears, the narration must not say 'the boys train with spears.' Narration adds information that is invisible — internal motivation, historical context, consequence, irony, a fact the viewer does not know. Test every narration sentence: could the viewer have figured this out just by watching the image? If yes, rewrite it to add something invisible."`;
  normalized = normalized.replace(targetVoiceRule, replacementVoiceRule);

  // === VVS OPT FIX-6 PROMPT START ===
  const targetJsonRule = `6. Return ONLY raw JSON — no markdown fences, no prose before or after.`;
  const replacementJsonRule = `${targetJsonRule}
7. Also include in your JSON output:
   - key_facts: array of 3-5 key factual claims made in this phase
   - key_images: array of 2-4 vivid visual moments described in this phase
   - key_events: array of 2-4 narrative events that occur in this phase
   - characters_mentioned: array of character names referenced in this phase
   These fields help downstream agents without requiring a separate call.`;
  normalized = normalized.replace(targetJsonRule, replacementJsonRule);
  // === VVS OPT FIX-6 PROMPT END ===

  return normalized;
}

function applyClimaxAndOutroInstructions(prompt: string, phaseNumber: number, plan: PhasePlan = buildPhasePlan(8)): string {
  if (phaseNumber !== plan.climaxPhase && phaseNumber !== plan.outroPhase) return prompt;

  const normalizedPrompt = prompt.replace(/\r\n/g, '\n');

  if (phaseNumber === plan.climaxPhase) {
    const targetMidVideoSection = `=== SECTION: MID-VIDEO PHASES (apply to phase_number 2–${plan.climaxPhase}) ===\n\n"MID-VIDEO PHASE RULES:\n\nEach phase must open with a payoff or a new reveal — never a transition summary.\nBad opening: 'Now that we understand her background, let us examine her political strategy.'\nGood opening: 'The first general she neutralized never saw it coming. Julius Caesar arrived in Alexandria expecting a prisoner. He left as her ally — and had no idea she had orchestrated every second of that meeting.'\n\nREVELATION DENSITY: Each phase must contain at least 2 specific facts, numbers, names, or events that the average viewer does not know. Vague statements about strategy, genius, or influence do not count as revelations.\n"`;
    
    const climaxInstructions = `CLIMAX PHASE RULES (phase ${plan.climaxPhase}) — MANDATORY:
This is the narrative peak. Everything in phases 1 through ${plan.climaxPhase - 1} has been building to this moment.

Rules:
1. The climax must contain ONE specific event, decision, or revelation that has NOT appeared in any earlier phase. Do not reference events already described. Check the locked content list above and do not reuse anything from it.
2. This is NOT a summary of previous phases. Do not recap what already happened.
3. The climax resolves the central tension or question established in Phase 1. If Phase 1 asked how paper money replaced metal, Phase ${plan.climaxPhase} must deliver the definitive answer through a single dramatic moment — not a general statement about trust or civilization.
4. The climax event must be specific: a named person, a specific date, a concrete decision with a concrete consequence. Vague statements about society collapsing or trust evaporating are not a climax — they are filler.
5. After the climax event, deliver one sentence that shows the immediate consequence. Then stop. Do not transition into the outro here.`;

    if (normalizedPrompt.includes(targetMidVideoSection)) {
      return normalizedPrompt.replace(targetMidVideoSection, climaxInstructions);
    } else {
      return normalizedPrompt + "\n\n" + climaxInstructions;
    }
  }

  if (phaseNumber === plan.outroPhase) {
    const targetOutroSection = `=== SECTION: MID-VIDEO PHASES (apply to phase_number 2–${plan.climaxPhase}) ===\n\n"OUTRO PHASE (phase_number = ${plan.outroPhase}):\nDo not summarize the video. The viewer just watched it — they know what happened.\nInstead: deliver one final reframe that makes everything they just watched feel bigger than they realized. End on a statement, not a question. Leave the viewer with something to think about, not something to click on."`;

    const outroInstructions = `OUTRO PHASE RULES (phase ${plan.outroPhase}) — MANDATORY:
The viewer just watched ${plan.climaxPhase} phases. They know what happened. Do not review it.

Rules:
1. Do NOT summarize the video. Do not reference the progression from coins to paper to digital unless you are using it as the basis for a reframe.
2. The outro must deliver ONE reframe: a new way of interpreting everything the viewer just watched that could only land AFTER seeing all ${plan.climaxPhase} phases. The reframe should make the viewer think something they did not think before watching.
3. The reframe must connect the historical story to something the viewer experiences today — a specific, concrete, present-day reality. Not a philosophical abstraction.
4. End on a declarative statement. Not a question. Not 'civilization depends on trust.' A specific, provocative, present-day observation that makes the viewer want to tell someone else what they just learned.
5. Good outro ending example: 'The paper in your wallet has not been backed by gold since 1971. Every purchase you make today runs on the same faith that destroyed Weimar Germany. The experiment never ended. It just got bigger.'
6. Bad outro ending examples: 'Civilization survives only as long as confidence holds firm.' / 'Trust fuels every transaction humans perform.' / 'Money is just a mirror of our internal certainty.' These are vague philosophical statements that leave the viewer with nothing specific to think about.
7. STRUCTURE RULE: The outro must NOT be a list of parallel observations. If more than two consecutive sentences follow the same grammatical pattern (e.g. 'X does Y. A does B. N does M.'), the outro has become a list and must be rewritten. Varied sentence length and structure are mandatory.
8. THE CLOSING STATEMENT RULE: The final 1-3 sentences of the outro must function as a single knockout reframe — one specific, present-day, concrete observation that recontextualizes the entire video. It must name a specific thing the viewer can verify or recognize in their own life today.

Good closing statement examples:
'The paper in your wallet has not been backed by gold since 1971. Every purchase you make today runs on the same faith that destroyed Weimar Germany. The experiment never ended. It just got a server farm.'
'Johan Palmstruch was executed for inventing fractional reserve banking in 1668. His sentence was death. Every bank on Earth still uses his exact method. Nobody remembers his name.'
'Forty-four nations handed the United States control of the global economy in 1944 because they were exhausted and desperate. That deal was never renegotiated. It still runs the world.'

Bad closing statement examples:
'The modern economy functions as a high-frequency game of belief.' — vague, not specific, not verifiable.
'Global markets fluctuate based on sentiment rather than stored commodities.' — lecture observation, not a reframe.
'Your smartphone screen holds the entire weight of your economic existence.' — dramatic but says nothing new.

9. SINGLE THREAD RULE: The outro must follow one continuous thought from its opening sentence to its closing statement. It must not jump between multiple ideas (digital money, algorithms, servers, cybersecurity, smartphones) — pick ONE lens and zoom in on it from start to finish.`;

    if (normalizedPrompt.includes(targetOutroSection)) {
      return normalizedPrompt.replace(targetOutroSection, outroInstructions);
    } else {
      return normalizedPrompt + "\n\n" + outroInstructions;
    }
  }

  return prompt;
}

function applyEscalationInstructions(prompt: string, phaseNumber: number, plan: PhasePlan = buildPhasePlan(8)): string {
  const escalationPhases = plan.layout.filter(p => p.phase_type === 'escalation').map(p => p.phase_number);
  if (!escalationPhases.includes(phaseNumber)) return prompt;

  const normalized = prompt.replace(/\r\n/g, '\n');
  const targetStr = `REVELATION DENSITY: Each phase must contain at least 2 specific facts, numbers, names, or events that the average viewer does not know. Vague statements about strategy, genius, or influence do not count as revelations.`;
  
  const escalationRules = `ESCALATION DIFFERENTIATION RULE — MANDATORY FOR ALL ESCALATION PHASES:
Each escalation phase must introduce a NEW MECHANISM — a new way the system broke, expanded, was abused, or transformed. It is not enough to show the same concept in a new geography or with new characters.

The test: complete this sentence for your phase — 'This phase introduces [specific mechanism] which has not appeared in any earlier phase.'
If the mechanism is 'paper replacing metal' or 'trust replacing weight' or 'portability of wealth' — those are already locked from earlier phases. An escalation phase showing Venetian traders adopting paper money is only valid if it introduces the BILL OF EXCHANGE mechanism, the DOUBLE-ENTRY BOOKKEEPING system, or a specific FAILURE of the credit system — not just paper money spreading to a new location.

Locked concepts that cannot be the PRIMARY focus of any escalation phase because they were established in build_up phases:
- Paper replacing physical metal as a store of value
- Portability of wealth as an advantage over coins
- Trust replacing tangible assets
- Merchants preferring paper for convenience

Valid escalation mechanisms (examples of what constitutes a new mechanism):
- A specific new financial instrument and how it worked (bill of exchange, letter of credit, bond)
- A specific catastrophic failure of a paper money system and its exact cause
- A specific government action that weaponized or corrupted the money supply
- A specific person who exploited or transformed the system in a concrete, nameable way
- The moment a financial concept crossed from one civilization to another and what changed in the crossing

Apply this rule when generating all escalation phases. Before finalizing any escalation phase output, verify: does this phase introduce a mechanism not present in the locked content list? If not, regenerate with a new mechanism.`;

  if (normalized.includes(targetStr)) {
    return normalized.replace(targetStr, `${targetStr}\n\n${escalationRules}`);
  }
  return normalized + "\n\n" + escalationRules;
}

export function applyPhasePromptModifications(
  prompt: string,
  phaseNumber: number,
  prevEndingText?: string | null,
  plan: PhasePlan = buildPhasePlan(8)
): string {
  let normalized = prompt.replace(/\r\n/g, '\n');

  if (prevEndingText) {
    const targetStr = `\n\n## PREVIOUS PHASE ENDING (last 2 sentences — your phase must continue from this):\n${prevEndingText}`;
    const bridgeText = `\n\nPREVIOUS PHASE BRIDGE — CONTEXT ONLY:\n${prevEndingText}\n\nCRITICAL RULES FOR THIS BRIDGE:\n- Do NOT reproduce either of these sentences in your output.\n- Do NOT start this phase with either of these sentences.\n- Do NOT paraphrase or reword either of these sentences as your opening line.\n- Do NOT use these sentences as a transition recap.\n- The viewer just heard these exact words. Your phase must begin AFTER them, advancing the story forward.\n- Use this bridge only to understand the narrative momentum — then continue from where it left off with entirely new content.`;
    normalized = normalized.replace(targetStr, bridgeText);
  }

  normalized = applyClimaxAndOutroInstructions(normalized, phaseNumber, plan);
  normalized = applyEscalationInstructions(normalized, phaseNumber, plan);

  return normalized;
}

export function applyHookBeat3Instructions(prompt: string): string {
  const targetStr = `BEAT 3 — THE QUESTION (1 sentence, max 20 words):\nAsk exactly ONE question that the viewer cannot answer but desperately wants to. This question must be answerable by watching the rest of the video. It must be specific, not philosophical.\nGood: 'How does a queen with no army force the world's most dangerous conquerors to kneel?'\nBad: 'What can we learn from her incredible legacy?'\nBad: 'How did she do it?'\nThis question is your cliffhanger. STOP HERE. Do not answer it. Do not hint at the answer. Do not add any more sentences after this question in the hook.`;
  
  const replacementStr = `BEAT 3 — THE QUESTION (1 sentence, max 20 words):
Ask exactly ONE question that the video will specifically and concretely answer by the end. This question must be about a specific person, event, decision, or mechanism — not about an abstract concept like trust, value, power, or belief.

TEST: Can the viewer point to a specific moment in the video and say 'that scene answered the question'? If yes, the question is valid. If the answer is a philosophical statement rather than a historical fact or event, the question is invalid and must be rewritten.

Good examples:
'How did a condemned Swedish banker's illegal experiment become the blueprint every government on Earth still follows today?'
'What happened in a New Hampshire hotel room that chained every economy on Earth to a single country's printing press?'
'How did a Song Dynasty merchant convince an empire to accept worthless bark as payment for real silk?'

Bad examples (philosophical — cannot be specifically answered by the video):
'What actually gives money its power?' — this is a philosophy question, not a narrative question.
'Would you trust a piece of paper with your life's savings?' — self-directed, not answerable by the video.
'What is the true nature of value?' — abstract concept, no specific answer exists in the video.

The question must name or strongly imply a specific character, place, or event that appears later in the video. It is a promise to the viewer that a specific revelation is coming.`;

  const normalized = prompt.replace(/\r\n/g, '\n');
  return normalized.replace(targetStr, replacementStr);
}

export function buildToneDirectives(scriptTone?: ScriptTone): string {
  const pacing = scriptTone?.pacing ?? 5;
  const emotional = scriptTone?.emotional_intensity ?? 5;
  const style = scriptTone?.narration_style ?? 5;

  let pacingDir = "";
  if (pacing >= 1 && pacing <= 3) {
    pacingDir = "Use a slow, deliberate pacing. Allow scenes to breathe. Avoid rushing transitions between narrative beats.";
  } else if (pacing >= 4 && pacing <= 6) {
    pacingDir = "Use a balanced pacing that moves the story forward steadily without rushing or lingering.";
  } else {
    pacingDir = "Use a fast, urgent pacing. Keep scenes tight and transitions sharp. Every sentence must drive momentum forward.";
  }

  let emotionalDir = "";
  if (emotional >= 1 && emotional <= 3) {
    emotionalDir = "Keep the emotional tone neutral and factual. Avoid dramatic language, hyperbole, or emotionally loaded words.";
  } else if (emotional >= 4 && emotional <= 6) {
    emotionalDir = "Use a moderate emotional register. Allow emotional weight where the story earns it but do not over-dramatise.";
  } else {
    emotionalDir = "Write with high emotional intensity. Use vivid, charged language. Build tension and payoff deliberately across phases.";
  }

  let styleDir = "";
  if (style >= 1 && style <= 3) {
    styleDir = "Write in a strict documentary style. Third-person, objective, evidence-based narration. No flourishes or narrative voice.";
  } else if (style >= 4 && style <= 6) {
    styleDir = "Blend documentary and storytelling. Factual backbone with a narrative voice that engages the viewer.";
  } else {
    styleDir = "Write in a full storytelling style. First or second person where appropriate, immersive scene-setting, and a strong narrative voice throughout.";
  }

  return `${pacingDir}\n${emotionalDir}\n${styleDir}`;
}

// === VVS OPT FIX-4A HELPERS START ===
function buildBibleContext(bible: ProductionBibleData): string {
  return `Characters: ${JSON.stringify(bible.character_roster)}\nLocations: ${JSON.stringify(bible.location_roster)}\nVisual Style Lock: ${JSON.stringify(bible.visual_style_lock)}`;
}
// === VVS OPT FIX-4A HELPERS END ===

// === VVS OPT FIX-4B HELPERS START ===
function splitTranscriptIntoPhaseSegments(
  transcript: string,
  phaseCount: number
): string[] {
  if (!transcript || transcript.trim() === '') return Array(phaseCount).fill('');
  const words = transcript.trim().split(/\s+/);
  const wordsPerSegment = Math.ceil(words.length / phaseCount);
  const segments: string[] = [];
  for (let i = 0; i < phaseCount; i++) {
    const start = i * wordsPerSegment;
    const end = Math.min(start + wordsPerSegment + 50, words.length);
    // +50 word overlap ensures context continuity at segment boundaries
    segments.push(words.slice(start, end).join(' '));
  }
  return segments;
}
const HOOK_MIN = 7;
const MAX_HOOK_RETRIES = 2;
// === VVS OPT FIX-4B HELPERS END ===

export class ScriptAgent extends BaseAgent {
  constructor() {
    super('ScriptAgent');
  }

  async resolveAutoSettings(
    projectId: string,
    topic: string,
    bible: ProductionBibleData,
    apiKey: string | undefined,
    modelName: string | undefined,
    youtubeTranscript?: string | null,
    scriptTone?: ScriptTone
  ): Promise<{
    target_audience: 'gen_z' | 'millennial' | 'gen_x' | 'general';
    hook_regenerate: 'on' | 'off';
    pre_climax_spike: 'on' | 'off';
    long_open_loop: 'on' | 'off';
  }> {
    const targetAudienceRaw = scriptTone?.target_audience || 'auto';
    const hookRegenRaw = scriptTone?.hook_regenerate || 'auto';
    const preClimaxSpikeRaw = scriptTone?.pre_climax_spike || 'auto';
    const longOpenLoopRaw = scriptTone?.long_open_loop || 'auto';

    if (
      targetAudienceRaw !== 'auto' &&
      hookRegenRaw !== 'auto' &&
      preClimaxSpikeRaw !== 'auto' &&
      longOpenLoopRaw !== 'auto'
    ) {
      return {
        target_audience: targetAudienceRaw as any,
        hook_regenerate: hookRegenRaw === 'on' ? 'on' : 'off',
        pre_climax_spike: preClimaxSpikeRaw === 'on' ? 'on' : 'off',
        long_open_loop: longOpenLoopRaw === 'on' ? 'on' : 'off',
      };
    }

    logger.info(`[ScriptAgent] Resolving 'auto' settings for project ${projectId}...`);

    const resolvePrompt = `You are a viral video strategist. Analyze the topic, production bible metadata, and transcript reference to resolve the optimal audience and engagement settings.

Topic: "${topic}"
Bible Genre: "${bible.meta?.genre || 'documentary'}"
Bible Tone: "${bible.meta?.tone || 'dramatic'}"
Niche context: "${bible.meta?.topic || topic}"
Transcript reference: "${youtubeTranscript ? youtubeTranscript.slice(0, 1000) : 'None'}"

Current user preferences:
- Target Audience: ${targetAudienceRaw}
- Hook Auto-Regenerate: ${hookRegenRaw}
- Pre-Climax Spike: ${preClimaxSpikeRaw}
- Long Open Loop: ${longOpenLoopRaw}

For any preference set to 'auto', you must choose the best setting:
1. target_audience: Choose 'gen_z' (for fast-paced, high-energy topics), 'millennial' (for analytical, lifestyle, or self-aware topics), 'gen_x' (for skeptical, detail-oriented, historical/practical topics), or 'general' (for broad, universal themes).
2. hook_regenerate: Choose 'on' to ensure hook optimization unless the topic is extremely academic or factual-sensitive, then 'off'.
3. pre_climax_spike: Choose 'on' to build high tension before the climax, or 'off' for linear pacing.
4. long_open_loop: Choose 'on' to plant a high-retention promise, or 'off' if the story is simple/short.

Reply ONLY with a JSON object containing the resolved keys (do not wrap in markdown or add explanations):
{
  "target_audience": "gen_z" | "millennial" | "gen_x" | "general",
  "hook_regenerate": "on" | "off",
  "pre_climax_spike": "on" | "off",
  "long_open_loop": "on" | "off",
  "reasoning": "brief explanation of choices"
}`;

    try {
      const resolved = await this.generateStructured<any>(
        projectId,
        apiKey,
        modelName,
        {
          prompt: resolvePrompt,
          schema: z.object({
            target_audience: z.enum(['gen_z', 'millennial', 'gen_x', 'general']),
            hook_regenerate: z.enum(['on', 'off']),
            pre_climax_spike: z.enum(['on', 'off']),
            long_open_loop: z.enum(['on', 'off']),
            reasoning: z.string(),
          }),
          temperature: 0.1,
        }
      );

      logger.info(`[ScriptAgent] Resolved 'auto' settings: ${JSON.stringify(resolved)}`);

      return {
        target_audience: targetAudienceRaw === 'auto' ? resolved.target_audience : targetAudienceRaw,
        hook_regenerate: hookRegenRaw === 'auto' ? resolved.hook_regenerate : (hookRegenRaw === 'on' ? 'on' : 'off'),
        pre_climax_spike: preClimaxSpikeRaw === 'auto' ? resolved.pre_climax_spike : (preClimaxSpikeRaw === 'on' ? 'on' : 'off'),
        long_open_loop: longOpenLoopRaw === 'auto' ? resolved.long_open_loop : (longOpenLoopRaw === 'on' ? 'on' : 'off'),
      };
    } catch (err) {
      logger.error(`[ScriptAgent] Error resolving 'auto' settings, falling back to defaults:`, err);
      return {
        target_audience: targetAudienceRaw === 'auto' ? 'general' : targetAudienceRaw,
        hook_regenerate: hookRegenRaw === 'auto' ? 'on' : (hookRegenRaw === 'on' ? 'on' : 'off'),
        pre_climax_spike: preClimaxSpikeRaw === 'auto' ? 'on' : (preClimaxSpikeRaw === 'on' ? 'on' : 'off'),
        long_open_loop: longOpenLoopRaw === 'auto' ? 'on' : (longOpenLoopRaw === 'on' ? 'on' : 'off'),
      };
    }
  }

  /**
   * Generates the full 10-phase script using a two-stage design:
   * Stage A: Generates the 10-phase narration spine coherently in one call.
   * Stage B: Generates visual and structural metadata for all 10 phases in parallel.
   */
  async run(
    topic: string,
    bible: ProductionBibleData,
    projectId: string,
    apiKey: string | undefined,
    modelName?: string,
    config?: { temperature?: number; maxOutputTokens?: number; target_duration_minutes?: number },
    onChunk?: (chunk: string) => void,
    youtubeTranscript?: string | null,
    scriptTone?: ScriptTone,
  ): Promise<ScriptData> {
    const project = ProjectRepository.findById(projectId);
    const durationMinutes = config?.target_duration_minutes ?? project?.target_duration_minutes ?? 8;
    const profile = resolveContentProfile(project?.content_profile || 'viral_story');
    const plan = buildPhasePlan(durationMinutes, profile);

    const resolvedSettings = await this.resolveAutoSettings(
      projectId,
      topic,
      bible,
      apiKey,
      modelName,
      youtubeTranscript,
      scriptTone
    );

    const {
      target_audience: resolvedAudience,
      hook_regenerate: resolvedHookRegen,
      pre_climax_spike: resolvedPreClimaxSpike,
      long_open_loop: resolvedLongOpenLoop
    } = resolvedSettings;

    const toneDirectives = buildToneDirectives(scriptTone);
    const audienceDirectives = buildAudienceDirectives(resolvedAudience);
    const narrationLanguage = project?.narration_language || bible?.meta?.language || 'English';

    // Stage A: Generate narration spine
    const stageAStart = Date.now();
    let spine: any = { title: topic, phases: [] };

    if (plan.phaseCount <= 12) {
      const systemPrompt = applySystemPromptModifications(getScriptSystemPrompt(toneDirectives, audienceDirectives, narrationLanguage));
      const spinePromptRaw = getNarrationSpinePrompt(
        topic,
        bible,
        narrationLanguage,
        toneDirectives,
        audienceDirectives,
        {
          hook_regenerate: resolvedHookRegen,
          pre_climax_spike: resolvedPreClimaxSpike,
          long_open_loop: resolvedLongOpenLoop,
          target_audience: resolvedAudience
        },
        plan,
        youtubeTranscript
      );
      const spinePrompt = applySystemPromptModifications(spinePromptRaw);

      onChunk?.(`\n--- Stage A: Generating Coherent Narration Spine ---\n`);

      spine = await this.generateStructured<any>(
        projectId,
        apiKey,
        modelName, // gemini-2.5-pro
        {
          prompt: `${systemPrompt}\n\n${spinePrompt}`,
          schema: scriptSpineOutputSchema,
          temperature: config?.temperature,
          maxOutputTokens: 32768,
        },
        onChunk
      );

      // Spine QA Check & Inline Regeneration
      let spineViolations = false;
      let feedback = '';

      if (spine && spine.phases) {
        const hookPhase = spine.phases.find((p: any) => p.phase_number === 1);
        if (resolvedHookRegen === 'on' && hookPhase && hookPhase.viral_hook_rating < HOOK_MIN) {
          spineViolations = true;
          feedback += `- The Hook (Phase 1) viral_hook_rating is ${hookPhase.viral_hook_rating}, which is below the minimum threshold of ${HOOK_MIN}. It needs to be more engaging (stronger contradiction, specific stakes with numbers/names, single specific curiosity gap question).\n`;
        }

        for (const p of spine.phases) {
          if (p.phase_number > 1) {
            const words = getWordCount(p.narration_text || '', narrationLanguage);
            const targetMin = plan.wordsPerPhase >= 120 ? 120 : 60;
            const absoluteMin = plan.wordsPerPhase >= 120 ? SOFT_MIN_NARRATION_WORDS : 60;
            if (words < absoluteMin) {
              spineViolations = true;
              feedback += `- Phase ${p.phase_number} narration has only ${words} words, which is under the ${absoluteMin}-word minimum.\n`;
            } else if (words < targetMin) {
              logger.info(`[ScriptAgent] Phase ${p.phase_number} narration has ${words} words (under the ${targetMin}-word target, but within acceptable soft threshold of ${absoluteMin}).`);
            }
          }
        }

        if (resolvedLongOpenLoop === 'on') {
          const plantPhase = spine.phases.find((p: any) => p.open_loop_role === 'plant');
          const payoffPhase = spine.phases.find((p: any) => p.open_loop_role === 'payoff');
          if (!plantPhase || !payoffPhase) {
            spineViolations = true;
            feedback += `- Missing long open loop plant or payoff. A plant must be placed in Phase ${plan.plantPhase} and paid off in Phase ${plan.payoffPhase}/Climax.\n`;
          }
        }
      } else {
        spineViolations = true;
        feedback += `- Spine generation returned invalid phases.\n`;
      }

      if (spineViolations) {
        logger.info(`[ScriptAgent] Spine QA violations detected. Regenerating spine (Attempt 2/2)...`);
        onChunk?.(`\n--- Spine QA failed. Regenerating with feedback... ---\n`);

        const retryPrompt = `${spinePrompt}\n\nFEEDBACK FROM PREVIOUS ATTEMPT:\n${feedback}\nAnalyze the previous errors, correct the word counts and settings, and output a valid, high-quality JSON.`;
        try {
          const retrySpine = await this.generateStructured<any>(
            projectId,
            apiKey,
            modelName,
            {
              prompt: `${systemPrompt}\n\n${retryPrompt}`,
              schema: scriptSpineOutputSchema,
              temperature: config?.temperature,
              maxOutputTokens: 32768,
            },
            onChunk
          );

          if (retrySpine && retrySpine.phases && retrySpine.phases.length > 0) {
            spine = retrySpine;
            logger.info(`[ScriptAgent] Spine regenerated successfully.`);
          }
        } catch (retryErr) {
           logger.error(`[ScriptAgent] Spine regeneration attempt failed:`, retryErr);
        }
      }
    } else {
      // Chunked path:
      // 1. STAGE A1 — Outline
      const outlineSystemPrompt = applySystemPromptModifications(getScriptSystemPrompt(toneDirectives, audienceDirectives, narrationLanguage));
      const outlinePrompt = getOutlinePrompt(plan, topic, bible, narrationLanguage, toneDirectives, audienceDirectives, {
        hook_regenerate: resolvedHookRegen,
        pre_climax_spike: resolvedPreClimaxSpike,
        long_open_loop: resolvedLongOpenLoop,
        target_audience: resolvedAudience
      });
      
      onChunk?.(`\n--- Stage A1: Generating Coherent Narration Outline ---\n`);
      
      let outline = await this.generateStructured<any>(
        projectId,
        apiKey,
        modelName,
        {
          prompt: `${outlineSystemPrompt}\n\n${outlinePrompt}`,
          schema: scriptOutlineOutputSchema,
          temperature: config?.temperature,
          maxOutputTokens: 16384,
        },
        onChunk
      );

      // Guard: if outline.phases.length < plan.phaseCount, log warning and retry once
      const getOutlinePhasesCount = () => (outline && outline.phases) ? outline.phases.length : 0;
      if (!outline || !outline.phases || getOutlinePhasesCount() < plan.phaseCount) {
        logger.warn(`[ScriptAgent] OUTLINE_SHORT expected=${plan.phaseCount} got=${getOutlinePhasesCount()}. Retrying outline generation...`);
        try {
          outline = await this.generateStructured<any>(
            projectId,
            apiKey,
            modelName,
            {
              prompt: `${outlineSystemPrompt}\n\n${outlinePrompt}\n\nWARNING: The previous outline had only ${getOutlinePhasesCount()} phases but exactly ${plan.phaseCount} are required. You MUST generate exactly ${plan.phaseCount} phases.`,
              schema: scriptOutlineOutputSchema,
              temperature: config?.temperature,
              maxOutputTokens: 16384,
            },
            onChunk
          );
        } catch (retryOutlineErr) {
          logger.error(`[ScriptAgent] Outline generation retry failed:`, retryOutlineErr);
        }
      }

      // 2. STAGE A2 — Narration fill
      onChunk?.(`\n--- Stage A2: Generating Batches of Narration Text ---\n`);
      const fullOutline = outline || { title: topic, phases: [] };
      const outlinePhases = Array.isArray(fullOutline.phases) ? fullOutline.phases : [];

      // Split phases into batches of size 6
      const BATCH_SIZE = 6;
      const batches: number[][] = [];
      for (let i = 1; i <= plan.phaseCount; i += BATCH_SIZE) {
        const batch: number[] = [];
        for (let j = i; j < i + BATCH_SIZE && j <= plan.phaseCount; j++) {
          batch.push(j);
        }
        batches.push(batch);
      }

      // We'll execute batches in parallel with limit = 3
      const limit = pLimit(3);
      const batchResults = await Promise.all(
        batches.map((batchNums) =>
          limit(async () => {
            const fillSystemPrompt = applySystemPromptModifications(getScriptSystemPrompt(toneDirectives, audienceDirectives, narrationLanguage));
            const fillPrompt = getNarrationFillPrompt(plan, fullOutline, batchNums, narrationLanguage, toneDirectives, audienceDirectives, {
              hook_regenerate: resolvedHookRegen,
              pre_climax_spike: resolvedPreClimaxSpike,
              long_open_loop: resolvedLongOpenLoop,
              target_audience: resolvedAudience
            });
            
            logger.info(`[ScriptAgent] Generating batch of narration for phases: ${batchNums.join(', ')}`);
            
            const batchOutput = await this.generateStructured<any>(
              projectId,
              apiKey,
              modelName,
              {
                prompt: `${fillSystemPrompt}\n\n${fillPrompt}`,
                schema: z.object({
                  phases: z.array(z.object({
                    phase_number: z.number().int(),
                    narration_text: z.string()
                  }))
                }),
                temperature: config?.temperature,
                maxOutputTokens: 16384,
              }
            );

            return batchOutput?.phases || [];
          })
        )
      );

      // Flatten all batch results
      const filledNarrations = batchResults.flat();
      const narrationMap = new Map<number, string>();
      for (const item of filledNarrations) {
        if (item && typeof item.phase_number === 'number') {
          narrationMap.set(item.phase_number, item.narration_text || '');
        }
      }

      // 3. MERGE by phase_number
      const mergedPhases = plan.layout.map(lay => {
        const outItem = outlinePhases.find((p: any) => p.phase_number === lay.phase_number) || {};
        const narration_text = narrationMap.get(lay.phase_number) || '';
        const narration_word_count = getWordCount(narration_text, narrationLanguage);

        return {
          phase_number: lay.phase_number,
          phase_type: lay.phase_type,
          phase_title: outItem.phase_title || `Phase ${lay.phase_number}`,
          narration_text,
          viral_hook_rating: outItem.viral_hook_rating ?? 7,
          rehook_type: outItem.rehook_type ?? null,
          open_loop_role: outItem.open_loop_role ?? 'none',
          narration_word_count,
        };
      });

      spine = {
        title: fullOutline.title || topic,
        phases: mergedPhases
      };
    }

    const gotPhasesCount = (spine && spine.phases) ? spine.phases.length : 0;
    if (!spine || !spine.phases || gotPhasesCount < plan.phaseCount) {
      logger.warn(`[ScriptAgent] SPINE_TRUNCATED expected=${plan.phaseCount} got=${gotPhasesCount}`);
    }

    const stageAEnd = Date.now();
    logger.info(`[ScriptAgent] Stage A duration: ${((stageAEnd - stageAStart) / 1000).toFixed(1)}s using ${modelName}`);

    // Safety: If long_open_loop === 'on', force plant and payoff safety overrides on metadata
    if (resolvedLongOpenLoop === 'on' && spine && spine.phases) {
      const pPlant = spine.phases.find((p: any) => p.phase_number === plan.plantPhase);
      if (pPlant) pPlant.open_loop_role = 'plant';
      const pPayoff = spine.phases.find((p: any) => p.phase_number === plan.payoffPhase);
      if (pPayoff) pPayoff.open_loop_role = 'payoff';
    }

    // Stage B: Parallel Expansion
    onChunk?.(`\n--- Stage B: Expanding Phase Visuals and Metadata in Parallel ---\n`);
    const stageBStart = Date.now();

    const bibleContextBlock = buildBibleContext(bible);
    const limit = pLimit(4);

    // Precompute all phase summaries for deduplication reference in expansions
    const allPhaseSummaries = spine.phases
      .map((p: any) => `Phase ${p.phase_number} (${p.phase_title}): Narration: "${p.narration_text.slice(0, 120)}..."`)
      .join('\n');

    const expansions = await Promise.all(
      spine.phases.map((p: any) =>
        limit(async () => {
          const expansionPrompt = getPhaseExpansionPrompt(p, allPhaseSummaries, bibleContextBlock, narrationLanguage);
          
          try {
            // We pass 'gemini-2.5-flash' model name here explicitly
            return await this.generateStructured<any>(
              projectId,
              apiKey,
              'gemini-2.5-flash',
              {
                prompt: expansionPrompt,
                schema: scriptPhaseExpansionSchema,
                temperature: config?.temperature,
                maxOutputTokens: 3000,
                phaseNumber: p.phase_number,
              }
            );
          } catch (err) {
            logger.error(`[ScriptAgent] Expansion failed for Phase ${p.phase_number}, retrying once sequentially...`, err);
            try {
              return await this.generateStructured<any>(
                projectId,
                apiKey,
                'gemini-2.5-flash',
                {
                  prompt: expansionPrompt,
                  schema: scriptPhaseExpansionSchema,
                  temperature: config?.temperature,
                  maxOutputTokens: 3000,
                  phaseNumber: p.phase_number,
                }
              );
            } catch (retryErr) {
              logger.error(`[ScriptAgent] Expansion retry failed for Phase ${p.phase_number}. Using fallback.`, retryErr);
              return null;
            }
          }
        })
      )
    );
    const stageBEnd = Date.now();
    logger.info(`[ScriptAgent] Stage B duration: ${((stageBEnd - stageBStart) / 1000).toFixed(1)}s using gemini-2.5-flash`);

    // Merge spine and expansions
    const finalPhases: any[] = [];
    for (let i = 0; i < spine.phases.length; i++) {
      const spinePhase = spine.phases[i];
      const exp = expansions[i];

      const mergedPhase: any = {
        ...spinePhase,
        phase_content: exp?.phase_content ?? `[${spinePhase.phase_type}] ${spinePhase.phase_title}`,
        key_events: exp?.key_events ?? [],
        key_facts: exp?.key_facts ?? [],
        key_images: exp?.key_images ?? [],
        character_ids_active: exp?.character_ids_active ?? [],
        characters_mentioned: exp?.characters_mentioned ?? [],
        location_id_primary: exp?.location_id_primary ?? 'LOC_001',
      };

      // Recount words
      const words = getWordCount(mergedPhase.narration_text ?? '', narrationLanguage);
      mergedPhase.narration_word_count = words;

      // Compute duration (words / 2.5, min 8)
      mergedPhase.estimated_duration_seconds = Math.max(8, Math.round(words / 2.5));

      // Validate against the canonical contract
      const validation = optimizedScriptPhaseItemSchema.safeParse(mergedPhase);
      if (!validation.success) {
        logger.warn(`[ScriptAgent] Merged Phase ${mergedPhase.phase_number} failed validation against optimizedScriptPhaseItemSchema. Zod error:`, validation.error);
        // Fallback adjustments
        mergedPhase.key_events = mergedPhase.key_events || [];
        mergedPhase.key_facts = mergedPhase.key_facts || [];
        mergedPhase.key_images = mergedPhase.key_images || [];
        mergedPhase.character_ids_active = mergedPhase.character_ids_active || [];
        mergedPhase.location_id_primary = mergedPhase.location_id_primary || 'LOC_001';
        mergedPhase.estimated_duration_seconds = mergedPhase.estimated_duration_seconds || 30;
        mergedPhase.viral_hook_rating = mergedPhase.viral_hook_rating || 7;
        mergedPhase.rehook_type = mergedPhase.rehook_type || null;
        mergedPhase.open_loop_role = mergedPhase.open_loop_role || 'none';
      } else {
        // Use parsed/transformed properties
        finalPhases.push(validation.data);
        continue;
      }
      finalPhases.push(mergedPhase);
    }

    const totalSec = finalPhases.reduce((acc, p) => acc + (p.estimated_duration_seconds || 30), 0);
    const totalMin = Math.round((totalSec / 60) * 10) / 10;

    return {
      title: spine.title || `${topic} Script`,
      phases: finalPhases,
      total_estimated_duration_minutes: totalMin,
      target_audience: resolvedAudience,
      hook_regenerate: resolvedHookRegen,
      pre_climax_spike: resolvedPreClimaxSpike,
      long_open_loop: resolvedLongOpenLoop
    };
  }

  /**
   * Regenerates a single phase in isolation.
   * Used when the user wants to re-roll one phase without touching the rest.
   */
  async regeneratePhase(
    projectId: string,
    phaseNumber: number,
    phaseTitle: string,
    currentContent: string,
    topic: string,
    bible: ProductionBibleData,
    apiKey: string | undefined,
    modelName?: string,
    config?: { temperature?: number; maxOutputTokens?: number },
    onChunk?: (chunk: string) => void,
    feedback?: string,
    allPhases?: any[],
    scriptTone?: ScriptTone,
  ): Promise<{ phase_title: string; phase_content: string; narration_text?: string; rehook_type?: string | null }> {
    const existingScript = ScriptRepository.findByProjectId(projectId);
    let resolvedAudience: 'gen_z' | 'millennial' | 'gen_x' | 'general' = 'general';
    let resolvedPreClimaxSpike: 'on' | 'off' = 'off';
    let resolvedLongOpenLoop: 'on' | 'off' = 'off';

    if (existingScript) {
      try {
        const scriptData = JSON.parse(existingScript.raw_json) as ScriptData;
        resolvedAudience = (scriptData.target_audience as any) || 'general';
        resolvedPreClimaxSpike = (scriptData.pre_climax_spike as any) || 'off';
        resolvedLongOpenLoop = (scriptData.long_open_loop as any) || 'off';
      } catch (e) {
        logger.error(`[ScriptAgent] Error parsing existing script raw_json for regeneration:`, e);
      }
    } else {
      resolvedAudience = scriptTone?.target_audience === 'auto' ? 'general' : (scriptTone?.target_audience || 'general');
      resolvedPreClimaxSpike = scriptTone?.pre_climax_spike === 'on' ? 'on' : 'off';
      resolvedLongOpenLoop = scriptTone?.long_open_loop === 'on' ? 'on' : 'off';
    }

    const toneDirectives = buildToneDirectives(scriptTone);
    const audienceDirectives = buildAudienceDirectives(resolvedAudience);
    const project = ProjectRepository.findById(projectId);
    const durationMinutes = project?.target_duration_minutes ?? 8;
    const profile = resolveContentProfile(project?.content_profile || 'viral_story');
    const plan = buildPhasePlan(durationMinutes, profile);
    const narrationLanguage = project?.narration_language || bible?.meta?.language || 'English';

    const existingPhase = allPhases?.find(p => p.phase_number === phaseNumber);
    const openLoopRole = existingPhase?.open_loop_role ?? (phaseNumber === plan.plantPhase && resolvedLongOpenLoop === 'on' ? 'plant' : (phaseNumber === plan.payoffPhase && resolvedLongOpenLoop === 'on' ? 'payoff' : 'none'));
    const preClimaxSpikeEnabled = existingPhase ? (existingPhase.rehook_type === 'pre_climax_spike') : (phaseNumber === plan.preClimaxSpikePhase && resolvedPreClimaxSpike === 'on');

    let prompt = getPhaseRegeneratePrompt(
      phaseNumber,
      phaseTitle,
      currentContent,
      topic,
      bible,
      feedback,
      allPhases,
      toneDirectives,
      preClimaxSpikeEnabled,
      openLoopRole,
      audienceDirectives,
      narrationLanguage,
      plan.rehookPhases
    );
    prompt = prompt.replace(/\r\n/g, '\n');

    if (allPhases) {
      const preceding = allPhases.find(p => p.phase_number === phaseNumber - 1);
      if (preceding) {
        const lastSentences = getLastSentences(preceding.narration_text ?? '', 2, narrationLanguage);
        const targetStr = `\n\nPREVIOUS_PHASE_CONTEXT:\nPhase ${preceding.phase_number} (${preceding.phase_type}): "${preceding.phase_title}"\nContent: ${preceding.phase_content}\nNarration (last 2 sentences): ${lastSentences}`;
        const bridgeText = `\n\nPREVIOUS PHASE BRIDGE — CONTEXT ONLY:\n${lastSentences}\n\nCRITICAL RULES FOR THIS BRIDGE:\n- Do NOT reproduce either of these sentences in your output.\n- Do NOT start this phase with either of these sentences.\n- Do NOT paraphrase or reword either of these sentences as your opening line.\n- Do NOT use these sentences as a transition recap.\n- The viewer just heard these exact words. Your phase must begin AFTER them, advancing the story forward.\n- Use this bridge only to understand the narrative momentum — then continue from where it left off with entirely new content.`;
        prompt = prompt.replace(targetStr, bridgeText);
      }
    }

    prompt = applyClimaxAndOutroInstructions(prompt, phaseNumber, plan);
    prompt = applyEscalationInstructions(prompt, phaseNumber, plan);
    prompt = applySystemPromptModifications(prompt);
    prompt = applyHookBeat3Instructions(prompt);

    const extractionMap = new Map<number, ExtractedContent>();

    if (phaseNumber >= 2) {
      try {
        const dbPhases = ScriptRepository.findPhasesByProjectId(projectId);
        const priorPhases = dbPhases
          .filter(p => p.phase_number < phaseNumber)
          .sort((a, b) => a.phase_number - b.phase_number);

        for (const p of priorPhases) {
          const extractPrompt = `Extract the key content from the following script phase as a JSON object. Return ONLY valid JSON with no preamble:
{ 'facts': string[], 'images': string[], 'events': string[], 'characters_used': string[] }
facts = specific numbers, dates, named statistics (e.g. '200 billion marks', '1024 AD', '50 pounds of iron').
images = specific sensory/visual descriptions used (e.g. 'iron coins clanking', 'wheelbarrow of money', 'burning banknotes').
events = named historical events or turning points referenced (e.g. 'Jiaozi introduction', 'WWI gold standard abandonment').
characters_used = named characters who appear in this phase.
Phase content: ${p.narration_text || ''}`;

          (this as any).agentName = 'ScriptAgent_ContentExtractor';
          try {
            const extraction = await this.generateStructured<ExtractedContent>(
              projectId,
              apiKey,
              modelName,
              {
                prompt: extractPrompt,
                schema: scriptExtractionSchema,
                temperature: 0.1,
              }
            );
            extractionMap.set(p.phase_number, extraction);
          } catch (extractErr) {
            logger.error(`[ContentExtractor] Error extracting content for phase ${p.phase_number}:`, extractErr);
          } finally {
            (this as any).agentName = 'ScriptAgent';
          }
        }
      } catch (dbErr) {
        logger.error(`[ScriptAgent] Error fetching or extracting prior phases for regeneration:`, dbErr);
      }
    }

    if (phaseNumber >= 2 && extractionMap.size > 0) {
      const combined = getCombinedLockedContent(extractionMap, phaseNumber - 1);
      const lockedText = buildLockedContentSection(
        combined.facts,
        combined.images,
        combined.events,
        combined.characters_used
      );

      const injectIndex = prompt.indexOf("=== SECTION:");
      if (injectIndex !== -1) {
        prompt = prompt.slice(0, injectIndex) + lockedText + "\n\n" + prompt.slice(injectIndex);
      } else {
        prompt = prompt + "\n\n" + lockedText;
      }
    }

    return this.generateStructured<z.infer<typeof phaseRegenerateSchema>>(
      projectId,
      apiKey,
      modelName,
      {
        prompt,
        schema: phaseRegenerateSchema,
        temperature: config?.temperature,
        maxOutputTokens: config?.maxOutputTokens,
      },
      onChunk,
    );
  }

  async validateRehook(
    projectId: string,
    narrationText: string,
    apiKey: string | undefined,
    modelName?: string
  ): Promise<{ validated: boolean; detected_type: string; reason: string }> {
    const prompt = `Does the following narration contain a clear re-engagement beat (new question, revelation, stakes escalation, or pattern interrupt) within its first 2 sentences? Reply only with JSON: { "validated": boolean, "detected_type": string, "reason": string }

Narration:
"${narrationText}"`;

    return this.generateStructured<z.infer<typeof validateRehookSchema>>(
      projectId,
      apiKey,
      modelName,
      {
        prompt,
        schema: validateRehookSchema,
        temperature: 0.1,
      }
    );
  }

  async rewriteHookWithSuggestions(
    projectId: string,
    narrationText: string,
    hookScoreBreakdown: any,
    bible: ProductionBibleData,
    phase2NarrationText: string,
    apiKey: string | undefined,
    modelName?: string,
    config?: { temperature?: number; maxOutputTokens?: number },
    onChunk?: (chunk: string) => void,
    scriptTone?: ScriptTone,
  ): Promise<string> {
    const overall = hookScoreBreakdown.overall || 0;
    const feedback = hookScoreBreakdown.feedback || '';
    const suggestions = hookScoreBreakdown.suggestions || [];

    const suggestionsList = suggestions.map((s: string, idx: number) => `${idx + 1}. ${s}`).join('\n');
    const bibleChars = bible.character_roster.map(c => `- ${c.name}: ${c.role} (${c.physical_description})`).join('\n');
    const bibleStyle = bible.visual_style_lock.veo_style_tokens.join(', ');

    const existingScript = ScriptRepository.findByProjectId(projectId);
    let resolvedAudience: 'gen_z' | 'millennial' | 'gen_x' | 'general' = 'general';

    if (existingScript) {
      try {
        const scriptData = JSON.parse(existingScript.raw_json) as ScriptData;
        resolvedAudience = (scriptData.target_audience as any) || 'general';
      } catch (e) {
        logger.error(`[ScriptAgent] Error parsing existing script raw_json for rewrite:`, e);
      }
    } else {
      resolvedAudience = scriptTone?.target_audience === 'auto' ? 'general' : (scriptTone?.target_audience || 'general');
    }

    const audienceDirectives = buildAudienceDirectives(resolvedAudience);

    const pacing = scriptTone?.pacing ?? 5;
    const emotional = scriptTone?.emotional_intensity ?? 5;
    const style = scriptTone?.narration_style ?? 5;

    const prompt = `You are rewriting Phase 1 (HOOK) of a YouTube video script. The previous version scored ${overall}/10 on hook quality and FAILED the minimum threshold of 7.0.

## AUDIENCE DIRECTIVES
${audienceDirectives}

HOOK SCORER FEEDBACK:
- Pattern Interrupt: ${hookScoreBreakdown.pattern_interrupt || 0}/10
- Stakes Clarity: ${hookScoreBreakdown.stakes_clarity || 0}/10
- Curiosity Gap: ${hookScoreBreakdown.curiosity_gap || 0}/10
- Scroll Stop Power: ${hookScoreBreakdown.scroll_stop_power || 0}/10
Overall feedback: ${feedback}

MANDATORY REWRITE INSTRUCTIONS (you MUST apply ALL of these):
${suggestionsList}

ORIGINAL NARRATION (rewrite this, do not return it unchanged):
${narrationText}

PRODUCTION BIBLE CONTEXT:
${bibleChars}
${bibleStyle}

NEXT PHASE CONTINUITY (your rewrite must flow into this):
${phase2NarrationText}

SCRIPT TONE:
Pacing: ${pacing}/10, Emotional Intensity: ${emotional}/10, Narration Style: ${style}/10

=== SECTION: NARRATION VOICE ===

NARRATION VOICE — MANDATORY RULES:
1. Write like you are telling a story to one person, not presenting to an audience.
2. Short sentences hit harder than long ones. After every sentence longer than 15 words, write one under 8 words.
3. Never use these clichés: 'You have been fed a...', 'History books will tell you...', 'Most people don't know...', 'What they don't want you to know...', 'Let that sink in.', 'The truth is...', 'It's more complicated than that.', 'Throughout history...', 'In a world where...'
4. Do not summarize or explain what the video will cover.
5. Specific beats abstract every time.
6. Never end a sentence with a vague noun: power, strategy, legacy, wisdom, influence, history, politics.
7. Vary sentence openings. Never start two consecutive sentences with the same word. Never start more than one sentence per paragraph with 'She', 'He', 'They', or 'It'.
8. No passive voice.
9. End on a question or consequence.

=== SECTION: PHASE 1 HOOK ===

PHASE 1 HOOK — CRITICAL RULES:
1. BEAT 1 — THE CONTRADICTION (sentences 1–2, max 25 words total): Open with a direct statement that contradicts what the viewer already believes. No questions or promises.
2. BEAT 2 — THE STAKES (sentences 3–5, max 50 words total): Establish what was actually at stake with specific facts/numbers.
3. BEAT 3 — THE QUESTION (1 sentence, max 20 words):
Ask exactly ONE question that the video will specifically and concretely answer by the end. This question must be about a specific person, event, decision, or mechanism — not about an abstract concept like trust, value, power, or belief.

TEST: Can the viewer point to a specific moment in the video and say 'that scene answered the question'? If yes, the question is valid. If the answer is a philosophical statement rather than a historical fact or event, the question is invalid and must be rewritten.

Good examples:
'How did a condemned Swedish banker's illegal experiment become the blueprint every government on Earth still follows today?'
'What happened in a New Hampshire hotel room that chained every economy on Earth to a single country's printing press?'
'How did a Song Dynasty merchant convince an empire to accept worthless bark as payment for real silk?'

Bad examples (philosophical — cannot be specifically answered by the video):
'What actually gives money its power?' — this is a philosophy question, not a narrative question.
'Would you trust a piece of paper with your life's savings?' — self-directed, not answerable by the video.
'What is the true nature of value?' — abstract concept, no specific answer exists in the video.

The question must name or strongly imply a specific character, place, or event that appears later in the video. It is a promise to the viewer that a specific revelation is coming.
4. HARD STOP RULE: Do not add any sentences after the question. No explanation of what the video will cover.

=== SECTION: WHAT TO NEVER WRITE ===

UNIVERSAL PROHIBITIONS:
1. Never write a sentence whose only job is to tell the viewer what the next sentence will say.
2. Never use the word 'journey'.
3. Never use 'delve', 'tapestry', 'multifaceted', 'nuanced', 'realm', 'profound', 'pivotal', 'bustling', 'game-changer', 'paradigm', 'landmark', 'groundbreaking', 'testament', 'spearhead', 'beacon', 'unleash', 'supercharge'.
4. Never write in lists.
5. Never tell the viewer how to feel.
6. Never end on a call to action.

RULES:
- Word count: 120–140 words. Keep it brief but satisfy the 120-word minimum constraint.
- Must follow the Contradiction → Stakes → Question structure exactly.
- Return ONLY the rewritten narration_text as plain text, no JSON, no headers.`;

    return this.executeRawCall(
      projectId,
      apiKey,
      modelName,
      prompt,
      'ScriptAgent_HookRewrite',
      config,
      onChunk
    );
  }

  async rewriteNarrationForCredibility(options: {
    projectId: string;
    phaseText: string;
    issues: any[];
    prevPhaseText: string;
    nextPhaseText: string;
    bibleContext: string;
    languageRules: LanguageRules;
    minWords: number;
    apiKey: string | undefined;
    modelName?: string;
    config?: { temperature?: number; maxOutputTokens?: number };
    onChunk?: (chunk: string) => void;
  }): Promise<string> {
    const issuesList = options.issues.map((issue, idx) => {
      const claim = issue.claim;
      const problem = issue.explanation;
      const correction = issue.suggested_correction || '';
      return `${idx + 1}. Claim: "${claim}" / Problem: ${problem} / REQUIRED CORRECTION: incorporate "${correction}"`;
    }).join('\n');

    const prompt = `You are an expert script editor. Rewrite ONLY this phase's narration to correct the factual/credibility issue(s), changing as little else as possible.

ISSUE(S):
${issuesList}

ORIGINAL NARRATION:
"${options.phaseText}"

CONTINUITY (must still flow):
prev="${options.prevPhaseText}"
next="${options.nextPhaseText}"

BIBLE CONTEXT:
${options.bibleContext}

LANGUAGE CONSTRAINTS:
${options.languageRules.narrationHint || 'Write in the same language as the original narration.'}

HARD RULES:
1. Keep narration in the SAME language.
2. Do NOT drop below the phase minimum word count (${options.minWords}).
3. Do not add English into narration_text.
4. Return ONLY the rewritten narration.`;

    return this.executeRawCall(
      options.projectId,
      options.apiKey,
      options.modelName,
      prompt,
      'ScriptAgent_CredibilityRewrite',
      options.config,
      options.onChunk
    );
  }
}

// Singleton — imported by the route handler
export const scriptAgent = new ScriptAgent();
