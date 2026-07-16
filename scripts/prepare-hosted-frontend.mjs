import fs from "node:fs";

const file = new URL("../public/index.html", import.meta.url);
let html = fs.readFileSync(file, "utf8");

const css = `
  #gate { position:fixed; inset:0; z-index:100; display:flex; align-items:center; justify-content:center; padding:24px; background:rgba(45,32,20,.46); backdrop-filter:blur(7px); }
  #gate[hidden] { display:none; }
  .gate-card { width:min(390px,100%); padding:30px 25px 24px; border-radius:8px; color:#342519; text-align:center; font-family:-apple-system,system-ui,sans-serif; background:linear-gradient(145deg,#e8d8b4,#cdb789); border:1px solid rgba(76,46,20,.3); box-shadow:0 28px 90px rgba(22,13,7,.55),inset 0 0 45px rgba(93,58,23,.12); }
  .gate-card h1 { margin:0 0 7px; font:700 42px/1 "Tangerine",cursive; }
  .gate-card p { margin:0 0 20px; color:#69513b; font-size:14px; }
  #access-code { text-align:center; letter-spacing:3px; text-transform:uppercase; background:rgba(255,250,236,.7); }
  #gate-error { min-height:20px; margin:8px 0 0; color:#873d31; font-size:13px; }
  #gate-submit { width:100%; margin-top:7px; padding:12px; border:0; border-radius:8px; color:#f4ead5; background:#493421; font-weight:600; }
`;
html = html.replace("</style>", `${css}</style>`);

const gate = `
  <div id="gate">
    <form class="gate-card" id="gate-form">
      <h1>Riddle</h1><p>输入魔法日记体验码</p>
      <input id="access-code" autocomplete="one-time-code" maxlength="24" placeholder="XXXXX-XXXXX" required />
      <div id="gate-error" aria-live="polite"></div>
      <button id="gate-submit" type="submit">开启日记</button>
    </form>
  </div>`;
html = html.replace('<div id="paper"></div>', `<div id="paper"></div>${gate}`);

// Hosted users authenticate with an access code; API credentials stay server-side.
html = html.replace(/^\s*<div id="gear"[^\n]*\n/m, "");
const panelStart = html.indexOf('  <div id="panel">');
const scriptStart = html.indexOf("<script>", panelStart);
if (panelStart < 0 || scriptStart < 0) throw new Error("Could not locate settings panel");
html = html.slice(0, panelStart) + html.slice(scriptStart);
html = html.replace(/^\s*if \(!cfg\.key\)[^\n]*\n/m, "");

html = html.replace('url: "https://api.openai.com/v1/chat/completions",', 'url: "/api/chat",')
  .replace('key: "",', 'key: "hosted",')
  .replace('model: "gpt-4o",', 'model: "hosted",');
// The inherited prototype contains a mojibake-corrupted prompt literal; hosted mode owns this prompt server-side.
html = html.replace(/^    sys:.*$/m, '    sys: "Hosted diary prompt is configured on the server."');

const streamStart = html.indexOf("  async function streamChat(dataUrl, onDelta) {");
const uiStart = html.indexOf("  // ---------- UI ----------", streamStart);
if (streamStart < 0 || uiStart < 0) throw new Error("Could not locate streamChat block");
const streamReplacement = `  async function streamChat(dataUrl, onDelta) {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: dataUrl })
    });
    if (!res.ok) {
      let message = "请求失败";
      try { message = (await res.json()).error || message; } catch (_) {}
      if (res.status === 401) document.getElementById("gate").hidden = false;
      throw new Error(message);
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "", full = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf("\\n")) >= 0) {
        const line = buf.slice(0, idx).trim(); buf = buf.slice(idx + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") return;
        try {
          const parsed = JSON.parse(data);
          const piece = parsed.choices?.[0]?.delta?.content || "";
          if (piece) { full += piece; onDelta(piece, full); }
        } catch (_) {}
      }
    }
  }

`;
html = html.slice(0, streamStart) + streamReplacement + html.slice(uiStart);

const settingsStart = html.indexOf('  const panel = document.getElementById("panel");');
const clearStart = html.indexOf('  document.getElementById("clear").addEventListener', settingsStart);
if (settingsStart < 0 || clearStart < 0) throw new Error("Could not locate settings handlers");
html = html.slice(0, settingsStart) + html.slice(clearStart);

const startup = html.lastIndexOf("  // ");
const closure = html.indexOf("})();", startup);
if (startup < 0 || closure < 0) throw new Error("Could not locate startup block");
const authStartup = `  const gate = document.getElementById("gate");
  const gateForm = document.getElementById("gate-form");
  const gateError = document.getElementById("gate-error");
  const gateSubmit = document.getElementById("gate-submit");
  async function checkSession() {
    try {
      const res = await fetch("/api/auth/session", { cache: "no-store" });
      if (res.ok) { gate.hidden = true; flash("写点什么，停笔片刻，日记会回应你"); setTimeout(hideFlash, 3200); }
    } catch (_) {}
  }
  gateForm.addEventListener("submit", async (event) => {
    event.preventDefault(); gateError.textContent = ""; gateSubmit.disabled = true; gateSubmit.textContent = "正在开启…";
    try {
      const res = await fetch("/api/auth/login", { method:"POST", headers:{ "Content-Type":"application/json" }, body:JSON.stringify({ code:document.getElementById("access-code").value }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "体验码验证失败");
      gate.hidden = true; flash("日记已经苏醒，写点什么吧"); setTimeout(hideFlash, 2600);
    } catch (error) { gateError.textContent = error.message; }
    finally { gateSubmit.disabled = false; gateSubmit.textContent = "开启日记"; }
  });
  checkSession();
`;
html = html.slice(0, startup) + authStartup + html.slice(closure);
fs.writeFileSync(file, html, "utf8");
console.log("Hosted frontend prepared");
