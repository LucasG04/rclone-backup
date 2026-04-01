import fs from "node:fs/promises";
import path from "node:path";
import { $ } from "zx";
import { publishJobStatus } from "./mqtt.mjs";

function timestampForFile(date) {
  return date.toISOString().replace(/:/g, "-").replace(/\.\d{3}Z$/, "Z");
}

function getLastLogLine(content) {
  const lines = content.split(/\r?\n/).filter(Boolean);
  return lines.length > 0 ? lines[lines.length - 1] : "no stats available";
}

function log(jobId, message) {
  console.log(`[${new Date().toISOString()}] [${jobId}] ${message}`);
}

function logError(jobId, message) {
  console.error(`[${new Date().toISOString()}] [${jobId}] ${message}`);
}

export async function runBackupJob(job) {
  const startedAt = new Date();
  const dateTag = timestampForFile(startedAt);
  const archivePath = `/tmp/${job.prefix}-${dateTag}.tar.gz`;
  const rcloneLogFile = `/tmp/rclone-${job.id}.log`;

  let exitCode = 1;
  let stats = "no stats available";

  try {
    const sourceStat = await fs.stat(job.source);
    if (!sourceStat.isDirectory()) {
      throw new Error(`Source must be a directory: ${job.source}`);
    }

    await fs.stat(job.rcloneConfigFile);

    log(job.id, `starting backup`);
    await $`tar -czf ${archivePath} --ignore-failed-read -C ${path.dirname(job.source)} ${path.basename(job.source)}`;

    await fs.rm(rcloneLogFile, { force: true });

    try {
      await $`rclone copy ${archivePath} ${job.target} --config ${job.rcloneConfigFile} --stats 10s --stats-one-line --log-file ${rcloneLogFile} --log-level NOTICE --stats-log-level NOTICE`;
      exitCode = 0;
    } catch (error) {
      exitCode = typeof error.exitCode === "number" ? error.exitCode : 1;
      logError(job.id, `upload failed with exit code ${exitCode}`);
    }

    try {
      const rawLog = await fs.readFile(rcloneLogFile, "utf8");
      stats = getLastLogLine(rawLog);
    } catch {
      stats = "no stats available";
    }

    if (exitCode === 0) {
      try {
        await $`rclone delete ${job.target} --config ${job.rcloneConfigFile} --min-age ${job.retentionDays}d`;
      } catch (retentionError) {
        const retentionCode = typeof retentionError.exitCode === "number" ? retentionError.exitCode : 1;
        logError(job.id, `retention failed with exit code ${retentionCode}`);
      }
    }
  } catch (error) {
    exitCode = 1;
    logError(job.id, `backup setup failed: ${error.message}`);
  } finally {
    await fs.rm(archivePath, { force: true });
  }

  const status = exitCode === 0 ? "OK" : "ERROR";
  try {
    await publishJobStatus(job, {
      status,
      runAt: startedAt.toISOString(),
      exitCode,
      stats
    });
  } catch (error) {
    logError(job.id, `mqtt publish failed: ${error.message}`);
  }

  if (exitCode === 0) {
    log(job.id, `backup completed successfully`);
  }

  return {
    jobId: job.id,
    exitCode,
    status,
    runAt: startedAt.toISOString(),
    stats
  };
}
