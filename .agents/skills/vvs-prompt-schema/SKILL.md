---
name: vvs-prompt-schema
description: Conventions for editing VVS Studio LLM prompt files and their Zod schemas. Use when changing any *.prompt.ts or shared Zod schema so prompt output and schema validation stay in sync and builds don't break.
---

# VVS Prompt & Schema Conventions

## Goal
Keep prompt output and Zod validation in lockstep, and avoid the common build/validation traps.

## Core rules
1. **Schema/prompt sync.** If you change what a prompt asks the model to output, update the matching Zod schema in `shared/src/schemas/agent.schema.ts` (and any type in `shared/src/types/`) in the SAME change — and vice versa. A drift here causes repeated JSON-validation retries.
2. **Build order.** After editing anything in `shared/`, run `npm run build:shared` BEFORE `npm run build`, or the backend compiles against stale types.
3. **Veo output enums are lowercase keys.** Validator/agent output fields must use the enum values exactly: `visual | lighting | shot | camera | dialogue | sfx | ambient_sound | avoid | connection`. Never emit human labels like "Visual Description" or "Lighting Setup" — that fails the enum and forces a repair retry.
4. **Repair-prompt pattern.** BaseAgent retries a failed JSON parse with a repair prompt built from `extractSchemaSummary`. Keep schemas tight and the summary compact — if the repair prompt is LARGER than the original, that's a smell (fix extractSchemaSummary) not a feature.
5. **Constraint fields.** Enforce length limits in the schema where the product needs them (e.g. title ≤ 120 chars, visual 40–80 words). If the model overshoots repeatedly, tighten the prompt instruction rather than only relying on retries.

## TypeScript gotchas
- Recursive Zod types hitting TS7056: annotate the schema as `: z.ZodType<any, any, any>`.

## Constraints
- Do not loosen a schema just to make validation pass — fix the prompt or the output shape.
- Keep changes minimal and within the files needed for the sync.