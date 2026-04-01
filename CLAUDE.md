# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A containerized multi-job backup orchestration service. It runs rclone-based backups on configurable cron schedules inside a Docker container, with optional Home Assistant MQTT status reporting.

## Running

```bash
# Install dependencies
npm install

# Start the service locally (requires a valid jobs.yaml)
BACKUP_CONFIG_FILE=./example/jobs.yaml npm start

# Build Docker image
docker build -t rclone-backup .

# Run with Docker Compose
docker compose up -d
```

There are no test or lint scripts configured.

## Architecture

Single Node.js process, ESM modules, runs all jobs in one event loop.

**Execution flow per job:**
1. `index.mjs` — Schedules jobs via `node-cron`, validates cron expressions at startup, tracks in-flight runs (by job ID) to prevent overlapping executions
2. `backup-runner.mjs` — Executes one job: validates source path + rclone config → creates `tar.gz` in `/tmp` → `rclone copy` to target → `rclone delete --min-age` for retention → publishes MQTT status → cleans up `/tmp`
3. `config.mjs` — Loads and validates `jobs.yaml`; merges global defaults into each job
4. `mqtt.mjs` — Publishes Home Assistant-compatible discovery + state messages (retained, QoS 1)

**Config format** (`jobs.yaml`):
```yaml
global:
  rcloneConfigFile: /config/rclone/rclone.conf
  retentionDays: 7
  mqtt:
    enabled: false
    host: broker.example.com
    ...

jobs:
  - id: app-data            # required, unique
    enabled: true
    cron: "0 3 * * *"       # required, 5-field
    source: /data/app        # required, absolute path
    target: remote:/path     # required, rclone destination
    prefix: app-data         # optional (defaults to id)
    retentionDays: 14        # optional (overrides global)
```

**Environment variables:**
- `BACKUP_CONFIG_FILE` — path to `jobs.yaml` (default: `/config/backup/jobs.yaml`)
- `MQTT_USERNAME` / `MQTT_PASSWORD` — override config values for credentials

**Archive filename format:** `{prefix}-{ISO-timestamp-with-colons-as-dashes}.tar.gz`
Example: `app-data-2024-03-25T14-30-45Z.tar.gz`

**Retention:** Only runs on successful upload. Uses `rclone delete --min-age {days}d`. Failures are logged but don't fail the job.

**CI/CD:** `.github/workflows/build-image.yml` builds multi-platform images (`linux/amd64`, `linux/arm64`) and publishes to `ghcr.io/lucasg04/rclone-backup:latest` on push to `main`.
