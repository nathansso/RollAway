# Deploying the Rollaway Functions

Everything is deploy-ready; only steps that need **your** accounts remain.
No deploy was attempted from CI/agents (no doctl credentials present).

## 0. One-time setup
```bash
doctl auth init                 # paste your DO API token
doctl serverless install        # if not already installed
doctl serverless connect        # connect to the team namespace
doctl serverless status         # verify
```

## 1. Secrets
```bash
cp functions/.env.example functions/.env
# fill in: SOCRATA_APP_TOKEN (recommended), GOOGLE_PLACES_KEY,
# TICKETMASTER_KEY, SFMTA_EVENTS_URL (optional — leave empty for bundled sample)
```
All four variables must EXIST in `functions/.env` (empty is fine) because
`project.yml` references them. Missing keys don't break functions — they fall
back to the documented fixtures (`TODO(real-key)` markers).

## 2. Deploy
```bash
cd functions
doctl serverless deploy .
```
The remote build runs `npm install` per function (only `check_clearance` has
dependencies — the four turf packages).

## 3. Smoke test each function
```bash
doctl serverless functions invoke rollaway/get_vendors      -p lat:37.78 -p lng:-122.40 -p radius_m:500 -p day:fri -p time:12:00
doctl serverless functions invoke rollaway/get_closures     -p lat:37.78 -p lng:-122.40 -p radius_m:800
doctl serverless functions invoke rollaway/get_foot_traffic -p lat:37.78 -p lng:-122.40 -p radius_m:400 -p day:fri -p hour:12
doctl serverless functions invoke rollaway/get_restaurants  -p lat:37.78 -p lng:-122.40 -p radius_m:300
doctl serverless functions invoke rollaway/get_events       -p lat:37.78 -p lng:-122.40 -p radius_m:3000
doctl serverless functions invoke rollaway/check_clearance  -p lat:37.78 -p lng:-122.40 -p vendor_type:truck
```

## 4. Collect URLs and hand them off
```bash
for f in get_vendors get_closures get_foot_traffic get_restaurants get_events check_clearance; do
  echo "$f: $(doctl serverless functions get rollaway/$f --url)"
done
```
- **Person 1** gets: `<get_vendors URL>?format=geojson` (citywide seed layer).
- **Person 2** gets: all six URLs for tool registration.

## Local testing without deploying
```bash
node functions/scripts/invoke_local.js <function> '<json args>'
cd functions/packages/rollaway/check_clearance && npm install && npm test
```

## Regenerating shipped data
```bash
node functions/scripts/fetch_static_data.js        # schools/hydrants/sidewalks snapshots
node functions/scripts/aggregate_baywheels.js <month>.csv   # station_hourly.json
node functions/scripts/sync_shared.js              # after editing lib/shared.js
```
