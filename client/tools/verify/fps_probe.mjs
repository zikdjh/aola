// fps_probe.mjs — 测当前画布尺寸下的实际帧率（RAF 计数）+ LoAF 长帧
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const list = await fetch("http://127.0.0.1:9223/json/list").then((r) => r.json());
const page = list.find((t) => t.type === "page" && t.url.includes("/game"));
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
await sleep(1000);

const r = JSON.parse(await evalp(`(async () => {
  const p = document.querySelector("ruffle-player");
  const cv = p.shadowRoot.querySelector("canvas");
  let loaf = [];
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) loaf.push({ d: Math.round(e.duration), b: Math.round(e.blockingDuration||0), st: Math.round((e.scripts||[]).reduce((s,x)=>s+(x.duration||0),0)) }); }).observe({ type: "long-animation-frame", buffered: false }); } catch {}
  const t0 = performance.now(); let n = 0; let last = t0; const gaps = [];
  await new Promise(res => { const tick = (ts) => { n++; if (n > 1) gaps.push(ts - last); last = ts;
    if (performance.now() - t0 < 4000) requestAnimationFrame(tick); else res(); }; requestAnimationFrame(tick); });
  const el = performance.now() - t0; gaps.sort((a,b)=>b-a);
  return JSON.stringify({
    canvas: cv.width + "x" + cv.height,
    fps: Math.round(n / (el / 1000) * 10) / 10,
    gapP50: Math.round(gaps[Math.floor(gaps.length/2)] || 0),
    gapMax: Math.round(gaps[0] || 0),
    loafWorst: loaf.sort((a,b)=>b.d-a.d)[0] || null,
    loafCount: loaf.length
  });
})()`));
console.log(JSON.stringify(r, null, 1));
const size = r.canvas;
console.log(`\n画布 ${size} → fps=${r.fps} 帧间隔p50=${r.gapP50}ms 最长=${r.gapMax}ms`);
process.exit(0);
