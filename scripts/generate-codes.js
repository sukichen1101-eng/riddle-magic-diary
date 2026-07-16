import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { CodeStore } from "../src/store.js";
import { hashCode } from "../src/auth.js";

const count = Math.max(1, Math.min(10000, Number(process.argv[2] || 100)));
const channel = process.argv[3] || "launch";
const secret = process.env.SESSION_SECRET;
if (!secret || secret.length < 32) throw new Error("Set SESSION_SECRET (same value as production) before generating codes");
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\//, "")), "..");
const store = new CodeStore(process.env.CODES_FILE || path.join(root, "data", "codes.json"));
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const makeCode = () => Array.from(crypto.randomBytes(10), (byte) => alphabet[byte % alphabet.length]).join("").match(/.{1,5}/g).join("-");
const codes = Array.from({ length: count }, makeCode);
store.addCodes(codes.map((code, index) => ({ hash: hashCode(code, secret), label: `${channel}-${String(index + 1).padStart(3, "0")}`, channel, createdAt: Date.now() })));
const exportFile = path.join(root, `codes-${channel}-${new Date().toISOString().slice(0, 10)}.csv`);
fs.writeFileSync(exportFile, `label,code,channel\n${codes.map((code, index) => `${channel}-${String(index + 1).padStart(3, "0")},${code},${channel}`).join("\n")}\n`, "utf8");
console.log(`Generated ${count} codes. Keep this file private: ${exportFile}`);
