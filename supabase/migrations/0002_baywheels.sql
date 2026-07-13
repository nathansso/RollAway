-- Phase 2a.3 — Bay Wheels foot-traffic data.
-- Raw monthly trip CSVs land in baywheels_trips (re-aggregatable); the API
-- reads station_hourly. Loading a new month is a data operation, not a
-- redeploy: import CSV (supabase/scripts/import_baywheels.py), then run
-- select refresh_station_hourly();

create table if not exists baywheels_trips (
  ride_id text primary key,
  started_at timestamptz,
  ended_at timestamptz,
  start_station_short_id text,   -- GBFS short_name, e.g. 'SF-T21'
  end_station_short_id text,
  start_lat double precision, start_lng double precision,
  end_lat double precision, end_lng double precision
);

create table if not exists station_hourly (
  station_short_id text,
  day_of_week smallint,           -- 0=Sun..6=Sat (JS Date.getDay() order)
  hour smallint,
  avg_events real,                -- avg trip starts+ends per hour
  primary key (station_short_id, day_of_week, hour)
);

create table if not exists station_hourly_meta (
  id boolean primary key default true,
  source text,
  generated_at timestamptz,
  synthetic boolean,
  days_covered int,
  p95_events_per_station_hour real
);

-- The aggregation the offline aggregate_baywheels.js script performed, as one
-- SQL routine. An "event" is a trip STARTING or ENDING at a station in that
-- local hour; avg divides by the number of distinct dates seen for that
-- day-of-week across the loaded trips (matching the JS semantics).
create or replace function refresh_station_hourly(source_label text default null)
returns void
language plpgsql
as $$
declare
  tz constant text := 'America/Los_Angeles';
begin
  create temp table _events on commit drop as
    select start_station_short_id as station,
           extract(dow from started_at at time zone tz)::smallint as dow,
           extract(hour from started_at at time zone tz)::smallint as hour,
           (started_at at time zone tz)::date as day
    from baywheels_trips
    where start_station_short_id is not null and started_at is not null
    union all
    select end_station_short_id,
           extract(dow from ended_at at time zone tz)::smallint,
           extract(hour from ended_at at time zone tz)::smallint,
           (ended_at at time zone tz)::date
    from baywheels_trips
    where end_station_short_id is not null and ended_at is not null;

  delete from station_hourly;

  insert into station_hourly (station_short_id, day_of_week, hour, avg_events)
  select e.station, e.dow, e.hour,
         round((count(*)::numeric / greatest(d.n_days, 1)), 2)::real
  from _events e
  join (
    select dow, count(distinct day) as n_days from _events group by dow
  ) d using (dow)
  group by e.station, e.dow, e.hour, d.n_days;

  insert into station_hourly_meta (id, source, generated_at, synthetic, days_covered, p95_events_per_station_hour)
  values (
    true,
    coalesce(source_label, 'baywheels_trips (' || (select count(*) from baywheels_trips) || ' trips)'),
    now(),
    false,
    (select count(distinct day) from _events),
    (select percentile_cont(0.95) within group (order by avg_events)
       from station_hourly where avg_events > 0)
  )
  on conflict (id) do update set
    source = excluded.source,
    generated_at = excluded.generated_at,
    synthetic = excluded.synthetic,
    days_covered = excluded.days_covered,
    p95_events_per_station_hour = excluded.p95_events_per_station_hour;
end;
$$;

-- Read path: get_foot_traffic (DO Function) reads via PostgREST with the anon
-- key; keep it read-only public like the KB.
alter table baywheels_trips enable row level security;
alter table station_hourly enable row level security;
alter table station_hourly_meta enable row level security;
create policy station_hourly_read on station_hourly for select using (true);
create policy station_hourly_meta_read on station_hourly_meta for select using (true);
-- baywheels_trips: no anon policy — raw trips are service-key only.
