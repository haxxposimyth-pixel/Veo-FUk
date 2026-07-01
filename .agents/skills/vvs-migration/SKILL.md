---
name: vvs-migration
description: Author idempotent SQLite migrations for VVS Studio. Use when adding or changing a column/table so the migration is safe to re-run, the schema verifier passes, and repositories stay consistent.
---

# VVS Migration

## Goal
Add/alter schema safely and idempotently, and keep every dependent surface in sync.

## Checklist (do all of these)
1. **Idempotent migration.** In the migration runner (`backend/src/db/migrations/`), check `PRAGMA table_info('<table>')` for the column BEFORE running `ALTER TABLE ... ADD COLUMN`. Never ALTER blindly — it must be safe to run on an already-migrated DB.
2. **Sensible default.** New NOT NULL columns need a default (e.g. `DEFAULT 'auto'`) so existing rows migrate cleanly.
3. **Schema verifier.** Update `expectedColumns` for that table in `backend/src/db/connection.ts` so the startup "DB Schema Verification" passes.
4. **Repositories.** Update BOTH `create()` and `duplicate()` inserts in the relevant `backend/src/db/repositories/*.repo.ts` to include the new column.
5. **Types/schema.** Add the field to `shared/src/types/` and `shared/src/schemas/` (optional on update, defaulted on create) if it's user-facing.
6. **Restart + verify.** The migration runs on backend startup against the RUNTIME DB `backend/data/viral-video-studio.db`. Restart the backend and confirm the log shows the expected "✓ Added <column> ..." / verification line.

## Constraints
- Runtime DB only: `backend/data/viral-video-studio.db`. Never `backend/database.sqlite`.
- Re-running the app must not error or duplicate columns.
- Keep the migration reversible-in-spirit: additive, defaulted, non-destructive.