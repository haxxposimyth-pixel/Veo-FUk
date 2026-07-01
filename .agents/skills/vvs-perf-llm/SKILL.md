---
name: vvs-perf-llm
description: Vertex AI / Gemini performance playbook for VVS Studio. Use when generation is slow or hitting 429s, or when tuning LLM concurrency, retries, model selection, or the key pool.
---

# VVS LLM Performance

## Goal
Reduce end-to-end generation latency and eliminate wasted LLM round-trips, without degrading output quality.

## Primary levers (in priority order)
1. **429 backoff.** On Vertex `RESOURCE_EXHAUSTED` (429), use exponential backoff + jitter and retry the SAME model. Do NOT immediately fall back to the heavier `gemini-2.5-pro` on the first 429 — that's slower and compounds cost.
2. **Concurrency cap.** Bound the number of simultaneous LLM calls (especially VeoAgent per-scene fan-out within a phase) with a queue/limit so you stop self-inflicting 429s.
3. **Key pool.** Ensure the Gemini key pool (migration `013_gemini_key_pool`) is actually wired into the request path (LLMRouter/GeminiService) to distribute load and raise effective quota. If dormant, activating it is a big win.
4. **Model hygiene.** Remove the deprecated `gemini-1.5-flash` setting that LLMRouter intercepts on every call ("Forcing to gemini-2.5-flash"). Set correct defaults (flash / flash-lite / pro per stage).
5. **Kill wasted retries.**
   - Validator enum mismatches (e.g. AppearanceValidator returning "Visual Description" instead of `visual`) — fix the schema/prompt so it never repairs. See vvs-prompt-schema.
   - Word-count overshoots (visual > 80 words) — prefer a deterministic trim in postProcess over extra LLM attempts.

## Where to look
- `backend/src/services/` GeminiService + LLMRouter; agent retry logic in BaseAgent; VeoAgent per-scene loop; Vertex project `ytprompt-499319` (us-central1).

## Method
- Always recon first (vvs-recon): get a stage-timing breakdown from logs before changing anything, then fix the biggest time sink first.

## Constraints
- Do not raise concurrency without backoff — that just trades slowness for 429 storms.
- Do not weaken output constraints purely for speed; remove the retry cause instead.