import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { createApp } from "../src/app.js";
import { CodeStore } from "../src/store.js";
import { hashCode } from "../src/auth.js";

const secret = "test-secret-that-is-definitely-long-enough";

function parseSetCookies(headers) {
  return headers.getSetCookie().map((value) => value.split(";", 1)[0]).join("; ");
}

async function fixture(overrides = {}, customFetch = null) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "riddle-test-"));
  fs.writeFileSync(path.join(dir, "index.html"), "ok");
  fs.writeFileSync(path.join(dir, "font.woff2"), "font");
  const store = new CodeStore(path.join(dir, "codes.json"));
  const codes = ["VALID-ABCDE", "EXPIRE-ABCD"];
  store.addCodes(codes.map((code) => ({ hash: hashCode(code, secret), createdAt: Date.now(), channel: "test" })));
  const upstreamCalls = [];
  const fetchImpl = async (_url, options) => {
    upstreamCalls.push(JSON.parse(options.body));
    return new Response('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\ndata: [DONE]\n\n', { status: 200, headers: { "content-type": "text/event-stream" } });
  };
  const config = { publicDir: dir, publicOrigin: "http://localhost", sessionSecret: secret, kimiApiKey: "server-only-key", kimiApiUrl: "https://example.invalid/chat", kimiModel: "vision-model", sessionDays: 30, maxDevices: 2, codeDailyCap: 500, globalDailyCap: 5000, systemPrompt: "prompt", ...overrides };
  const server = http.createServer(createApp(config, store, customFetch || fetchImpl));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { base: `http://127.0.0.1:${server.address().port}`, server, store, upstreamCalls };
}

test("login, remembered session and Kimi proxy keep secret server-side", async (t) => {
  const f = await fixture(); t.after(() => f.server.close());
  const login = await fetch(`${f.base}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: "VALID-ABCDE" }) });
  assert.equal(login.status, 200);
  const cookie = parseSetCookies(login.headers);
  const session = await fetch(`${f.base}/api/auth/session`, { headers: { cookie } });
  assert.equal(session.status, 200);
  const chat = await fetch(`${f.base}/api/chat`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ image: "data:image/png;base64,AAAA" }) });
  assert.equal(chat.status, 200);
  assert.match(await chat.text(), /Hello/);
  assert.equal(f.upstreamCalls.length, 1);
  assert.equal(JSON.stringify(f.upstreamCalls[0]).includes("server-only-key"), false);
  assert.deepEqual(f.upstreamCalls[0].thinking, { type: "disabled" });
});

test("invalid code denied and third device rejected", async (t) => {
  const f = await fixture(); t.after(() => f.server.close());
  const invalid = await fetch(`${f.base}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: "NOPE-0000" }) });
  assert.equal(invalid.status, 401);
  for (let device = 1; device <= 3; device++) {
    const response = await fetch(`${f.base}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json", cookie: `riddle_device=device-${device}` }, body: JSON.stringify({ code: "VALID-ABCDE" }) });
    assert.equal(response.status, device < 3 ? 200 : 401);
    if (device === 3) assert.equal((await response.json()).reason, "DEVICE_LIMIT");
  }
});

test("expired code is denied", async (t) => {
  const f = await fixture(); t.after(() => f.server.close());
  const codeHash = hashCode("EXPIRE-ABCD", secret);
  f.store.login(codeHash, "old-device", Date.now() - 31 * 86400000, 30, 2);
  const response = await fetch(`${f.base}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json", cookie: "riddle_device=old-device" }, body: JSON.stringify({ code: "EXPIRE-ABCD" }) });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).reason, "EXPIRED_CODE");
});

test("self-hosted font assets use a Safari-compatible MIME type", async (t) => {
  const f = await fixture(); t.after(() => f.server.close());
  const response = await fetch(`${f.base}/font.woff2`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "font/woff2");
});

test("self-host mode works without an access code while keeping the API key server-side", async (t) => {
  const f = await fixture({ authRequired: false }); t.after(() => f.server.close());
  const session = await fetch(`${f.base}/api/auth/session`);
  assert.equal(session.status, 200);
  assert.deepEqual(await session.json(), { authenticated: true, authRequired: false });
  const chat = await fetch(`${f.base}/api/chat`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ image: "data:image/png;base64,AAAA" }) });
  assert.equal(chat.status, 200);
  assert.match(await chat.text(), /Hello/);
  assert.equal(JSON.stringify(f.upstreamCalls[0]).includes("server-only-key"), false);
});

test("the previous diary reply is sent as anti-repetition context", async (t) => {
  const f = await fixture({ authRequired: false }); t.after(() => f.server.close());
  const previousResponse = "The moon already answered this once.";
  const chat = await fetch(`${f.base}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ image: "data:image/png;base64,AAAA", previousResponse })
  });
  assert.equal(chat.status, 200);
  const messages = JSON.stringify(f.upstreamCalls[0].messages);
  assert.match(messages, /The moon already answered this once/);
  assert.match(messages, /do not repeat/i);
});

test("explicit questions are answered directly before diary styling", async (t) => {
  const f = await fixture({ authRequired: false }); t.after(() => f.server.close());
  await fetch(`${f.base}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ image: "data:image/png;base64,AAAA" })
  });
  const systemPrompt = f.upstreamCalls[0].messages[0].content;
  assert.match(systemPrompt, /answer explicit questions directly and correctly/i);
  assert.match(systemPrompt, /vary vocabulary and sentence openings/i);
  assert.match(systemPrompt, /never evade/i);
});

test("current-date questions receive authoritative Shanghai date context", async (t) => {
  const f = await fixture({ authRequired: false, timeZone: "Asia/Shanghai" }); t.after(() => f.server.close());
  await fetch(`${f.base}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ image: "data:image/png;base64,AAAA" })
  });
  const systemPrompt = f.upstreamCalls[0].messages[0].content;
  assert.match(systemPrompt, /Current date and weekday in Asia\/Shanghai:/);
  assert.match(systemPrompt, /Saturday/);
  assert.match(systemPrompt, /2026/);
});

test("a transient Kimi failure is retried once", async (t) => {
  let attempts = 0;
  const fetchImpl = async () => {
    attempts += 1;
    if (attempts === 1) return new Response("temporary", { status: 502 });
    return new Response('data: {"choices":[{"delta":{"content":"Recovered"}}]}\n\ndata: [DONE]\n\n', { status: 200, headers: { "content-type": "text/event-stream" } });
  };
  const f = await fixture({ authRequired: false }, fetchImpl); t.after(() => f.server.close());
  const chat = await fetch(`${f.base}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ image: "data:image/png;base64,AAAA" })
  });
  assert.equal(chat.status, 200);
  assert.match(await chat.text(), /Recovered/);
  assert.equal(attempts, 2);
});

test("a stalled Kimi request times out before retrying", async (t) => {
  let attempts = 0;
  const fetchImpl = async (_url, options) => {
    attempts += 1;
    if (attempts === 1) {
      return await new Promise((_, reject) => options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true }));
    }
    return new Response('data: {"choices":[{"delta":{"content":"Recovered quickly"}}]}\n\ndata: [DONE]\n\n', { status: 200, headers: { "content-type": "text/event-stream" } });
  };
  const f = await fixture({ authRequired: false, upstreamTimeoutMs: 20 }, fetchImpl); t.after(() => f.server.close());
  const started = performance.now();
  const chat = await fetch(`${f.base}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ image: "data:image/png;base64,AAAA" })
  });
  assert.equal(chat.status, 200);
  assert.match(await chat.text(), /Recovered quickly/);
  assert.equal(attempts, 2);
  assert.ok(performance.now() - started < 500);
});
