import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { CodeStore } from "./store.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = process.env;
const authRequired = (env.AUTH_REQUIRED || "true").toLowerCase() !== "false";
if (!env.KIMI_API_KEY) throw new Error("Missing required environment variable: KIMI_API_KEY");
if (authRequired && !env.SESSION_SECRET) throw new Error("Missing required environment variable: SESSION_SECRET");
if (authRequired && env.SESSION_SECRET.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");

const config = {
  publicDir: path.join(root, "public"),
  publicOrigin: env.PUBLIC_ORIGIN || "http://localhost:3000",
  authRequired,
  sessionSecret: env.SESSION_SECRET || "self-host-mode-does-not-use-sessions",
  kimiApiKey: env.KIMI_API_KEY,
  kimiApiUrl: env.KIMI_API_URL || "https://api.moonshot.cn/v1/chat/completions",
  kimiModel: env.KIMI_MODEL || "kimi-k2.5",
  sessionDays: Number(env.SESSION_DAYS || 30),
  maxDevices: Number(env.MAX_DEVICES_PER_CODE || 2),
  codeDailyCap: Number(env.EMERGENCY_CODE_DAILY_CAP || 500),
  globalDailyCap: Number(env.EMERGENCY_GLOBAL_DAILY_CAP || 5000),
  systemPrompt: env.SYSTEM_PROMPT || "You are Riddle, an ancient, gentle and mysterious handwritten diary. Reply in one or two short, poetic sentences; never use lists."
};

const store = new CodeStore(env.CODES_FILE || path.join(root, "data", "codes.json"));
const server = http.createServer(createApp(config, store));
server.listen(Number(env.PORT || 3000), "0.0.0.0", () => console.log(`Riddle listening on ${config.publicOrigin}`));
