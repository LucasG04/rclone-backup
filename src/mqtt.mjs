import mqtt from "mqtt";

const MQTT_TIMEOUT_MS = 7000;

function createMqttClient(config) {
  return mqtt.connect({
    host: config.host,
    port: config.port,
    username: config.username || undefined,
    password: config.password || undefined,
    connectTimeout: MQTT_TIMEOUT_MS,
    reconnectPeriod: 0,
  });
}

function waitForConnect(client) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("MQTT connection timed out"));
    }, MQTT_TIMEOUT_MS);

    const onConnect = () => { cleanup(); resolve(); };
    const onError   = (err) => { cleanup(); reject(err); };
    const onClose   = () => { cleanup(); reject(new Error("MQTT connection closed unexpectedly")); };

    function cleanup() {
      clearTimeout(timeout);
      client.off("connect", onConnect);
      client.off("error", onError);
      client.off("close", onClose);
    }

    client.once("connect", onConnect);
    client.once("error", onError);
    client.once("close", onClose);
  });
}

function publishRetained(client, topic, data) {
  const payload = typeof data === "string" ? data : JSON.stringify(data);
  return new Promise((resolve, reject) => {
    client.publish(
      topic,
      payload,
      { retain: true, qos: 1 }, // qos: 1 = at-least-once
      (err) => (err ? reject(err) : resolve())
    );
  });
}

export async function publishJobStatus(job, payload) {
  if (!job.mqtt?.enabled || !job.mqtt.host) {
    return;
  }

  const { mqtt: cfg } = job;
  const topicBase = `${cfg.topicPrefix}/${job.id}`;
  const uniqueId  = `${cfg.uniqueIdPrefix}_${job.id}`;

  const client = createMqttClient(cfg);

  try {
    await waitForConnect(client);

    await publishRetained(client, `${topicBase}/config`, {
      name: `Rclone Backup ${job.id}`,
      state_topic: `${topicBase}/state`,
      json_attributes_topic: `${topicBase}/attributes`,
      unique_id: uniqueId,
      icon: "mdi:cloud-upload",
      device: {
        name: cfg.deviceName,
        identifiers: [uniqueId],
      },
    });

    await Promise.all([
      publishRetained(client, `${topicBase}/state`, payload.status),
      publishRetained(client, `${topicBase}/attributes`, {
        last_run:  payload.runAt,
        exit_code: payload.exitCode,
        stats:     payload.stats,
      }),
    ]);
  } finally {
    client.end(false);
  }
}