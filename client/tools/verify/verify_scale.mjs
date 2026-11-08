// verify_scale.mjs — 验证「画布像素固定 960×560 + 1.3 倍等比显示」
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
const OUT = "D:/temp/ZCode/scratch/scale_check";
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getTarget(urlPart = "/game") {
  for (let i = 0; i < 40; i++) {
    try {
      const list = await fetch("http://127.0.0.1:9223/json/list").then((r) => r.json());
      const p = list.find((t) => t.type === "page" && t.url.includes(urlPart));
      if (p) return p;
    } catch {}
    await sleep(1000);
  }
  throw new Error("找不到 /game target");
}

const page = await getTarget();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let seq = 0;
const pend = new Map();
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
const call = (method, params = {}) => new Promise((r) => { const id = ++seq; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const evalp = async (expr) => {
  const r = await call("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(String(r.exceptionDetails.exception?.description || "").slice(0, 300));
  return r.result?.result?.value;
};

await call("Emulation.setFocusEmulationEnabled", { enabled: true });
await sleep(1500);

const info = JSON.parse(await evalp(`(() => {
  const p = document.querySelector("ruffle-player");
  const cv = p && p.shadowRoot && p.shadowRoot.querySelector("canvas");
  const st = document.getElementById("stage");
  const fit = document.getElementById("fit");
  const sr = st ? st.getBoundingClientRect() : null;
  const fr = fit ? fit.getBoundingClientRect() : null;
  return JSON.stringify({
    url: location.href,
    canvas: cv ? { w: cv.width, h: cv.height, cssW: Math.round(cv.getBoundingClientRect().width), cssH: Math.round(cv.getBoundingClientRect().height) } : null,
    stageLayout: sr ? { w: Math.round(sr.width), h: Math.round(sr.height), x: Math.round(sr.x), y: Math.round(sr.y) } : null,
    fitBox: fr ? { w: Math.round(fr.width), h: Math.round(fr.height) } : null,
    fitK: window.__FIT_K,
    transform: st ? st.style.transform : null,
    dpr: window.devicePixelRatio,
    inner: { w: window.innerWidth, h: window.innerHeight }
  });
})()`));

console.log("页面:", info.url);
console.log("窗口内区:", JSON.stringify(info.inner), " DPR:", info.dpr);
console.log("canvas 后备缓冲:", info.canvas ? `${info.canvas.w} x ${info.canvas.h}` : "无");
console.log("canvas 显示尺寸 :", info.canvas ? `${info.canvas.cssW} x ${info.canvas.cssH}` : "-");
console.log("#fit 占位尺寸   :", info.fitBox ? `${info.fitBox.w} x ${info.fitBox.h}` : "-");
console.log("#stage transform:", info.transform, " k =", info.fitK);

const cvW = info.canvas?.w, cvH = info.canvas?.h;
const dispW = info.canvas?.cssW, dispH = info.canvas?.cssH;
const okPixels = cvW === 960 && cvH === 560;
const okScale = Math.abs(dispW / 960 - 1.3) < 0.02 && Math.abs(dispH / 560 - 1.3) < 0.02;

console.log("");
console.log(`像素固定 960×560 : ${okPixels ? "✅" : "❌ 实际 " + cvW + "x" + cvH}`);
console.log(`显示 1.3 倍      : ${okScale ? "✅" : "❌ 实际 " + (dispW / 960).toFixed(3) + "x"}`);
console.log(`像素总量         : ${(cvW * cvH / 1e3).toFixed(0)}K px（旧 1152×672 = 774K px）`);
writeFileSync(`${OUT}/info.json`, JSON.stringify(info, null, 2));
process.exit(okPixels && okScale ? 0 : 1);
