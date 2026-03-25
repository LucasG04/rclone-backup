# rclone-backup

Standalone backup service for multiple backup jobs with:

- YAML configuration for multiple source/target pairs
- cron scheduling per job inside one service process
- archive + `rclone` upload + retention cleanup
- optional MQTT status per job

## Quick Start

1. Use the sample config:

```bash
cp example/jobs.yaml ./jobs.yaml
```

2. Edit `jobs.yaml` with your job list and mount paths.

3. Run container:

```bash
docker run -d \
  --name rclone-backup \
  -e BACKUP_CONFIG_FILE=/config/backup/jobs.yaml \
  -v /path/to/app:/data/app:ro \
  -v /path/to/media:/data/media:ro \
  -v "$(pwd)/jobs.yaml:/config/backup/jobs.yaml:ro" \
  -v "$(pwd)/rclone.conf:/config/rclone/rclone.conf:ro" \
  ghcr.io/lucasg04/rclone-backup:latest
```

See the compose setup in [example/docker-compose.yml](example/docker-compose.yml).

## YAML Configuration

Use [example/jobs.yaml](example/jobs.yaml) as baseline.

```yaml
global:
  rcloneConfigFile: /config/rclone/rclone.conf
  retentionDays: 7

jobs:
  - id: app-data
    enabled: true
    cron: "0 3 * * *"
    source: /data/app
    target: backup-remote:/archives/app
    prefix: app-data
```

### `global` fields

| Field | Required | Default | Description |
|---|---|---|---|
| `rcloneConfigFile` | no | `/config/rclone/rclone.conf` | rclone config path |
| `retentionDays` | no | `7` | default retention for jobs |
| `mqtt.enabled` | no | `false` | enable MQTT publishing |
| `mqtt.host` | no* | empty | broker host (`*` required if enabled) |
| `mqtt.port` | no | `1883` | broker port |
| `mqtt.username` | no | empty | MQTT user |
| `mqtt.password` | no | empty | MQTT password |
| `mqtt.topicPrefix` | no | `homeassistant/sensor/rclone_backup` | base topic prefix |
| `mqtt.deviceName` | no | `Backup` | device name |
| `mqtt.uniqueIdPrefix` | no | `rclone_backup` | unique id prefix |

### `jobs[]` fields

| Field | Required | Description |
|---|---|---|
| `id` | yes | unique job id |
| `enabled` | no | defaults to `true` |
| `cron` | yes | cron expression for this job |
| `source` | yes | source directory to archive |
| `target` | yes | rclone destination |
| `prefix` | no | archive file name prefix (defaults to `id`) |
| `retentionDays` | no | overrides `global.retentionDays` |
| `rcloneConfigFile` | no | overrides `global.rcloneConfigFile` |
| `mqtt.*` | no | per-job MQTT override |

## Runtime Environment Variables

These variables configure the service process itself:

| Variable | Default | Description |
|---|---|---|
| `BACKUP_CONFIG_FILE` | `/config/backup/jobs.yaml` | YAML config location |
| `MQTT_USERNAME` | empty | MQTT username; fallback to config MQTT username if not set |
| `MQTT_PASSWORD` | empty | MQTT password; fallback to config MQTT password if not set |
