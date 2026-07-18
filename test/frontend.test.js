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

test("each request carries the previous diary reply to prevent exact repetition", () => {
  assert.match(html, /let lastAiResponse = "";/);
  assert.match(html, /streamChat\(img, lastAiResponse,/);
  assert.match(html, /JSON\.stringify\(\{ image: dataUrl, previousResponse \}\)/);
  assert.match(html, /lastAiResponse = block\.text\.trim\(\)/);
});

test("background response animation yields the canvas while the Pencil is active", () => {
  assert.match(html, /if \(!writingSession && \(baseDirty \|\| animating\)\)/);
});

test("recognition starts sooner and uploads only the handwriting region", () => {
  assert.match(html, /idle: 2\.0/);
  assert.match(html, /const IDLE_MS = \(\) => DEFAULTS\.idle \* 1000/);
  const start = html.indexOf("function capturePNG()");
  const end = html.indexOf("function layoutResponse", start);
  const capture = html.slice(start, end);
  assert.match(capture, /const box = boundingBox\(\)/);
  assert.match(capture, /const cropW = Math\.max\(1, right - left\)/);
  assert.match(capture, /o\.translate\(-left, -top\)/);
  assert.doesNotMatch(capture, /maxW \/ W/);
});

test("lifting the Pencil does not repaint every previous Chinese stroke", () => {
  const start = html.indexOf("function endStroke(e)");
  const end = html.indexOf('live.addEventListener("pointerup"', start);
  const endStroke = html.slice(start, end);
  assert.match(endStroke, /drawStroke\(active, performance\.now\(\)\)/);
  assert.doesNotMatch(endStroke, /baseDirty = true/);
});

test("long strokes filter dense samples and pen lifts clear only their local bounds", () => {
  assert.match(html, /const MIN_POINT_DISTANCE = 1\.5/);
  assert.match(html, /function appendPoint\(stroke, e\)/);
  assert.match(html, /distanceSq < MIN_POINT_DISTANCE \* MIN_POINT_DISTANCE/);
  assert.match(html, /const coalesced = e\.getCoalescedEvents \? e\.getCoalescedEvents\(\) : \[\]/);
  assert.match(html, /function clearLiveStroke\(stroke\)/);
  const start = html.indexOf("function endStroke(e)");
  const end = html.indexOf('live.addEventListener("pointerup"', start);
  const endStroke = html.slice(start, end);
  assert.match(endStroke, /clearLiveStroke\(active\)/);
  assert.doesNotMatch(endStroke, /lctx\.clearRect\(0, 0, W, H\)/);
});

test("background animation stays frozen between every stroke of a Chinese character", () => {
  assert.match(html, /const writingSession = Boolean\(active\) \|\| strokes\.some\(s => !s\.committed\)/);
  assert.match(html, /const animating = !writingSession && \(fading \|\| aiBlocks\.length > 0\)/);
  assert.match(html, /if \(!writingSession && \(baseDirty \|\| animating\)\)/);
});
