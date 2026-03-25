import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import YAML from "yaml";

export const DEFAULT_CONFIG_FILE = process.env.BACKUP_CONFIG_FILE || "/config/backup/jobs.yaml";

function asObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
  return value;
}

function asNonEmptyString(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name} must be a non-empty string`);
  }
  return value.trim();
}

function asPositiveInteger(value, name, fallback) {
  const candidate = value ?? fallback;
  const parsed = Number.parseInt(String(candidate), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function mergeMqtt(globalMqtt = {}, jobMqtt = {}) {
  return {
    enabled: Boolean(jobMqtt.enabled ?? globalMqtt.enabled ?? false),
    host: jobMqtt.host ?? globalMqtt.host ?? "",
    port: Number.parseInt(String(jobMqtt.port ?? globalMqtt.port ?? 1883), 10),
    username: jobMqtt.username ?? globalMqtt.username ?? process.env.MQTT_USERNAME ?? "",
    password: jobMqtt.password ?? globalMqtt.password ?? process.env.MQTT_PASSWORD ?? "",
    topicPrefix: jobMqtt.topicPrefix ?? globalMqtt.topicPrefix ?? "homeassistant/sensor/rclone_backup",
    deviceName: jobMqtt.deviceName ?? globalMqtt.deviceName ?? "Backup",
    uniqueIdPrefix: jobMqtt.uniqueIdPrefix ?? globalMqtt.uniqueIdPrefix ?? "rclone_backup"
  };
}

export async function loadConfig(configPath = DEFAULT_CONFIG_FILE) {
  const rawContent = await fs.readFile(configPath, "utf8");
  const parsed = YAML.parse(rawContent);
  const root = asObject(parsed, "Root configuration");

  const global = root.global ? asObject(root.global, "global") : {};
  const jobs = root.jobs;
  if (!Array.isArray(jobs) || jobs.length === 0) {
    throw new Error("jobs must be a non-empty array");
  }

  const defaultRcloneConfigFile = global.rcloneConfigFile || "/config/rclone/rclone.conf";
  const defaultRetentionDays = asPositiveInteger(global.retentionDays, "global.retentionDays", 7);
  const globalMqtt = global.mqtt ? asObject(global.mqtt, "global.mqtt") : {};

  const seenIds = new Set();
  const normalizedJobs = jobs.map((job, index) => {
    const sourcePath = `jobs[${index}]`;
    const entry = asObject(job, sourcePath);
    const id = asNonEmptyString(entry.id, `${sourcePath}.id`);

    if (seenIds.has(id)) {
      throw new Error(`Duplicate job id: ${id}`);
    }
    seenIds.add(id);

    const enabled = entry.enabled !== false;
    const cron = asNonEmptyString(entry.cron, `${sourcePath}.cron`);
    const source = path.resolve(asNonEmptyString(entry.source, `${sourcePath}.source`));
    const target = asNonEmptyString(entry.target, `${sourcePath}.target`);
    const prefix = asNonEmptyString(entry.prefix ?? id, `${sourcePath}.prefix`);
    const retentionDays = asPositiveInteger(entry.retentionDays, `${sourcePath}.retentionDays`, defaultRetentionDays);
    const rcloneConfigFile = asNonEmptyString(
      entry.rcloneConfigFile ?? defaultRcloneConfigFile,
      `${sourcePath}.rcloneConfigFile`
    );
    const mqtt = mergeMqtt(globalMqtt, entry.mqtt ? asObject(entry.mqtt, `${sourcePath}.mqtt`) : {});

    if (mqtt.enabled && !mqtt.host) {
      throw new Error(`${sourcePath}.mqtt.host is required when mqtt.enabled is true`);
    }

    if (!Number.isInteger(mqtt.port) || mqtt.port <= 0) {
      throw new Error(`${sourcePath}.mqtt.port must be a positive integer`);
    }

    return {
      id,
      enabled,
      cron,
      source,
      target,
      prefix,
      retentionDays,
      rcloneConfigFile,
      mqtt
    };
  });

  return {
    configPath,
    jobs: normalizedJobs
  };
}
