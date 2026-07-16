import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");

test("hosted frontend uses server auth and never asks consumers for API credentials", () => {
  assert.match(html, /fetch\("\/api\/chat"/);
  assert.match(html, /\/api\/auth\/login/);
  assert.doesNotMatch(html, /id="f-key"/);
  assert.doesNotMatch(html, /id="f-url"/);
  assert.doesNotMatch(html, /if \(!cfg\.key\)/);
  assert.doesNotMatch(html, /API Key/i);
});
