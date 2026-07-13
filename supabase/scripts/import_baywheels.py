#!/usr/bin/env python
"""Import Bay Wheels monthly trip CSV(s) into Supabase baywheels_trips, then
refresh station_hourly (one SQL call — loading a new month is a data
operation, not a redeploy).

Copies the semantics of functions/scripts/aggregate_baywheels.js: quoted-CSV
handling (stdlib csv), stations keyed by the CSV's short station id (GBFS
short_name, e.g. 'SF-T21'), events = trip starts + ends, local timestamps.

Usage:
  SUPABASE_DB_URL=postgresql://postgres:...@db.<ref>.supabase.co:5432/postgres \
    python supabase/scripts/import_baywheels.py 202606-baywheels-tripdata.csv [more.csv...]

Uses a direct Postgres connection (psycopg, COPY) because monthly CSVs are
hundreds of thousands of rows — PostgREST inserts would be impractical.
Requires: pip install "psycopg[binary]"
"""

from __future__ import annotations

import csv
import io
import os
import sys

try:
    import psycopg
except ImportError:  # pragma: no cover
    raise SystemExit('psycopg is required: pip install "psycopg[binary]"')

COLUMNS = (
    "ride_id", "started_at", "ended_at",
    "start_station_short_id", "end_station_short_id",
    "start_lat", "start_lng", "end_lat", "end_lng",
)

# Bay Wheels CSVs use local naive timestamps ("YYYY-MM-DD HH:MM:SS.mmm").
# Store them as America/Los_Angeles — refresh_station_hourly() converts back.
SET_TZ = "set timezone = 'America/Los_Angeles'"


def rows_from_csv(path: str):
    with open(path, newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            ride_id = (row.get("ride_id") or "").strip()
            if not ride_id:
                continue
            yield (
                ride_id,
                row.get("started_at") or None,
                row.get("ended_at") or None,
                row.get("start_station_id") or None,
                row.get("end_station_id") or None,
                row.get("start_lat") or None,
                row.get("start_lng") or None,
                row.get("end_lat") or None,
                row.get("end_lng") or None,
            )


def main() -> None:
    paths = [p for p in sys.argv[1:] if not p.startswith("--")]
    if not paths:
        raise SystemExit(__doc__)
    db_url = os.environ.get("SUPABASE_DB_URL")
    if not db_url:
        raise SystemExit("SUPABASE_DB_URL is required (Supabase dashboard -> Database -> connection string)")

    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute(SET_TZ)
            total = 0
            for path in paths:
                print(f"[import] {path} ...")
                # Stage into a temp table so re-imports of an overlapping month
                # upsert instead of violating the ride_id primary key.
                cur.execute(
                    "create temp table _stage (like baywheels_trips including defaults) on commit drop"
                )
                buffer = io.StringIO()
                writer = csv.writer(buffer)
                count = 0
                with cur.copy(
                    f"copy _stage ({', '.join(COLUMNS)}) from stdin with (format csv)"
                ) as copy:
                    for record in rows_from_csv(path):
                        writer.writerow(["" if v is None else v for v in record])
                        count += 1
                        if count % 50000 == 0:
                            copy.write(buffer.getvalue())
                            buffer.seek(0)
                            buffer.truncate(0)
                            print(f"  {count} trips ...")
                    copy.write(buffer.getvalue())
                cur.execute(
                    f"""
                    insert into baywheels_trips ({', '.join(COLUMNS)})
                    select {', '.join(COLUMNS)} from _stage
                    on conflict (ride_id) do nothing
                    """
                )
                conn.commit()
                total += count
                print(f"[import] {path}: {count} rows staged")
            print(f"[import] {total} rows total; refreshing station_hourly ...")
            cur.execute("select refresh_station_hourly(%s)", (", ".join(os.path.basename(p) for p in paths),))
            conn.commit()
            cur.execute("select count(*) from station_hourly")
            print(f"[import] station_hourly rows: {cur.fetchone()[0]}")
            cur.execute("select * from station_hourly_meta")
            print(f"[import] meta: {cur.fetchone()}")


if __name__ == "__main__":
    main()
