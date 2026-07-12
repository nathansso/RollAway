# Supabase (Phase 2 foundation)

Migrations + data scripts for the Railway + Supabase migration
(docs/MIGRATION-PLAN.md §2a/§2c).

## Apply migrations

Supabase dashboard → SQL editor (or `supabase db push` with the CLI), in
order:

1. `migrations/0001_kb.sql` — pgvector KB (`kb_documents` keyed by frozen §E
   source ids, `kb_chunks` with `vector(1024)` for Gradient `bge-m3`
   embeddings, `match_kb_chunks` RPC). Replaces Gradient Knowledge Bases
   (Spaces-gated / tier-flaky — agents/DECISIONS.md D19).
2. `migrations/0002_baywheels.sql` — `baywheels_trips` (raw monthly CSVs),
   `station_hourly` (+ meta) and `refresh_station_hourly()` — the SQL version
   of `functions/scripts/aggregate_baywheels.js`. Loading a new month is a
   data operation, not a redeploy.
3. `migrations/0003_users.sql` — Auth-backed `profiles` + `menus` with
   own-rows-only RLS, private `menus` storage bucket.

## Load data

```sh
# Knowledge base (embeds agents/kb/*.md via Gradient bge-m3):
GRADIENT_API_KEY=... SUPABASE_URL=... SUPABASE_SERVICE_KEY=... \
  python backend/scripts/ingest_kb.py

# Bay Wheels month (download from https://s3.amazonaws.com/baywheels-data/):
pip install "psycopg[binary]"
SUPABASE_DB_URL=postgresql://postgres:...@db.<ref>.supabase.co:5432/postgres \
  python supabase/scripts/import_baywheels.py 202606-baywheels-tripdata.csv
```

## Consumers

- FastAPI backend (`backend/`): `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` —
  pgvector retrieval for Permit Copilot, menu upload persistence.
- DO Function `get_foot_traffic`: `SUPABASE_URL` + `SUPABASE_ANON_KEY` — reads
  `station_hourly` via PostgREST; bundled `station_hourly.json` stays the
  offline fallback (§B.3 contract unchanged).
- Frontend (Phase 2c): anon key for Auth + profile CRUD (RLS-scoped).
