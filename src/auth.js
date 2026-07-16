import crypto from "node:crypto";

const b64 = (value) => Buffer.from(value).toString("base64url");
const unb64 = (value) => Buffer.from(value, "base64url").toString("utf8");

export function hashCode(code, secret) {
  return crypto.createHmac("sha256", secret).update(code.trim().toUpperCase()).digest("hex");
}

export function signSession(payload, secret) {
  const body = b64(JSON.stringify(payload));
  const sig = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifySession(token, secret, now = Date.now()) {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = crypto.createHmac("sha256", secret).update(body).digest();
  const actual = Buffer.from(sig, "base64url");
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
  try {
    const payload = JSON.parse(unb64(body));
    return payload.exp > now ? payload : null;
  } catch {
    return null;
  }
}

export function randomDeviceId() {
  return crypto.randomBytes(18).toString("base64url");
}

export function parseCookies(header = "") {
  return Object.fromEntries(header.split(";").map((part) => part.trim().split("=")).filter(([key]) => key).map(([key, value = ""]) => [key, decodeURIComponent(value)]));
}

export function cookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, "Path=/", "HttpOnly", "SameSite=Lax"];
  if (options.maxAge) parts.push(`Max-Age=${Math.floor(options.maxAge)}`);
  if (options.secure) parts.push("Secure");
  return parts.join("; ");
}
