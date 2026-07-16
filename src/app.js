import fs from "node:fs";
import path from "node:path";
import { hashCode, signSession, verifySession, randomDeviceId, parseCookies, cookie } from "./auth.js";

const JSON_LIMIT = 8 * 1024 * 1024;
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml" };

const sendJson = (res, status, body, headers = {}) => {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers });
  res.end(JSON.stringify(body));
};

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > JSON_LIMIT) throw Object.assign(new Error("Payload too large"), { status: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); }
  catch { throw Object.assign(new Error("Invalid JSON"), { status: 400 }); }
}

export function createApp(config, store, fetchImpl = fetch) {
  const secure = config.publicOrigin.startsWith("https://");
  const publicDir = path.resolve(config.publicDir);

  function getAuth(req) {
    const cookies = parseCookies(req.headers.cookie);
    const session = verifySession(cookies.riddle_session, config.sessionSecret);
    if (!session) return null;
    const allowed = store.authorize(session.codeHash, session.deviceId, Date.now());
    return allowed.ok ? { ...session, expiresAt: allowed.expiresAt } : null;
  }

  return async (req, res) => {
    try {
      const url = new URL(req.url, "http://local");
      if (req.method === "POST" && url.pathname === "/api/auth/login") {
        const { code } = await readJson(req);
        if (typeof code !== "string" || code.trim().length < 4) return sendJson(res, 400, { error: "请输入有效体验码" });
        const cookies = parseCookies(req.headers.cookie);
        const deviceId = cookies.riddle_device || randomDeviceId();
        const codeHash = hashCode(code, config.sessionSecret);
        const result = store.login(codeHash, deviceId, Date.now(), config.sessionDays, config.maxDevices);
        const messages = { INVALID_CODE: "体验码无效", EXPIRED_CODE: "体验码已过期", DEVICE_LIMIT: "该体验码已在两台设备激活" };
        if (!result.ok) return sendJson(res, 401, { error: messages[result.reason] || "验证失败", reason: result.reason });
        const maxAge = Math.max(1, Math.floor((result.expiresAt - Date.now()) / 1000));
        const token = signSession({ codeHash, deviceId, exp: result.expiresAt }, config.sessionSecret);
        return sendJson(res, 200, { ok: true, expiresAt: result.expiresAt }, { "Set-Cookie": [cookie("riddle_device", deviceId, { maxAge: 31536000, secure }), cookie("riddle_session", token, { maxAge, secure })] });
      }

      if (req.method === "GET" && url.pathname === "/api/auth/session") {
        const auth = getAuth(req);
        return auth ? sendJson(res, 200, { authenticated: true, expiresAt: auth.expiresAt }) : sendJson(res, 401, { authenticated: false });
      }

      if (req.method === "POST" && url.pathname === "/api/chat") {
        const auth = getAuth(req);
        if (!auth) return sendJson(res, 401, { error: "登录已失效，请重新输入体验码" });
        const body = await readJson(req);
        if (typeof body.image !== "string" || !body.image.startsWith("data:image/png;base64,")) return sendJson(res, 400, { error: "缺少手写图片" });
        if (body.image.length > 7_500_000) return sendJson(res, 413, { error: "手写图片过大" });
        const consumed = store.consume(auth.codeHash, Date.now(), config.codeDailyCap, config.globalDailyCap);
        if (!consumed.ok) return sendJson(res, 503, { error: "今日服务繁忙，请稍后再试" });
        const upstream = await fetchImpl(config.kimiApiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${config.kimiApiKey}` },
          body: JSON.stringify({
            model: config.kimiModel,
            stream: true,
            max_tokens: 300,
            messages: [
              { role: "system", content: config.systemPrompt + "\nDetect the handwriting language and reply only in that same language." },
              { role: "user", content: [
                { type: "text", text: "Read the handwriting and respond briefly. English handwriting requires English only; Chinese handwriting requires Chinese only." },
                { type: "image_url", image_url: { url: body.image } }
              ] }
            ]
          })
        });
        if (!upstream.ok) {
          const detail = (await upstream.text()).slice(0, 300);
          console.error("Kimi upstream error", upstream.status, detail);
          return sendJson(res, 502, { error: "日记暂时没有回应，请稍后重试" });
        }
        res.writeHead(200, { "Content-Type": upstream.headers.get("content-type") || "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" });
        for await (const chunk of upstream.body) res.write(chunk);
        return res.end();
      }

      if (req.method !== "GET" && req.method !== "HEAD") return sendJson(res, 405, { error: "Method not allowed" });
      const relative = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1));
      const file = path.resolve(publicDir, relative);
      if (!file.startsWith(publicDir + path.sep) && file !== path.join(publicDir, "index.html")) return sendJson(res, 403, { error: "Forbidden" });
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return sendJson(res, 404, { error: "Not found" });
      res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream", "Cache-Control": path.extname(file) === ".html" ? "no-cache" : "public, max-age=3600" });
      if (req.method === "HEAD") return res.end();
      fs.createReadStream(file).pipe(res);
    } catch (error) {
      console.error(error);
      if (!res.headersSent) sendJson(res, error.status || 500, { error: error.status ? error.message : "服务暂时不可用" });
      else res.end();
    }
  };
}
