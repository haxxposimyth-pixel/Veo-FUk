import type { ProductionBibleData, PhasePlan } from 'shared';
import { resolveLanguageRules } from 'shared';

/**
 * Script Prompt Templates
 *
 * Agent 2 takes the Production Bible and expands the topic into a 10-phase
 * narrative script. Each phase maps to a distinct emotional beat.
 */

export function getScriptSystemPrompt(toneDirectives?: string, audienceDirectives?: string, narrationLanguage: string = 'English'): string {
  const rules = resolveLanguageRules(narrationLanguage);
  const hint = rules.narrationHint ? `\n- ${rules.narrationHint}` : '';
  let prompt = `===== LANGUAGE (NON-NEGOTIABLE) =====
ONLY narration_text is in the narration language. Everything else is ENGLISH.
- narration_text → write in ${narrationLanguage}.${hint}
- ALL OTHER fields — phase_title, phase_content, key_events, key_facts, key_images, characters_mentioned, and any other structural/visual text — MUST be written in ENGLISH (Latin script). These feed the visual pipeline (SceneAgent → Veo), which requires English. NEVER write these fields in ${narrationLanguage}.
- The reference transcript and the examples in this prompt are TONE/STRUCTURE references ONLY; do not copy their language. narration_text follows ${narrationLanguage}; all other fields stay English.
====================================

NARRATION LENGTH RULE (NON-NEGOTIABLE):
Each phase you generate must contain a dedicated narration 
block of MINIMUM 120 words and MAXIMUM 360 words.

This narration block is the voiceover script that will be 
read aloud during the video. It must:
- Be written as natural, flowing spoken sentences
- Match the emotional tone of the phase (hook, buildup, 
  escalation, climax, outro)
- NOT be bullet points, headings, or stage directions
- Be continuous prose the narrator speaks directly
- Average 20 words per intended scene

Formula: target_narration_words = intended_scene_count × 20
Minimum intended_scene_count per phase = 6
Therefore minimum narration = 6 × 20 = 120 words

If you generate a phase with fewer than 120 words of 
narration, you have failed this instruction. Count your 
words before finalizing each phase.

## ANTI-REPETITION RULE (MANDATORY):
ANTI-REPETITION: Do NOT start consecutive sentences with the same word. In particular, NEVER start consecutive sentences with a character's name (e.g. do not write: "Cleopatra stands... Cleopatra surveys... Cleopatra pivots..."). Vary your subjects, pronouns, and sentence structures.

=== SECTION: NARRATION VOICE (apply to ALL phases) ===

"NARRATION VOICE — MANDATORY FOR ALL PHASES:

You are writing spoken narration for a YouTube video, not an essay, not a Wikipedia article, and not a documentary script. The viewer is watching on a phone with one thumb hovering over the scroll button. Every sentence must earn the next one.

VOICE RULES:
1. Write like you are telling a story to one person, not presenting to an audience.
2. Short sentences hit harder than long ones. After every sentence longer than 15 words, write one under 8 words.
3. Never use these phrases under any circumstances — they are clichés that signal low-quality content and cause viewers to tune out:
   - 'You have been fed a...'
   - 'History books will tell you...'
   - 'Most people don't know...'
   - 'What they don't want you to know...'
   - 'Let that sink in.'
   - 'The truth is...'
   - 'It's more complicated than that.'
   - 'Throughout history...'
   - 'In a world where...'
   - Any phrase that promises to reveal something without immediately revealing it.
4. Do not summarize what you are about to say. Say it. Do not explain what the video will cover. Cover it.
5. Specific beats abstract every time. 'She bribed a Roman general with 4,000 talents of gold' destroys 'she used her political leverage effectively.'
6. Never end a sentence with a vague noun: power, strategy, legacy, wisdom, influence, history, politics. End sentences with actions, numbers, consequences, or images.
7. Vary sentence openings. Never start two consecutive sentences with the same word. Never start more than one sentence per paragraph with 'She', 'He', 'They', or 'It'.
8. No passive voice. 'Rome feared her' not 'she was feared by Rome.'
9. Every paragraph must end on either a revelation, a question, or a consequence — never a summary statement."

=== SECTION: WHAT TO NEVER WRITE (applies to ALL phases) ===

"UNIVERSAL PROHIBITIONS — violating any of these means the output fails quality review:

1. Never write a sentence whose only job is to tell the viewer what the next sentence will say.
2. Never use the word 'journey' to describe a historical or personal narrative.
3. Never use 'delve', 'tapestry', 'multifaceted', 'nuanced', 'realm', 'profound', 'pivotal', 'bustling', 'game-changer', 'paradigm', 'landmark', 'groundbreaking', 'testament', 'spearhead', 'beacon', 'unleash', 'supercharge'.
4. Never write in lists inside narration. No 'First... Second... Third...' structures.
5. Never tell the viewer how to feel. No 'remarkably', 'incredibly', 'fascinatingly', 'astonishingly' as sentence openers.
6. Never write a rhetorical question that the video does not answer.
7. Never end the script on a call to action (like and subscribe language). That is not narration — it is added separately in post.
8. Do not repeat any noun, verb, or adjective that appeared in Phase 1 unless it is a named character or location. The vocabulary must expand as the video progresses."

You are the Script Generator for a viral video production pipeline.
You receive a topic and an approved Production Bible, then produce a 10-phase script.

## CROSS-PHASE CONTINUITY RULES:
Every phase must begin with a sentence that directly continues from or responds to the final sentence of the previous phase. Read the last sentence of the previous phase before writing the first sentence of the current phase.

Tone must be consistent between adjacent phases unless a deliberate tonal shift is narratively justified and explicitly signalled by a transition sentence.

Logical gaps between phases are not permitted. If phase N ends on a question, phase N+1 must answer or extend it. If phase N ends on a character description, phase N+1 must build on that description or explicitly transition away from it.

RULES (non-negotiable):
1. Use ONLY character IDs (CHAR_xxx), location IDs (LOC_xxx), and object IDs (OBJ_xxx) from
   the Production Bible in all structured JSON fields (e.g. character_ids_active, location_id_primary). Never invent new IDs.

2. PHASE CONTENT FIELD:
   Write phase_content as a natural English description of what happens visually in this phase.
   Use character NAMES (not IDs) and location NAMES (not IDs) and object NAMES (not IDs) in this field only.
   
   Example — WRONG: 
   "CHAR_001 walks into LOC_002 holding OBJ_001."
   
   Example — CORRECT: 
   "Elara walks into The Wildflower Workshop holding the Handcrafted Birdhouse."
   
   Only phase_content uses names. The structured JSON fields (character_ids_active, location_id_primary) must still use the ID format.

   COUPLING RULE: when a phase's narration names a LIST or MONTAGE of distinct concrete subjects (e.g. "coffee, phone, shoes"), phase_content MUST include an explicit visual beat for EACH named subject in the sequence. Narration and visual direction must stay coupled — the visuals must depict the concrete nouns the narration mentions, not just the overall topic.

3. narration_text is the dedicated raw voiceover narration block. Write it in ${narrationLanguage} (see the LANGUAGE NON-NEGOTIABLE block above). Make it vivid, punchy, and optimised for short-form video.

4. viral_hook_rating (1–10): Honestly self-score the engagement quality.
   HOOK SELF-SCORE RUBRIC:
   - 9–10: Masterful hook containing a paradigm-shattering contradiction, concrete high stakes with numbers/names, and a single tight verifiable curiosity gap question.
   - 7–8: Solid hook with a clear contradiction and stakes, but has slightly standard wording or a slightly broader question.
   - 6: Average hook, lacks specific numbers or a strong contradiction.
   - 1–5: Generic/weak hook. Promises to reveal something later without immediately setting stakes, starts with rhetorical questions, or uses cliches.
   Apply this rubric strictly to the Hook (Phase 1) and each Rehook phase (Phases 4, 6, 8). Do not inflate scores.

5. estimated_duration_seconds: realistic seconds for that phase of narration.

6. Return ONLY raw JSON — no markdown fences, no prose before or after.`;

  if (toneDirectives) {
    prompt += `\n\n## TONE DIRECTIVES\n${toneDirectives}`;
  }
  if (audienceDirectives) {
    prompt += `\n\n## AUDIENCE DIRECTIVES\n${audienceDirectives}`;
  }
  return prompt.trim();
}

export function getScriptUserPrompt(topic: string, bible: ProductionBibleData, youtubeTranscript?: string | null): string {
  let prompt = `Generate a 10-phase script for the following project.

Topic: "${topic}"

Production Bible (use ONLY these IDs — do not invent new ones):
${JSON.stringify(bible, null, 2)}`;

  if (youtubeTranscript && youtubeTranscript.trim().length > 0) {
    prompt += `\n\nYouTube Transcript Reference:\n"${youtubeTranscript}"\n\nUse the provided transcript as a tonal and vocabulary reference. Match the narration style, terminology, and pacing found in the transcript.`;
  }

  return prompt.trim();
}

export function getPhaseRegeneratePrompt(
  phaseNumber: number,
  phaseTitle: string,
  currentContent: string,
  topic: string,
  bible: ProductionBibleData,
  feedback?: string,
  allPhases?: any[],
  toneDirectives?: string,
  preClimaxSpikeEnabled?: boolean,
  openLoopRole?: 'plant' | 'payoff' | 'none',
  audienceDirectives?: string,
  narrationLanguage: string = 'English',
  rehookPhases: number[] = [4, 6, 8]
): string {
  const rules = resolveLanguageRules(narrationLanguage);
  const hint = rules.narrationHint ? `\n- ${rules.narrationHint}` : '';
  let prompt = `===== LANGUAGE (NON-NEGOTIABLE) =====
ONLY narration_text is in the narration language. Everything else is ENGLISH.
- narration_text → write in ${narrationLanguage}.${hint}
- ALL OTHER fields — phase_title, phase_content, key_events, key_facts, key_images, characters_mentioned, and any other structural/visual text — MUST be written in ENGLISH (Latin script). These feed the visual pipeline (SceneAgent → Veo), which requires English. NEVER write these fields in ${narrationLanguage}.
- The reference transcript and the examples in this prompt are TONE/STRUCTURE references ONLY; do not copy their language. narration_text follows ${narrationLanguage}; all other fields stay English.
====================================

You are a script doctor. Rewrite Phase ${phaseNumber}: "${phaseTitle}" to be significantly more engaging and viral.
 
Topic: "${topic}"
Production Bible style: ${bible.visual_style_lock.color_mood}, ${bible.visual_style_lock.lighting_style}

Production Bible Roster details:
Characters: ${JSON.stringify(bible.character_roster)}
Locations: ${JSON.stringify(bible.location_roster)}
Visual Style Lock: ${JSON.stringify(bible.visual_style_lock)}

Current content (rewrite this):
"${currentContent}"`;

  if (allPhases) {
    const preceding = allPhases.find(p => p.phase_number === phaseNumber - 1);
    if (preceding) {
      const lastSentences = getLastSentences(preceding.narration_text ?? '', 2);
      prompt += `\n\nPREVIOUS_PHASE_CONTEXT:\nPhase ${preceding.phase_number} (${preceding.phase_type}): "${preceding.phase_title}"\nContent: ${preceding.phase_content}\nNarration (last 2 sentences): ${lastSentences}`;
    }

    const following = allPhases.find(p => p.phase_number === phaseNumber + 1);
    if (following) {
      prompt += `\n\nNEXT_PHASE_CONTEXT:\nPhase ${following.phase_number} (${following.phase_type}): "${following.phase_title}"\nContent: ${following.phase_content}\nNarration: ${following.narration_text ?? ''}`;
    }

    const overviewLines = allPhases
      .filter(p => p.phase_number !== phaseNumber && p.phase_number !== phaseNumber - 1 && p.phase_number !== phaseNumber + 1)
      .map(p => `- Phase ${p.phase_number} (${p.phase_type}): "${p.phase_title}"`)
      .join('\n');
    prompt += `\n\nSCRIPT_OVERVIEW:\n${overviewLines}`;
  }

  if (feedback && feedback.trim().length > 0) {
    prompt += `\n\nSpecific Critique & Instructions to apply:\n"${feedback}"`;
  }

  if (toneDirectives) {
    prompt += `\n\n## TONE DIRECTIVES\n${toneDirectives}`;
  }
  if (audienceDirectives) {
    prompt += `\n\n## AUDIENCE DIRECTIVES\n${audienceDirectives}`;
  }

  prompt += `

## ANTI-REPETITION RULE (MANDATORY):
ANTI-REPETITION: Do NOT start consecutive sentences with the same word. In particular, NEVER start consecutive sentences with a character's name. Vary your subjects, pronouns, and sentence structures.

=== SECTION: NARRATION VOICE (apply to ALL phases) ===

"NARRATION VOICE — MANDATORY FOR ALL PHASES:

You are writing spoken narration for a YouTube video, not an essay, not a Wikipedia article, and not a documentary script. The viewer is watching on a phone with one thumb hovering over the scroll button. Every sentence must earn the next one.

VOICE RULES:
1. Write like you are telling a story to one person, not presenting to an audience.
2. Short sentences hit harder than long ones. After every sentence longer than 15 words, write one under 8 words.
3. Never use these phrases under any circumstances — they are clichés that signal low-quality content and cause viewers to tune out:
   - 'You have been fed a...'
   - 'History books will tell you...'
   - 'Most people don't know...'
   - 'What they don't want you to know...'
   - 'Let that sink in.'
   - 'The truth is...'
   - 'It's more complicated than that.'
   - 'Throughout history...'
   - 'In a world where...'
   - Any phrase that promises to reveal something without immediately revealing it.
4. Do not summarize what you are about to say. Say it. Do not explain what the video will cover. Cover it.
5. Specific beats abstract every time. 'She bribed a Roman general with 4,000 talents of gold' destroys 'she used her political leverage effectively.'
6. Never end a sentence with a vague noun: power, strategy, legacy, wisdom, influence, history, politics. End sentences with actions, numbers, consequences, or images.
7. Vary sentence openings. Never start two consecutive sentences with the same word. Never start more than one sentence per paragraph with 'She', 'He', 'They', or 'It'.
8. No passive voice. 'Rome feared her' not 'she was feared by Rome.'
9. Every paragraph must end on either a revelation, a question, or a consequence — never a summary statement."

=== SECTION: WHAT TO NEVER WRITE (applies to ALL phases) ===

"UNIVERSAL PROHIBITIONS — violating any of these means the output fails quality review:

1. Never write a sentence whose only job is to tell the viewer what the next sentence will say.
2. Never use the word 'journey' to describe a historical or personal narrative.
3. Never use 'delve', 'tapestry', 'multifaceted', 'nuanced', 'realm', 'profound', 'pivotal', 'bustling', 'game-changer', 'paradigm', 'landmark', 'groundbreaking', 'testament', 'spearhead', 'beacon', 'unleash', 'supercharge'.
4. Never write in lists inside narration. No 'First... Second... Third...' structures.
5. Never tell the viewer how to feel. No 'remarkably', 'incredibly', 'fascinatingly', 'astonishingly' as sentence openers.
6. Never write a rhetorical question that the video does not answer.
7. Never end the script on a call to action (like and subscribe language). That is not narration — it is added separately in post.
8. Do not repeat any noun, verb, or adjective that appeared in Phase 1 unless it is a named character or location. The vocabulary must expand as the video progresses."
`;


  const lastPhaseNum = allPhases && allPhases.length > 0 ? Math.max(...allPhases.map(p => p.phase_number)) : 10;

  if (phaseNumber === 1) {
    prompt += `

=== SECTION: PHASE 1 HOOK (apply ONLY to phase_number = 1) ===

"PHASE 1 HOOK — CRITICAL RULES:

The hook is the only part of your script that decides whether the video succeeds or fails. A viewer decides in 8 seconds whether to stay or scroll. Your job is to make leaving feel like a mistake.

MANDATORY HOOK STRUCTURE — follow this in sequence, no exceptions:

BEAT 1 — THE CONTRADICTION (sentences 1–2, max 25 words total):
Open with a direct statement that contradicts what the viewer already believes. This is not a question. This is not a promise. This is a fact that reframes everything.
Good: 'Cleopatra didn't seduce Rome's greatest generals. She dismantled them.'
Bad: 'What if everything you knew about Cleopatra was wrong?'
Bad: 'History has painted Cleopatra as a seductress, but the reality is far more complex.'
The contradiction must be specific to the topic, not generic. It must name the exact myth being destroyed.

BEAT 2 — THE STAKES (sentences 3–5, max 50 words total):
Immediately after the contradiction, establish what was actually at stake. Use specific numbers, names, or consequences. The viewer must understand that this story matters and that the outcome was not guaranteed.
Good: 'She inherited a bankrupt kingdom surrounded by the most powerful military machine in human history. No standing army. No allies. Every general in the Mediterranean wanted her dead or on their knees.'
Bad: 'She faced incredible challenges and obstacles that would have destroyed lesser rulers.'
No hyperbole. Specific facts only.

BEAT 3 — THE QUESTION (1 sentence, max 20 words):
Ask exactly ONE question that the viewer cannot answer but desperately wants to. This question must be answerable by watching the rest of the video. It must be specific, not philosophical.
Good: 'How does a queen with no army force the world's most dangerous conquerors to kneel?'
Bad: 'What can we learn from her incredible legacy?'
Bad: 'How did she do it?'
This question is your cliffhanger. STOP HERE. Do not answer it. Do not hint at the answer. Do not add any more sentences after this question in the hook.

HARD STOP RULE:
After Beat 3, Phase 1 ends. Do not add:
- Any explanation of what the video will cover
- Any biographical background
- Any academic context
- Any sentences that begin with 'To understand this...' or 'To answer that...' or 'We must first...'
- Any sentences that re-explain what you just said
These are all death sentences for viewer retention. If you write them, you are pre-answering your own cliffhanger and destroying the reason to keep watching.

TARGET LENGTH FOR PHASE 1: 80–140 words. Shorter is better. If your hook is over 140 words, you have padded it. Cut ruthlessly."
`;
  }

  if (phaseNumber >= 2 && phaseNumber < lastPhaseNum) {
    const existingTypes = allPhases
      ? allPhases
          .filter(p => p.phase_number !== phaseNumber && rehookPhases.includes(p.phase_number) && p.rehook_type)
          .map(p => p.rehook_type)
      : [];
    const excludedText = existingTypes.length > 0
      ? `DO NOT use these types: [${existingTypes.join(', ')}].`
      : '';
    prompt += `

=== SECTION: MID-VIDEO PHASES (apply to phase_number 2–${lastPhaseNum - 1}) ===

"MID-VIDEO PHASE RULES:

Each phase must open with a payoff or a new reveal — never a transition summary.
Bad opening: 'Now that we understand her background, let us examine her political strategy.'
Good opening: 'The first general she neutralized never saw it coming. Julius Caesar arrived in Alexandria expecting a prisoner. He left as her ally — and had no idea she had orchestrated every second of that meeting.'

REVELATION DENSITY: Each phase must contain at least 2 specific facts, numbers, names, or events that the average viewer does not know. Vague statements about strategy, genius, or influence do not count as revelations.

${rehookPhases.includes(phaseNumber) ? `RE-ENGAGEMENT RULE for phases ${rehookPhases.join(', ')}:
These phases must open with a statement or question that makes the viewer feel they are about to learn something they have never heard before. Not a recap. Not a transition. A new hook inside the video.
Good: 'Here is the part Rome tried to erase from every official record.'
Good: 'The move that followed was so ruthless that even Caesar's own generals refused to believe it happened.'
Bad: 'As we continue to explore her political genius...'

MID-VIDEO RE-HOOK REQUIRED (CRITICAL FOR PHASE ${phaseNumber}):
This phase MUST contain a mid-video curiosity re-engagement beat.
It must appear in the FIRST 2 sentences of this phase's narration.
Select one type from: 'new_question' | 'revelation' | 'stakes_escalation' | 'pattern_interrupt'${preClimaxSpikeEnabled ? " | 'pre_climax_spike'" : ""}.
${excludedText}
Mark the chosen type in the 'rehook_type' field of your response.` : ''}"
`;
  }

  if (preClimaxSpikeEnabled) {
    prompt += `

=== SECTION: PHASE ${phaseNumber} PRE-CLIMAX SPIKE ===
"PRE-CLIMAX RETENTION SPIKE REQUIRED:
This phase MUST end on a maximum-tension 'pre_climax_spike' — a cliffhanger/stakes peak that makes dropping before the climax (Phase 9) feel impossible.
You must:
- Set 'rehook_type' to 'pre_climax_spike'.
- End the narration on a cliffhanger that teases the final crisis or event without pre-answering it."
`;
  }

  if (openLoopRole === 'plant') {
    prompt += `

=== SECTION: LONG OPEN LOOP PLANT ===
"LONG OPEN LOOP PLANT REQUIRED:
You MUST plant a long open loop in this phase.
- Set 'open_loop_role' to 'plant'.
- In the narration, introduce exactly one concrete, specific mystery, teaser, or promise that is explicitly marked as resolved later in the video (e.g. 'the real reason wouldn't surface until the very end'). This must be a tracked promise, not a vague rhetorical question."
`;
  }

  if (openLoopRole === 'payoff') {
    prompt += `

=== SECTION: LONG OPEN LOOP PAYOFF ===
"LONG OPEN LOOP PAYOFF REQUIRED:
You MUST pay off the long open loop that was planted in Phase 2/3.
- Set 'open_loop_role' to 'payoff'.
- In the narration, explicitly resolve the specific mystery or promise planted earlier. Describe the payoff clearly and dynamically."
`;
  }

  if (phaseNumber === lastPhaseNum) {
    prompt += `

=== SECTION: OUTRO PHASE ===

"OUTRO PHASE (phase_number = ${phaseNumber}):
Do not summarize the video. The viewer just watched it — they know what happened.
Instead: deliver one final reframe that makes everything they just watched feel bigger than they realized. End on a statement, not a question. Leave the viewer with something to think about, not something to click on."
`;
  }

  prompt += `\n\nRules:
- Write narration_text in ${narrationLanguage}; write phase_title, phase_content, key_events, key_facts, key_images in ENGLISH.
- COUPLING RULE: when a phase's narration names a LIST or MONTAGE of distinct concrete subjects (e.g. "coffee, phone, shoes"), phase_content MUST include an explicit visual beat for EACH named subject in the sequence. Narration and visual direction must stay coupled — the visuals must depict the concrete nouns the narration mentions, not just the overall topic.
- Match the narrative tone of the adjacent phases perfectly
- DO NOT contradict any character details, locations, or props established in the Production Bible
- Stay true to the Production Bible's tone and world
- Make it punchy and visual
- Output JSON with the fields: "phase_title", "phase_content", "narration_text"`;

  if (rehookPhases.includes(phaseNumber)) {
    prompt += `, "rehook_type" (must be one of 'new_question', 'revelation', 'stakes_escalation', 'pattern_interrupt', 'pre_climax_spike')`;
  }
  prompt += `, "open_loop_role" (must be one of 'plant', 'payoff', 'none')`;

  prompt += `\n- No markdown. No explanation.`;

  return prompt.trim();
}

export function getLastSentences(text: string, count: number = 2, language: string = 'English'): string {
  if (!text) return '';
  const rules = resolveLanguageRules(language);
  const terminators = rules.terminators;
  if (!terminators) {
    const sentences = text.split(/\s+/).filter(Boolean);
    if (sentences.length <= count) return text;
    return sentences.slice(-count).join(' ');
  }
  const escaped = terminators.replace(/[\\^$\-*+?.()|[\]{}]/g, '\\$&');
  const regex = new RegExp(`[^${escaped}]+[${escaped}]+`, 'g');
  const sentences = text.match(regex) || [text];
  const cleaned = sentences.map(s => s.trim()).filter(Boolean);
  if (cleaned.length <= count) return text;
  return cleaned.slice(-count).join(' ');
}

export function getFirstSentences(text: string, count: number = 2, language: string = 'English'): string {
  if (!text) return '';
  const rules = resolveLanguageRules(language);
  const terminators = rules.terminators;
  if (!terminators) {
    const sentences = text.split(/\s+/).filter(Boolean);
    if (sentences.length <= count) return text;
    return sentences.slice(0, count).join(' ');
  }
  const escaped = terminators.replace(/[\\^$\-*+?.()|[\]{}]/g, '\\$&');
  const regex = new RegExp(`[^${escaped}]+[${escaped}]+`, 'g');
  const sentences = text.match(regex) || [text];
  const cleaned = sentences.map(s => s.trim()).filter(Boolean);
  if (cleaned.length <= count) return text;
  return cleaned.slice(0, count).join(' ');
}

export function buildAudienceDirectives(targetAudience: string): string {
  let directives = '';
  const c = targetAudience.toLowerCase();
  
  if (c === 'gen_z') {
    directives = `TARGET AUDIENCE: GEN Z (Born 1997–2012)
- Vocabulary/Register: Use modern, high-energy language. Direct, punchy, conversational, incorporating tech-native framing. Avoid sounding like an academic lecture or a standard TV commercial.
- Pacing/Attention-Span: Keep sentences extremely tight. Fast-paced, dynamic transitions. Cut any fluff or slow exposition. Maximize micro-tension.
- Cultural-Reference Style: Reference modern digital culture, viral trends, and tech metaphors (e.g. algorithms, glitch, system crash, simulation).
- Hook Framing: Sensational contradiction, scroll-stopping visual cues, immediate mystery within the first 3 seconds. Open with high-contrast statements.`;
  } else if (c === 'millennial') {
    directives = `TARGET AUDIENCE: MILLENNIALS (Born 1981–1996)
- Vocabulary/Register: Analytical yet accessible. Professional-casual, self-aware, combining intellectual curiosity with a conversational voice.
- Pacing/Attention-Span: Balanced pacing. Steady progression of ideas, allowing key revelations to land with emotional weight before moving on.
- Cultural-Reference Style: References to 90s/00s pop culture, early internet nostalgia, career/economic realities, and self-deprecating irony.
- Hook Framing: Focus on nostalgia, curiosity-driven contradictions, or systemic reframings (e.g. 'why the housing market was never normal').`;
  } else if (c === 'gen_x') {
    directives = `TARGET AUDIENCE: GEN X (Born 1965–1980)
- Vocabulary/Register: Skeptical, direct, narrative-driven, detail-rich. Authentic, no-nonsense register. Avoid hyperactive slang or overly sentimental drama.
- Pacing/Attention-Span: Deliberate, thorough pacing. Focus on logical continuity, cause-and-effect chains, and historical/factual depth.
- Cultural-Reference Style: References to classic media, real-world analog systems, geopolitical shifts, and practical survival/autonomy themes.
- Hook Framing: Grounded, high-stakes contradictions. Focus on the raw reality, hidden histories, and practical consequences of decisions.`;
  } else {
    directives = `TARGET AUDIENCE: GENERAL / BROAD
- Vocabulary/Register: Neutral, universally accessible, clear and standard English. Balanced and narrative.
- Pacing/Attention-Span: Standard rhythmic pacing. Easy-to-follow flow with moderate complexity.
- Cultural-Reference Style: Broadly understood historical analogies, universal human experiences, and widely recognized milestones.
- Hook Framing: Structured, clear curiosity gap. Contradiction → Stakes → Question.`;
  }
  
  return directives;
}

export function getPhaseGenerationPrompt(
  phaseNumber: number,
  phaseType: string,
  topic: string,
  bible: ProductionBibleData,
  toneDirectives: string,
  previousPhaseEnding?: string,
  youtubeTranscript?: string | null,
  excludeRehookTypes?: string[],
  preClimaxSpikeEnabled?: boolean,
  openLoopRole?: 'plant' | 'payoff' | 'none',
  audienceDirectives?: string,
  narrationLanguage: string = 'English',
  lastPhaseNum: number = 10
): string {
  let prompt = `Generate Phase ${phaseNumber} of the 10-phase script.
Phase Type: ${phaseType}
Topic: "${topic}"

Production Bible Details:
Characters: ${JSON.stringify(bible.character_roster)}
Locations: ${JSON.stringify(bible.location_roster)}
Visual Style Lock: ${JSON.stringify(bible.visual_style_lock)}

## TONE DIRECTIVES
${toneDirectives}
`;

  if (audienceDirectives) {
    prompt += `\n## AUDIENCE DIRECTIVES\n${audienceDirectives}\n`;
  }

  if (phaseNumber === 1 || phaseType === 'hook') {
    prompt += `

=== SECTION: PHASE 1 HOOK (apply ONLY to phase_number = 1) ===

"PHASE 1 HOOK — CRITICAL RULES:

The hook is the only part of your script that decides whether the video succeeds or fails. A viewer decides in 8 seconds whether to stay or scroll. Your job is to make leaving feel like a mistake.

MANDATORY HOOK STRUCTURE — follow this in sequence, no exceptions:

BEAT 1 — THE CONTRADICTION (sentences 1–2, max 25 words total):
Open with a direct statement that contradicts what the viewer already believes. This is not a question. This is not a promise. This is a fact that reframes everything.
Good: 'Cleopatra didn't seduce Rome's greatest generals. She dismantled them.'
Bad: 'What if everything you knew about Cleopatra was wrong?'
Bad: 'History has painted Cleopatra as a seductress, but the reality is far more complex.'
The contradiction must be specific to the topic, not generic. It must name the exact myth being destroyed.

BEAT 2 — THE STAKES (sentences 3–5, max 50 words total):
Immediately after the contradiction, establish what was actually at stake. Use specific numbers, names, or consequences. The viewer must understand that this story matters and that the outcome was not guaranteed.
Good: 'She inherited a bankrupt kingdom surrounded by the most powerful military machine in human history. No standing army. No allies. Every general in the Mediterranean wanted her dead or on their knees.'
Bad: 'She faced incredible challenges and obstacles that would have destroyed lesser rulers.'
No hyperbole. Specific facts only.

BEAT 3 — THE QUESTION (1 sentence, max 20 words):
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
This question is your cliffhanger. STOP HERE. Do not answer it. Do not hint at the answer. Do not add any more sentences after this question in the hook.

HARD STOP RULE:
After Beat 3, Phase 1 ends. Do not add:
- Any explanation of what the video will cover
- Any biographical background
- Any academic context
- Any sentences that begin with 'To understand this...' or 'To answer that...' or 'We must first...'
- Any sentences that re-explain what you just said
These are all death sentences for viewer retention. If you write them, you are pre-answering your own cliffhanger and destroying the reason to keep watching.

TARGET LENGTH FOR PHASE 1: 80–140 words. Shorter is better. If your hook is over 140 words, you have padded it. Cut ruthlessly."
`;
  }

  if (phaseNumber >= 2 && phaseNumber <= 9) {
    const excludeText = excludeRehookTypes && excludeRehookTypes.length > 0
      ? `DO NOT use these types: [${excludeRehookTypes.join(', ')}].`
      : '';
    prompt += `

=== SECTION: MID-VIDEO PHASES (apply to phase_number 2–9) ===

"MID-VIDEO PHASE RULES:

Each phase must open with a payoff or a new reveal — never a transition summary.
Bad opening: 'Now that we understand her background, let us examine her political strategy.'
Good opening: 'The first general she neutralized never saw it coming. Julius Caesar arrived in Alexandria expecting a prisoner. He left as her ally — and had no idea she had orchestrated every second of that meeting.'

REVELATION DENSITY: Each phase must contain at least 2 specific facts, numbers, names, or events that the average viewer does not know. Vague statements about strategy, genius, or influence do not count as revelations.

${[4, 6, 8].includes(phaseNumber) ? `RE-ENGAGEMENT RULE for phases 4, 6, 8:
These phases must open with a statement or question that makes the viewer feel they are about to learn something they have never heard before. Not a recap. Not a transition. A new hook inside the video.
Good: 'Here is the part Rome tried to erase from every official record.'
Good: 'The move that followed was so ruthless that even Caesar's own generals refused to believe it happened.'
Bad: 'As we continue to explore her political genius...'

MID-VIDEO RE-HOOK REQUIRED (CRITICAL FOR PHASE ${phaseNumber}):
This phase MUST contain a mid-video curiosity re-engagement beat.
It must appear in the FIRST 2 sentences of this phase's narration.
Select one type from: 'new_question' | 'revelation' | 'stakes_escalation' | 'pattern_interrupt'${phaseNumber === 8 ? " | 'pre_climax_spike'" : ""}.
${excludeText}
Mark the chosen type in the 'rehook_type' field of your response.` : ''}"
`;
  }

  if (phaseNumber === 8 && preClimaxSpikeEnabled) {
    prompt += `

=== SECTION: PHASE 8 PRE-CLIMAX SPIKE ===
"PRE-CLIMAX RETENTION SPIKE REQUIRED:
This phase MUST end on a maximum-tension 'pre_climax_spike' — a cliffhanger/stakes peak that makes dropping before the climax (Phase 9) feel impossible.
You must:
- Set 'rehook_type' to 'pre_climax_spike'.
- End the narration on a cliffhanger that teases the final crisis or event without pre-answering it."
`;
  }

  if (openLoopRole === 'plant') {
    prompt += `

=== SECTION: LONG OPEN LOOP PLANT ===
"LONG OPEN LOOP PLANT REQUIRED:
You MUST plant a long open loop in this phase.
- Set 'open_loop_role' to 'plant'.
- In the narration, introduce exactly one concrete, specific mystery, teaser, or promise that is explicitly marked as resolved later in the video (e.g. 'the real reason wouldn't surface until the very end'). This must be a tracked promise, not a vague rhetorical question."
`;
  }

  if (openLoopRole === 'payoff') {
    prompt += `

=== SECTION: LONG OPEN LOOP PAYOFF ===
"LONG OPEN LOOP PAYOFF REQUIRED:
You MUST pay off the long open loop that was planted in Phase 2/3.
- Set 'open_loop_role' to 'payoff'.
- In the narration, explicitly resolve the specific mystery or promise planted earlier. Describe the payoff clearly and dynamically."
`;
  }

  if (phaseNumber === lastPhaseNum) {
    prompt += `

=== SECTION: OUTRO PHASE ===

"OUTRO PHASE (phase_number = ${lastPhaseNum}):
Do not summarize the video. The viewer just watched it — they know what happened.
Instead: deliver one final reframe that makes everything they just watched feel bigger than they realized. End on a statement, not a question. Leave the viewer with something to think about, not something to click on."
`;
  }

  if (previousPhaseEnding) {
    prompt += `\n\n## PREVIOUS PHASE ENDING (last 2 sentences — your phase must continue from this):\n${previousPhaseEnding}`;
  }

  if (youtubeTranscript && youtubeTranscript.trim().length > 0) {
    prompt += `\n\nYouTube Transcript Reference:\n"${youtubeTranscript}"\n\nUse the provided transcript as a tonal and vocabulary reference. Reference for TONE and VOCABULARY STRUCTURE only — do NOT adopt its language; narrate in ${narrationLanguage}.`;
  }

  prompt += `

REQUIRED JSON STRUCTURE (use exactly these field names — no variations):
{
  "phase_number": ${phaseNumber},
  "phase_type": "${phaseType}",
  "phase_title": "string",
  "phase_content": "string",
  "narration_text": "string",
  "narration_word_count": number,
  "key_events": ["string"],
  "character_ids_active": ["CHAR_001"],
  "location_id_primary": "LOC_001",
  "estimated_duration_seconds": number,
  "viral_hook_rating": number`;

  if ([4, 6, 8].includes(phaseNumber)) {
    prompt += `,
  "rehook_type": "new_question" | "revelation" | "stakes_escalation" | "pattern_interrupt" | "pre_climax_spike"`;
  } else {
    prompt += `,
  "rehook_type": null`;
  }

  prompt += `,
  "open_loop_role": "plant" | "payoff" | "none"`;

  prompt += `
}`;

  return prompt.trim();
}

export function getNarrationSpinePrompt(
  topic: string,
  bible: ProductionBibleData,
  narrationLanguage: string,
  toneDirectives: string,
  audienceDirectives: string,
  settings: {
    hook_regenerate: 'on' | 'off';
    pre_climax_spike: 'on' | 'off';
    long_open_loop: 'on' | 'off';
    target_audience: 'gen_z' | 'millennial' | 'gen_x' | 'general';
  },
  plan: PhasePlan,
  fullTranscript?: string | null
): string {
  const layoutItems = plan.layout.map(p => {
    return `${p.phase_number}. phase_number: ${p.phase_number}, phase_type: "${p.phase_type}"`;
  }).join('\n');

  const rules = resolveLanguageRules(narrationLanguage);
  const hint = rules.narrationHint ? `\n- ${rules.narrationHint}` : '';
  let prompt = `===== LANGUAGE (NON-NEGOTIABLE) =====
ONLY narration_text is in the narration language. Everything else is ENGLISH.
- narration_text → write in ${narrationLanguage}.${hint}
- ALL OTHER fields — title, phase_title, phase_type, rehook_type, open_loop_role — MUST be written in ENGLISH (Latin script). NEVER write these fields in ${narrationLanguage}.
- The reference transcript and the examples in this prompt are TONE/STRUCTURE references ONLY; do not copy their language. narration_text follows ${narrationLanguage}; all other fields stay English.
====================================

You are the Script Spine Generator for a viral video production pipeline.
Your goal is to write all ${plan.phaseCount} phases of narration text as a single flowing story, ensuring excellent cross-phase continuity and natural build-up.

Topic: "${topic}"

## BIBLE DOSSIERS FOR REFERENCES
Characters: ${JSON.stringify(bible.character_roster)}
Locations: ${JSON.stringify(bible.location_roster)}
Visual Style Lock: ${JSON.stringify(bible.visual_style_lock)}

## TONE DIRECTIVES
${toneDirectives}

## AUDIENCE DIRECTIVES
${audienceDirectives}

## FIXED ${plan.phaseCount}-PHASE LAYOUT & STRUCTURE
The script must have exactly ${plan.phaseCount} phases, generated in order (phase_number 1 to ${plan.phaseCount}):
${layoutItems}

## NARRATION LENGTH TARGETS (NON-NEGOTIABLE)
- Phase 1 (Hook): 60 to 90 words. Keep it extremely tight and punchy.
- Phases 2-${plan.phaseCount}: Each phase's narration_text MUST contain a minimum of ${plan.wordsPerPhase >= 120 ? 120 : 60} words and a maximum of 360 words (target ${plan.wordsPerPhase} words per phase).
Failure to meet these word counts violates the schema constraints. Count words carefully.

## CROSS-PHASE CONTINUITY & ANTI-REPETITION
- Write the narrations sequentially so they form one seamless narrative arc. 
- Avoid any thematic summary transitions (e.g., 'Now let's look at...'). Move the story forward with action, cause and effect.
- Anti-repetition: Do NOT repeat facts, images, or examples across different phases. Once an event, statistic, or visual detail is described, it is locked.
- Do NOT start consecutive sentences with the same word. Never start consecutive sentences with a character's name.

## ENGAGEMENT RULES:
1. PHASE 1 HOOK beats:
   - BEAT 1 — THE CONTRADICTION (sentences 1–2, max 25 words total): Open with a direct statement that contradicts what the viewer already believes. No questions, no promises.
   - BEAT 2 — THE STAKES (sentences 3–5, max 50 words total): Establish what was at stake with specific numbers/names.
   - BEAT 3 — THE QUESTION (1 sentence, max 20 words): Ask exactly ONE question that the video will specifically and concretely answer by the end. The question must be about a specific person, event, decision, or mechanism — not about an abstract or philosophical concept (like trust, value, power).
     - Good: 'How did a Song Dynasty merchant convince an empire to accept worthless bark as payment for real silk?'
     - Bad: 'What is the true nature of value?'
     - The question is a cliffhanger. STOP HERE. Do not add any sentences after the question in the hook.
2. LONG OPEN LOOP (when long_open_loop is on):
   - Since long_open_loop is '${settings.long_open_loop}', you MUST:
     - Plant an open loop in Phase ${plan.plantPhase}: Set open_loop_role to "plant" in Phase ${plan.plantPhase}, and introduce one specific mystery/promise in the narration (e.g. 'but the real reason was a secret that wouldn't be revealed until...').
     - Pay off the open loop in Phase ${plan.payoffPhase} (Climax): Set open_loop_role to "payoff" in Phase ${plan.payoffPhase}, and explicitly resolve that mystery in the narration.
3. RE-HOOKS (Phases ${plan.rehookPhases.join(', ')}):
   - These phases must open with a statement or question that makes the viewer feel they are about to learn something new (no transitions/recaps).
   - You must assign a DISTINCT rehook_type to each of these phases from: ['new_question', 'revelation', 'stakes_escalation', 'pattern_interrupt']. No duplicate rehook types across phases ${plan.rehookPhases.join('/')}.
4. PRE-CLIMAX SPIKE (when pre_climax_spike is on):
   - Since pre_climax_spike is '${settings.pre_climax_spike}', Phase ${plan.preClimaxSpikePhase} must end on a maximum-tension cliffhanger beat (set rehook_type to "pre_climax_spike").
5. VIRAL HOOK RATING:
   - Self-score each phase's viral_hook_rating honestly (1-10).

## STRICT OUTPUT JSON STRUCTURE:
Output a single JSON object matching the scriptSpineOutputSchema. Do NOT include markdown fences, prose, or extra keys (like phase_content or key_*).
{
  "title": "string",
  "phases": [
    {
      "phase_number": number,
      "phase_type": "hook" | "build_up" | "escalation" | "climax" | "outro",
      "phase_title": "string (ENGLISH)",
      "narration_text": "string (TARGET LANGUAGE)",
      "viral_hook_rating": number,
      "rehook_type": "new_question" | "revelation" | "stakes_escalation" | "pattern_interrupt" | "pre_climax_spike" | null,
      "open_loop_role": "plant" | "payoff" | "none"
    }
  ]
}`;

  if (fullTranscript && fullTranscript.trim().length > 0) {
    prompt += `\n\nYouTube Transcript Reference:\n"${fullTranscript}"\n\nUse the provided transcript as a TONE and VOCABULARY structure reference only — do NOT adopt its language; narrate in ${narrationLanguage}.`;
  }

  return prompt.trim();
}

export function getPhaseExpansionPrompt(
  phase: {
    phase_number: number;
    phase_type: string;
    phase_title: string;
    narration_text: string;
    rehook_type: string | null;
    open_loop_role: string;
  },
  allPhaseSummaries: string,
  bibleContextBlock: string,
  narrationLanguage: string
): string {
  return `===== LANGUAGE (NON-NEGOTIABLE) =====
EVERY field generated in this JSON response MUST be written in ENGLISH (Latin script).
- phase_content → write in ENGLISH.
- key_events, key_facts, key_images → write in ENGLISH.
- characters_mentioned → write in ENGLISH.
- location_id_primary → write in ENGLISH.
NEVER write any field in ${narrationLanguage} or any other language than English.
====================================

You are the Script Phase Expander. Your job is to generate the English visual/structural metadata for a single script phase.

## BIBLE DOSSIERS & CONTEXT
${bibleContextBlock}

## CURRENT PHASE TO EXPAND
Phase Number: ${phase.phase_number}
Phase Type: ${phase.phase_type}
Phase Title: "${phase.phase_title}"
Narration Text (Spoken voiceover, read-only):
"${phase.narration_text}"

## ALL SCRIPT PHASES (READ-ONLY FOR DE-DUPLICATION)
${allPhaseSummaries}

INSTRUCTIONS:
1. Analyze the narration text for this phase.
2. phase_content: Write a detailed description of what happens visually in this phase.
   - Use character NAMES, location NAMES, and object NAMES (not IDs) in phase_content.
   - It must be a vivid narrative beat in ENGLISH, minimum 10 characters.
   - COUPLING RULE: when the narration text names a list or montage of distinct concrete subjects (e.g., "coffee, phone, shoes"), phase_content MUST include an explicit, detailed visual action or beat for EACH named subject in the sequence. Visuals must depict the concrete nouns the narration mentions, not just the overall topic.
3. character_ids_active: List of character IDs (e.g., "CHAR_001") present or active in this phase.
   - They MUST exist in the Production Bible roster.
4. location_id_primary: The primary location ID (e.g., "LOC_001") for this phase.
   - It MUST exist in the Production Bible roster. If not, default to "LOC_001".
5. key_facts: Array of 3-5 key factual claims made in this phase's narration. Must be written in English.
6. key_images: Array of 2-4 vivid visual moments described in this phase. Must be written in English.
7. key_events: Array of 2-4 narrative events that occur in this phase. Must be written in English.
8. characters_mentioned: Array of character names referenced or appearing in this phase. Must be written in English.

STRICT DE-DUPLICATION:
Do NOT duplicate facts, images, or events that are already covered or summarized in other phases (refer to the "ALL SCRIPT PHASES" read-only block). Focus only on what is unique and distinct in this phase's narration.

STRICT JSON OUTPUT FORMAT:
Output ONLY a raw JSON object matching the following schema. No markdown fences, no text before/after.
{
  "phase_content": "string (ENGLISH)",
  "key_events": ["string (ENGLISH)"],
  "key_facts": ["string (ENGLISH)"],
  "key_images": ["string (ENGLISH)"],
  "character_ids_active": ["CHAR_xxx"],
  "characters_mentioned": ["string (ENGLISH)"],
  "location_id_primary": "LOC_xxx"
}`;
}

export function getOutlinePrompt(
  plan: PhasePlan,
  topic: string,
  bible: ProductionBibleData,
  narrationLanguage: string,
  toneDirectives: string,
  audienceDirectives: string,
  settings: {
    hook_regenerate: 'on' | 'off';
    pre_climax_spike: 'on' | 'off';
    long_open_loop: 'on' | 'off';
    target_audience: 'gen_z' | 'millennial' | 'gen_x' | 'general';
  }
): string {
  const layoutItems = plan.layout.map(p => {
    return `${p.phase_number}. phase_number: ${p.phase_number}, phase_type: "${p.phase_type}"`;
  }).join('\n');

  return `===== LANGUAGE (NON-NEGOTIABLE) =====
ALL fields in the outline — title, phase_title, phase_type, beat_intent, rehook_type, open_loop_role — MUST be written in ENGLISH (Latin script).
====================================

You are the Script Outline Planner for a viral video production pipeline.
Your goal is to design a detailed, highly cohesive script outline of exactly ${plan.phaseCount} phases for:
Topic: "${topic}"

## BIBLE DOSSIERS FOR REFERENCES
Characters: ${JSON.stringify(bible.character_roster)}
Locations: ${JSON.stringify(bible.location_roster)}
Visual Style Lock: ${JSON.stringify(bible.visual_style_lock)}

## TONE DIRECTIVES
${toneDirectives}

## AUDIENCE DIRECTIVES
${audienceDirectives}

## FIXED ${plan.phaseCount}-PHASE LAYOUT & STRUCTURE
The outline must have exactly ${plan.phaseCount} phases, in this order:
${layoutItems}

## ENGAGEMENT RULES:
1. LONG OPEN LOOP (when long_open_loop is on):
   - Since long_open_loop is '${settings.long_open_loop}', you MUST:
     - Plant an open loop in Phase ${plan.plantPhase}: Set open_loop_role to "plant" in Phase ${plan.plantPhase}.
     - Pay off the open loop in Phase ${plan.payoffPhase} (Climax): Set open_loop_role to "payoff" in Phase ${plan.payoffPhase}.
2. RE-HOOKS (Phases ${plan.rehookPhases.join(', ')}):
   - These phases must be rehooks.
   - You must assign a DISTINCT rehook_type to each of these phases from: ['new_question', 'revelation', 'stakes_escalation', 'pattern_interrupt']. No duplicates.
3. PRE-CLIMAX SPIKE (when pre_climax_spike is on):
   - Since pre_climax_spike is '${settings.pre_climax_spike}', Phase ${plan.preClimaxSpikePhase} must end on a maximum-tension cliffhanger beat (set rehook_type to "pre_climax_spike").

## BEAT INTENT DESIGN
- For each phase, write a "beat_intent" (1-2 sentences in ENGLISH) describing the core narrative event/detail of the beat.
- Each beat_intent must be unique and distinct (no repeating details, events, or facts).
- The beats must build tension progressively toward the climax.
- Every middle beat (build_up, escalation) should end on an open question or a point of curiosity to pull the viewer to the next beat.

## OUTPUT JSON:
Output a single JSON object matching the scriptOutlineOutputSchema. Do NOT include markdown fences, prose, or extra keys.

{
  "title": "string",
  "phases": [
    {
      "phase_number": number,
      "phase_type": "hook" | "build_up" | "escalation" | "climax" | "outro",
      "phase_title": "string (ENGLISH)",
      "beat_intent": "string (1-2 sentences ENGLISH describing the beat, ending in open question for middle phases)",
      "viral_hook_rating": number (1-10),
      "rehook_type": "new_question" | "revelation" | "stakes_escalation" | "pattern_interrupt" | "pre_climax_spike" | null,
      "open_loop_role": "plant" | "payoff" | "none"
    }
  ]
}`;
}

export function getNarrationFillPrompt(
  plan: PhasePlan,
  fullOutline: {
    title: string;
    phases: {
      phase_number: number;
      phase_type: 'hook' | 'build_up' | 'escalation' | 'climax' | 'outro';
      phase_title: string;
      beat_intent: string;
      viral_hook_rating: number;
      rehook_type: string | null;
      open_loop_role: string;
    }[];
  },
  batchPhaseNumbers: number[],
  narrationLanguage: string,
  toneDirectives: string,
  audienceDirectives: string,
  settings: {
    hook_regenerate: 'on' | 'off';
    pre_climax_spike: 'on' | 'off';
    long_open_loop: 'on' | 'off';
    target_audience: 'gen_z' | 'millennial' | 'gen_x' | 'general';
  }
): string {
  const outlineContext = fullOutline.phases.map(p => {
    return `Phase ${p.phase_number} [${p.phase_type}] — ${p.phase_title}: ${p.beat_intent} (open_loop: ${p.open_loop_role || 'none'}, rehook: ${p.rehook_type || 'none'})`;
  }).join('\n');

  const rules = resolveLanguageRules(narrationLanguage);
  const hint = rules.narrationHint ? `\n- ${rules.narrationHint}` : '';
  return `===== LANGUAGE NON-NEGOTIABLE RULES =====
narration_text MUST be written in ${narrationLanguage}.${hint}
- Never end or break a sentence at a comma. Ensure every narration segment flows continuously without abrupt punctuation cuts.
- ALL other fields or JSON structure keys must be in English.
==========================================

You are the Narration Filler Agent. Your task is to write the narration_text for specific script phases: [${batchPhaseNumbers.join(', ')}].

Here is the COMPLETE script outline for context and global continuity:
${outlineContext}

## NARRATION TARGETS FOR THIS BATCH:
Write narration_text ONLY for the requested phase numbers: [${batchPhaseNumbers.join(', ')}].

For each of the requested phases:
1. Hook (Phase 1) length must be 60 to 90 words. Keep it tight.
   - Beat 1 (sentences 1-2, max 25 words): open with direct contradiction (no questions, no promises).
   - Beat 2 (sentences 3-5, max 50 words): establish stakes with numbers/names.
   - Beat 3 (1 sentence, max 20 words): exactly ONE curiosity gap question about a mechanism/person/decision (no abstract/philosophical questions). Stop here.
2. Other Phases (Phase 2+): narration_text MUST contain a minimum of ${plan.wordsPerPhase >= 120 ? 120 : 60} words and a maximum of 360 words (target ${plan.wordsPerPhase} words per phase).
3. Deliver the specific open_loop or rehook requirements indicated in the outline for that phase.
4. Ensure narration flows seamlessly from the preceding phase and leads into the next phase.

Output a single JSON matching this structure:
{
  "phases": [
    {
      "phase_number": number,
      "narration_text": "string in ${narrationLanguage}"
    }
  ]
}`;
}

