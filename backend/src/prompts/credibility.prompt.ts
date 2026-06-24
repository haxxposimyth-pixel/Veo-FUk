import type { CredibilityIssue } from 'shared';
import { resolveLanguageRules } from 'shared';

export function getCredibilityReviewPrompt(
  narrationPhases: { phase_number: number; phase_title: string; narration_text: string }[],
  contentType: string,
  topic: string,
  narrationLanguage: string
): string {
  const rules = resolveLanguageRules(narrationLanguage);
  const hint = rules.narrationHint ? `\n  - ${rules.narrationHint}` : '';
  const phasesText = narrationPhases
    .map(
      (p) => `Phase ${p.phase_number}: "${p.phase_title}"
Narration: "${p.narration_text}"`
    )
    .join('\n\n');

  return `You are a Credibility Reviewer and Fact-Checking Agent. Your job is to audit a finished video script's narration text for factual or internal consistency errors.

Here is the video topic: "${topic}"
Content Type: "${contentType}"
Target Narration Language: "${narrationLanguage}"

=== CONTENT-TYPE FACT-CHECKING RULES (CRITICAL) ===
1. If the Content Type is 'documentary', 'educational', 'factual', or if Content Type is 'auto' and the topic is a real-world educational/historical/technical topic:
   - Apply STRICT real-world fact-checking. Check numbers, dates, units, scientific facts, and step orders.
2. If the Content Type is 'fiction', 'story', 'narrative', or if Content Type is 'auto' and the topic is clearly fictional:
   - DO NOT fact-check against the real-world. A dragon breathing ice or a spaceship travel time does not violate credibility if it fits the story's universe.
   - ONLY flag INTERNAL contradictions (e.g. Phase 2 says "he was alone" but Phase 5 says "his brother was walking next to him") or violations of the story's own established rules.

=== REVIEW RUBRIC ===
Scan the script phase-by-phase. Flag issues matching any of these types:
- 'wrong_number': incorrect statistics, quantities, or mathematical values (e.g. claiming a factory fills 12 million cans per minute instead of 1,200).
- 'wrong_date': historical dates or timelines that are incorrect.
- 'wrong_unit': wrong measurements, scientific units (e.g. Celsius vs Fahrenheit, or using weight units for volume).
- 'wrong_distance_or_depth': wrong distance/depth measurements.
- 'step_out_of_order': technical steps, assembly, or physical processes presented in the wrong chronological order.
- 'unverifiable': claims that are extremely dubious, sound like conspiracy theories, or cannot be verified by basic consensus.
- 'exaggeration': hyped claims that are mathematically/scientifically impossible (e.g., claiming a consumer drink gives "infinite energy").
- 'internal_contradiction': conflicting facts between different phases of the script.

=== GUIDELINES ===
- Be CONSERVATIVE: Do NOT flag creative license, minor rhetorical emphasis, or clearly intentional rounding.
- EXPLANATIONS: Write all explanations in ENGLISH.
- SUGGESTED CORRECTIONS:
  - If a correction requires rewriting or modifying the narration text, write the suggested correction in the target narration language (${narrationLanguage}).${hint}
  - For simple number/date/unit corrections, you may just provide the corrected phrase or narration line.

=== SCRIPT DATA TO AUDIT ===
${phasesText}

=== OUTPUT FORMAT ===
You MUST output a single JSON object matching this structure:
{
  "overall_credibility_score": number (1 to 10, where 10 means absolutely airtight/no issues, and 1 means highly problematic),
  "issues": [
    {
      "phase_number": number,
      "claim": "exact quotation or snippet of narration text flagged",
      "issue_type": "wrong_number" | "wrong_date" | "wrong_unit" | "wrong_distance_or_depth" | "step_out_of_order" | "unverifiable" | "exaggeration" | "internal_contradiction",
      "severity": "high" | "medium" | "low",
      "explanation": "explanation of the issue in ENGLISH",
      "suggested_correction": "suggested replacement text or correction in ${narrationLanguage}"
    }
  ],
  "summary": "a one-paragraph summary of the script's credibility assessment"
}`;
}
