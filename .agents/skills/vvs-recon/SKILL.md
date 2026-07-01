---
name: vvs-recon
description: Read-only investigation of the VVS Studio codebase. Use when the user asks for "recon", asks to diagnose or understand a bug, or wants to know how something works before any change. Produces findings only — never edits code and never guesses.
---

# VVS Recon (read-only investigation)

## Goal
Investigate the VVS Studio codebase and report exactly how something works or why a bug happens, so a fix can be scoped afterward. This skill NEVER edits files.

## When to use
- The user says "give me recon" / "check this" / "why is X happening".
- Before proposing or implementing any fix.

## Instructions
1. Read the ACTUAL files involved. Do not rely on memory or assumptions.
2. Quote the real logic you find (function names, constants, branches). Paraphrasing hides bugs.
3. Trace the full path end-to-end (route → agent → prompt → schema → DB as relevant).
4. When useful, verify against the runtime database (see the vvs-db-inspect skill).
5. Report a clear findings summary: root cause, the exact code locations, and the smallest candidate levers for a later fix.

## Hard constraints (do NOT break these)
- NEVER guess code. No invented line numbers, no assumed formulas, no computed numbers presented as fact.
- NEVER trust line numbers from prior context — open the file and confirm.
- Do NOT edit, create, or delete any file.
- Do NOT propose or write a fix in a recon. Ask questions and report findings only; the user decides the fix separately.
- If you cannot confirm something from the code, say so explicitly rather than filling the gap.

## Output format
- **Root cause(s)** — ranked if multiple.
- **Evidence** — quoted real code + file paths.
- **Levers** — smallest changes that could fix it (described, not implemented).