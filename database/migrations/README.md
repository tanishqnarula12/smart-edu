# Migrations

`npm run db:migrate` applies, in order:

1. `database/schema.sql` — recorded as `000_schema.sql`
2. `database/seed.sql` — recorded as `001_reference_data.sql`
3. every `*.sql` file in this folder, sorted by filename

Each applied file is recorded in the `schema_migrations` table with a checksum, so
re-running the command is safe: already-applied files are skipped.

## Adding a change

Once a database is live, **do not edit `schema.sql` in a way that existing
databases will not pick up.** Add a numbered file here instead:

```
database/migrations/002_add_student_house.sql
```

```sql
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS house VARCHAR(40);
```

Then mirror the change into `schema.sql` so a fresh database gets it directly.

Keep migrations idempotent (`IF NOT EXISTS`, `ON CONFLICT DO NOTHING`) — it makes
re-running against a partially-migrated database harmless.

## Checksums

If you edit a file that has already been applied, `db:migrate` warns that the
checksum changed but does not re-run it. Roll the change forward in a new file.
