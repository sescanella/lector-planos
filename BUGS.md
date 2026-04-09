# Bug Registry

Read this file before writing SQL queries, modifying DB update statements, or changing the Vision prompt.

## BUG-001: PostgreSQL parameter reuse in CASE expressions
- **Symptom**: `inconsistent types deduced for parameter $2`
- **Cause**: Using `$2` in both `SET col = $2` and `CASE WHEN $2 IN (...)` — Postgres can't reconcile types.
- **Rule**: Never reuse a `$N` parameter in multiple SQL contexts. Use a separate parameter or compute in JS.

## BUG-002: extraction_status never set to 'extracted'
- **Symptom**: Excel export returned `422 no_completed_spools` for every job.
- **Cause**: `ai-extraction.ts` updated `vision_status` but never `extraction_status`. Export queries filter on `extraction_status = 'extracted'`.
- **Rule**: When adding a new status column, grep all queries that filter on related status columns to ensure the full lifecycle is covered.

## BUG-003: Vision prompt missing cajetín field disambiguation
- **Symptom**: OT extracted as REFERENCIA P&ID, OF as NOTA DE VENTA, diameter as full line designation.
- **Cause**: Prompt listed JSON field names but gave no mapping rules for the title block. The model guessed wrong on ambiguous adjacent fields.
- **Rule**: Every Vision prompt field must have: expected label(s), value format/pattern, and explicit negative examples for commonly confused fields.

## BUG-004: Cajetín crop excluded OT/OF fields
- **Symptom**: OT and OF always empty or wrong (model guessed from unrelated fields visible in crop).
- **Cause**: OT/OF are at ~76-78% vertical, 30-50% horizontal. Crop was `{left:50%, top:80%}` — fields were physically outside the image sent to the model.
- **Rule**: Before adding field extraction rules to a prompt, verify the crop region actually contains the target fields. Generate the crop locally and inspect it visually.
