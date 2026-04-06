# Migrations

## Known issue: duplicate 004 prefix

Both `004_excel_export.sql` and `004_req11_ai_extraction.sql` share the `004` prefix.
This happened because they were developed on parallel branches and merged without
renumbering.

### Why we do NOT rename them

The migration runner (`src/db/migrate.ts`) tracks applied migrations by **filename**
in the `_migrations` table. Renaming a file that is already applied in production
would cause the runner to re-execute it under the new name, potentially failing or
duplicating schema changes.

### Execution order

The runner sorts files alphabetically, so the actual execution order is:

1. `004_excel_export.sql`
2. `004_req11_ai_extraction.sql`

This order is correct and both migrations are independent of each other.

### Future migrations

All new migrations MUST use sequential numbers starting from **007** onward.
Current sequence: 001, 002, 003, 004 (x2), 005, 006, **007+**.
