import fs from "node:fs";
import path from "node:path";

export class CodeStore {
  constructor(filePath) {
    this.filePath = filePath;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    if (!fs.existsSync(filePath)) this.#write({ version: 1, codes: {}, daily: {} });
  }

  #read() {
    return JSON.parse(fs.readFileSync(this.filePath, "utf8"));
  }

  #write(data) {
    const tmp = `${this.filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
    fs.renameSync(tmp, this.filePath);
  }

  addCodes(items) {
    const db = this.#read();
    for (const item of items) {
      if (db.codes[item.hash]) throw new Error("Duplicate code hash");
      db.codes[item.hash] = {
        label: item.label || "",
        channel: item.channel || "manual",
        createdAt: item.createdAt,
        activatedAt: null,
        expiresAt: null,
        disabled: false,
        devices: [],
        totalRequests: 0
      };
    }
    this.#write(db);
  }

  login(codeHash, deviceId, now, sessionDays, maxDevices) {
    const db = this.#read();
    const record = db.codes[codeHash];
    if (!record || record.disabled) return { ok: false, reason: "INVALID_CODE" };
    if (record.expiresAt && now >= record.expiresAt) return { ok: false, reason: "EXPIRED_CODE" };
    if (!record.activatedAt) {
      record.activatedAt = now;
      record.expiresAt = now + sessionDays * 86400000;
    }
    if (!record.devices.includes(deviceId)) {
      if (record.devices.length >= maxDevices) return { ok: false, reason: "DEVICE_LIMIT" };
      record.devices.push(deviceId);
    }
    this.#write(db);
    return { ok: true, expiresAt: record.expiresAt };
  }

  authorize(codeHash, deviceId, now) {
    const db = this.#read();
    const record = db.codes[codeHash];
    if (!record || record.disabled) return { ok: false, reason: "INVALID_CODE" };
    if (!record.expiresAt || now >= record.expiresAt) return { ok: false, reason: "EXPIRED_CODE" };
    if (!record.devices.includes(deviceId)) return { ok: false, reason: "DEVICE_NOT_BOUND" };
    return { ok: true, expiresAt: record.expiresAt };
  }

  consume(codeHash, now, codeCap, globalCap) {
    const db = this.#read();
    const day = new Date(now).toISOString().slice(0, 10);
    db.daily[day] ||= { global: 0, codes: {} };
    const daily = db.daily[day];
    const used = daily.codes[codeHash] || 0;
    if (used >= codeCap || daily.global >= globalCap) return { ok: false, reason: "SAFETY_CAP" };
    daily.codes[codeHash] = used + 1;
    daily.global += 1;
    db.codes[codeHash].totalRequests = (db.codes[codeHash].totalRequests || 0) + 1;
    this.#write(db);
    return { ok: true };
  }
}
