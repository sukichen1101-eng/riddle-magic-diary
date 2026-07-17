import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const chineseFont = new URL("../public/fonts/MaShanZheng-Regular.woff2", import.meta.url);

test("hosted frontend uses server auth and never asks consumers for API credentials", () => {
  assert.match(html, /fetch\("\/api\/chat"/);
  assert.match(html, /\/api\/auth\/login/);
  assert.doesNotMatch(html, /id="f-key"/);
  assert.doesNotMatch(html, /id="f-url"/);
  assert.doesNotMatch(html, /if \(!cfg\.key\)/);
  assert.doesNotMatch(html, /API Key/i);
});

test("an empty upstream response leaves processing state instead of freezing input", () => {
  const fallbackStart = html.indexOf("if (!block.inList && !block.fontLoading)");
  const catchStart = html.indexOf("} catch (err)", fallbackStart);
  assert.ok(fallbackStart > 0 && catchStart > fallbackStart);
  const fallback = html.slice(fallbackStart, catchStart);
  assert.match(fallback, /state = STATE\.RESPONDING;/);
  assert.match(fallback, /hideFlash\(\)/);
});

test("Chinese response font is complete and served locally instead of Google font shards", () => {
  assert.equal(fs.existsSync(chineseFont), true);
  assert.match(html, /@font-face[\s\S]*?MaShanZheng-Regular\.woff2/);
  assert.match(html, /C: '"Riddle Ma Shan Zheng"'/);
  assert.doesNotMatch(html, /fonts\.googleapis\.com[^\n]*Ma\+Shan\+Zheng/);
});

test("Apple Pencil sampling does not force layout reads for every coalesced point", () => {
  const start = html.indexOf("function pointFrom(e)");
  const end = html.indexOf("function acceptable(e)", start);
  assert.ok(start > 0 && end > start);
  assert.doesNotMatch(html.slice(start, end), /getBoundingClientRect/);
});
