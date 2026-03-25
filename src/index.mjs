import process from "node:process";
import cron from "node-cron";
import { loadConfig } from "./config.mjs";
import { runBackupJob } from "./backup-runner.mjs";

const activeRuns = new Set();

async function runJobWithLock(job) {
  if (activeRuns.has(job.id)) {
    console.warn(`[${job.id}] previous run still active, skipping`);
    return;
  }

  activeRuns.add(job.id);
  try {
    await runBackupJob(job);
  } finally {
    activeRuns.delete(job.id);
  }
}

async function main() {
  const configPath = process.env.BACKUP_CONFIG_FILE || "/config/backup/jobs.yaml";
  const { jobs } = await loadConfig(configPath);

  if (jobs.filter((job) => job.enabled).length === 0) {
    throw new Error("No enabled backup jobs configured");
  }

  const scheduledTasks = [];
  for (const job of jobs) {
    if (!job.enabled) {
      console.log(`[${job.id}] disabled`);
      continue;
    }

    if (!cron.validate(job.cron)) {
      throw new Error(`Invalid cron expression for job ${job.id}: ${job.cron}`);
    }

    console.log(`[${job.id}] scheduled with cron '${job.cron}'`);
    const task = cron.schedule(job.cron, async () => {
      await runJobWithLock(job);
    });
    scheduledTasks.push(task);
  }

  const shutdown = async (signal) => {
    console.log(`Received ${signal}, stopping scheduler`);
    for (const task of scheduledTasks) {
      task.stop();
    }
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  console.log("Backup service started");
}

main().catch((error) => {
  console.error(`Fatal startup error: ${error.message}`);
  process.exit(1);
});
