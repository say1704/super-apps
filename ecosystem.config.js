const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

const certFile = path.join(__dirname, "certs", "cert.pem");
const keyFile = path.join(__dirname, "certs", "key.pem");
const hasSsl = fs.existsSync(certFile) && fs.existsSync(keyFile);

const sslArgs = hasSsl
  ? ` --ssl-certfile ${certFile} --ssl-keyfile ${keyFile}`
  : "";

// Auto-detect LAN IP for network access
const interfaces = os.networkInterfaces();
let lanIP = "127.0.0.1";
for (const name of Object.keys(interfaces)) {
  for (const iface of interfaces[name]) {
    if (iface.family === "IPv4" && !iface.internal) {
      lanIP = iface.address;
      break;
    }
  }
}
const lanSubnet = lanIP.split(".").slice(0, 3).join(".") + ".0/24";
const corsOrigins = `https://localhost:3443,https://127.0.0.1:3443,https://${lanIP}:3443`;
const allowedHosts = `localhost,127.0.0.1,${lanIP}`;
// Shared secret between the backend workers and the model-server. NEVER hardcode it
// here (this file is committed). Priority: env var → gitignored key file → auto-generate.
// The key file (backend/.superapps/model_server.key) is covered by *.key in .gitignore.
function loadOrCreateModelServerKey() {
  if (process.env.MODEL_SERVER_API_KEY) return process.env.MODEL_SERVER_API_KEY;
  const keyDir = path.join(__dirname, "backend", ".superapps");
  const keyFile = path.join(keyDir, "model_server.key");
  try {
    if (fs.existsSync(keyFile)) {
      const k = fs.readFileSync(keyFile, "utf8").trim();
      if (k) return k;
    }
    fs.mkdirSync(keyDir, { recursive: true });
    const key = crypto.randomBytes(32).toString("hex");
    fs.writeFileSync(keyFile, key, { mode: 0o600 });
    return key;
  } catch (e) {
    throw new Error(
      `MODEL_SERVER_API_KEY not set and could not read/create ${keyFile}: ${e.message}`,
    );
  }
}
const modelServerApiKey = loadOrCreateModelServerKey();

const baseArgs =
  "-m uvicorn main:app --host 127.0.0.1 --timeout-keep-alive 120" + sslArgs;

module.exports = {
  apps: [
    {
      name: "superapps-model-server",
      cwd: "./backend",
      script: "./venv/bin/python",
      args: "-m uvicorn model_server:app --host 127.0.0.1 --port 8081" + sslArgs,
      env: { PYTHONPATH: ".", MODEL_SERVER_API_KEY: modelServerApiKey },
      max_memory_restart: "10G",
      error_file: "./logs/model-server-error.log",
      out_file: "./logs/model-server-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      max_size: "10M",
      retain: 10,
      merge_logs: true,
      max_restarts: 5,
      restart_delay: 5000,
    },
    {
      name: "superapps-backend-1",
      cwd: "./backend",
      script: "./venv/bin/python",
      args: baseArgs + " --port 8001",
      env: { PYTHONPATH: ".", MODEL_SERVER_API_KEY: modelServerApiKey, START_ADMIN_UI: "1" },
      max_memory_restart: "5G",
      error_file: "./logs/backend-error.log",
      out_file: "./logs/backend-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      max_size: "10M",
      retain: 10,
      merge_logs: true,
      max_restarts: 10,
      restart_delay: 1000,
    },
    {
      name: "superapps-backend-2",
      cwd: "./backend",
      script: "./venv/bin/python",
      args: baseArgs + " --port 8002",
      env: { PYTHONPATH: ".", MODEL_SERVER_API_KEY: modelServerApiKey },
      max_memory_restart: "5G",
      error_file: "./logs/backend-error.log",
      out_file: "./logs/backend-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      max_size: "10M",
      retain: 10,
      merge_logs: true,
      max_restarts: 10,
      restart_delay: 30000,
    },
    {
      name: "superapps-backend-3",
      cwd: "./backend",
      script: "./venv/bin/python",
      args: baseArgs + " --port 8003",
      env: { PYTHONPATH: ".", MODEL_SERVER_API_KEY: modelServerApiKey },
      max_memory_restart: "5G",
      error_file: "./logs/backend-error.log",
      out_file: "./logs/backend-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      max_size: "10M",
      retain: 10,
      merge_logs: true,
      max_restarts: 10,
      restart_delay: 60000,
    },
    {
      name: "superapps-backend-4",
      cwd: "./backend",
      script: "./venv/bin/python",
      args: baseArgs + " --port 8004",
      env: { PYTHONPATH: ".", MODEL_SERVER_API_KEY: modelServerApiKey },
      max_memory_restart: "5G",
      error_file: "./logs/backend-error.log",
      out_file: "./logs/backend-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      max_size: "10M",
      retain: 10,
      merge_logs: true,
      max_restarts: 10,
      restart_delay: 90000,
    },
    {
      name: "superapps-backend-5",
      cwd: "./backend",
      script: "./venv/bin/python",
      args: baseArgs + " --port 8005",
      env: { PYTHONPATH: ".", MODEL_SERVER_API_KEY: modelServerApiKey },
      max_memory_restart: "5G",
      error_file: "./logs/backend-error.log",
      out_file: "./logs/backend-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      max_size: "10M",
      retain: 10,
      merge_logs: true,
      max_restarts: 10,
      restart_delay: 120000,
    },
    {
      name: "superapps-frontend",
      cwd: "./frontend",
      script: "server.js",
      env: {
        HTTPS_PORT: "3443",
        HTTP_PORT: "3001",
        PORT: "3001",
        NODE_ENV: "production",
        APP_URL: "https://localhost",
        NODE_EXTRA_CA_CERTS: path.join(__dirname, "certs", "rootCA.pem"),
        // API proxy backend worker pool (load balancing). Distributed with
        // per-browser sticky sessions; auth/AI/SSE pinned to the first entry.
        BACKEND_URLS:
          "https://127.0.0.1:8001,https://127.0.0.1:8002,https://127.0.0.1:8003,https://127.0.0.1:8004,https://127.0.0.1:8005",
      },
      max_memory_restart: "512M",
      error_file: "./logs/frontend-error.log",
      out_file: "./logs/frontend-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      max_size: "10M",
      retain: 10,
      merge_logs: true,
      max_restarts: 10,
      restart_delay: 5000,
    },
  ],
};
