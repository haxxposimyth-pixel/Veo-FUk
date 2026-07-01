---
name: vvs-scoped-fix
description: Implement a narrowly-scoped code change in VVS Studio. Use when the user approves a fix with a defined set of allowed files. Enforces file discipline, inspect-before-edit, the correct build order, and a minimal change report.
---

# VVS Scoped Fix

## Goal
Implement ONLY the approved change, touching only the allowed files, then build and report.

## When to use
- The user has given a fix prompt with an explicit ALLOWED FILES list.

## Instructions
1. **Inspect first.** Open and read the actual code before editing. Do NOT trust line numbers from the prompt — confirm the real structure.
2. **Stay in scope.** Edit ONLY files in the ALLOWED FILES list. If another file seems necessary, STOP and report why instead of editing it.
3. Make the smallest change that satisfies the requirement. Preserve existing behavior on all paths not explicitly targeted.
4. **Build after edits, in order:** run `npm run build:shared` first, then `npm run build`. Both must compile with no errors.
5. There is NO test suite. If you need to verify behavior, write a throwaway scratch script and run it with ABSOLUTE paths (project root: `c:/Users/Admin/Desktop/YT_Prompt.ai/`). Delete or ignore scratch files after.

## Hard constraints
- Never edit a file outside the ALLOWED list. STOP and report instead.
- Never introduce a second source of truth for a constant — reuse existing ones.
- Runtime DB is `backend/data/viral-video-studio.db`. NEVER touch `backend/database.sqlite` (stale).
- TS gotcha: for recursive Zod types hitting TS7056, annotate as `: z.ZodType<any, any, any>`.

## Output report (keep it short)
- Changed files (only).
- Build results for `build:shared` and `build`.
- 1–3 line summary of what changed and a one-line confirmation the requirement is met.
- Do NOT include unrelated observations or extra edits.