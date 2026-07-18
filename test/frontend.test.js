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
  const start = html.indexOf('signaturePad.addEventListener("endStroke"');
  const end = html.indexOf("// ----------", start);
  const endStroke = html.slice(start, end);
  assert.match(endStroke, /ctx\.drawImage\(live, 0, 0, W, H\)/);
  assert.match(endStroke, /signaturePad\.clear\(\)/);
  assert.doesNotMatch(endStroke, /drawStroke\(/);
  assert.doesNotMatch(endStroke, /baseDirty = true/);
});

test("long and short strokes use unthrottled subpixel Bezier sampling", () => {
  assert.match(html, /throttle:\s*0/);
  assert.match(html, /minDistance:\s*0\.5/);
  assert.match(html, /velocityFilterWeight:\s*0\.7/);
});

test("background animation stays frozen between every stroke of a Chinese character", () => {
  assert.match(html, /const writingSession = Boolean\(active\) \|\| strokes\.some\(s => !s\.committed\)/);
  assert.match(html, /const animating = !writingSession && \(fading \|\| aiBlocks\.length > 0\)/);
  assert.match(html, /if \(!writingSession && \(baseDirty \|\| animating\)\)/);
});

test("completed Bezier points remain available for recognition and fading", () => {
  assert.match(html, /const groups = signaturePad\.toData\(\)/);
  assert.match(html, /active\.pts = \(group \? group\.points : \[\]\)\.map/);
  assert.match(html, /strokes\.push\(active\)/);
});

test("the live Pencil layer uses the Signature Pad Bezier engine without frame-delayed drawing", () => {
  assert.match(html, /new SignaturePad\(live,/);
  assert.match(html, /throttle:\s*0/);
  assert.match(html, /minDistance:\s*0\.5/);
  assert.match(html, /velocityFilterWeight:\s*0\.7/);
  assert.doesNotMatch(html, /live\.addEventListener\("pointermove"/);
});
