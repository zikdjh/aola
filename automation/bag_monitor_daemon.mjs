// bag_monitor_daemon.mjs — Round 64 守护版监听: 页面重载自动重附, 观察器丢失自动重注入
// 日志: scratch/bag_mon_20261107/live2.jsonl (每秒一行) + 控制台尖峰
import { writeFileSync, mkdirSync, appendFileSync } from "node:fs";
const OUT_DIR = "D:/temp/ZCode/scratch/bag_mon_20261107";
mkdirSync(`${OUT_DIR}/shots`, { recursive: true });
const LOG = `${OUT_DIR}/live2.jsonl`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ts = () => new Date().toISOString();
const log = (...a) => console.log(`[${ts()}]`, ...a);

const INJECT = `(() => {
  if (window.__MON) return "already";
  const M = window.__MON = {
    t0: performance.now(),
    loaf: 0, loafBlock: 0, loafScriptTotal: 0, loafStyleTotal: 0,
    loafWorst: null, loafScripts: [], loafRecent: [],
    lt: 0, ltBlock: 0, ltWorst: null,
    res: 0, resRecent: [], resSlow: [],
    spike: null, vis: document.visibilityState
  };
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) {
      const b = e.blockingDuration || 0;
      M.loaf++; M.loafBlock += b;
      const st = (e.scripts || []).reduce((s, x) => s + (x.duration || 0), 0);
      const sl = e.styleAndLayoutStart ? Math.max(0, e.startTime + e.duration - e.styleAndLayoutStart) : 0;
      M.loafScriptTotal += st; M.loafStyleTotal += sl;
      const rec = { t: Math.round(e.startTime), d: Math.round(e.duration), b: Math.round(b),
        st: Math.round(st), sl: Math.round(sl),
        names: [...new Set((e.scripts||[]).map(x=>(x.invokerType||'?')+':'+(x.invoker||'')))].slice(0,4) };
      M.loafRecent.push(rec); if (M.loafRecent.length > 60) M.loafRecent.shift();
      if (!M.loafWorst || b > M.loafWorst.b) M.loafWorst = rec;
      if (b > 250 && (!M.spike || performance.now() - M.spike.at > 3000)) {
        M.spike = { at: performance.now(), rec };
        M.loafScripts.push({ at: new Date().toISOString(), rec,
          scripts: (e.scripts||[]).map(x=>({ name: (x.invokerType||'?')+':'+(x.invoker||''),
            d: Math.round(x.duration||0), st: Math.round(x.startTime - M.t0),
            pause: Math.round(x.pauseDuration||0), forced: Math.round(x.forcedStyleAndLayoutDuration||0) })) });
        if (M.loafScripts.length > 120) M.loafScripts.shift();
      }
    }}).observe({ type: "long-animation-frame", buffered: true });
  } catch (e) { M.loafErr = String(e); }
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) {
      M.lt++; M.ltBlock += e.blockingTime || 0;
      if (!M.ltWorst || e.duration > M.ltWorst.d) M.ltWorst = { t: Math.round(e.startTime), d: Math.round(e.duration) };
    }}).observe({ type: "longtask", buffered: true });
  } catch (e) {}
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) {
      M.res++;
      const dec = e.decodedBodySize|0, dur = Math.round(e.duration);
      const rec = { t: Math.round(e.startTime), n: e.name.split('/').slice(-2).join('/'), dur, dec };
      if (dec > 15000) { M.resRecent.push(rec); if (M.resRecent.length > 60) M.resRecent.shift(); }
      if (dur > 150) { M.resSlow.push(rec); if (M.resSlow.length > 60) M.resSlow.shift(); }
    }}).observe({ type: "resource", buffered: true });
  } catch (e) {}
  // fps: 每 2 秒按帧数换算, 独立计数器
  let frames = 0;
  const tick = () => { frames++; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  M.fps = 0;
  setInterval(() => { M.fps = Math.round(frames / 2 * 10) / 10; frames = 0; M.vis = document.visibilityState; }, 2000);
  return "ok";
})()`;

const SNAP = `(() => { const M = window.__MON; if (!M) return null; return JSON.stringify({
  t: Math.round(performance.now() - M.t0), fps: M.fps, vis: M.vis,
  lt: M.lt, ltB: Math.round(M.ltBlock), ltW: M.ltWorst,
  loaf: M.loaf, loafB: Math.round(M.loafBlock),
  loafS: Math.round(M.loafScriptTotal), loafSL: Math.round(M.loafStyleTotal),
  loafW: M.loafWorst, res: M.res,
  resSlow: M.resSlow.slice(-3), recent: M.loafRecent.slice(-6),
  spike: M.spike && M.spike.rec
}); })()`;

let ws = null, seq = 0, pending = new Map();
const cdp = (method, params = {}) => new Promise((res, rej) => {
  const id = ++seq;
  pending.set(id, (m) => (m.error ? rej(new Error(method + ": " + m.error.message)) : res(m.result)));
  ws.send(JSON.stringify({ id, method, params }));
});
const evalp = async (expr) => {
  const r = await cdp("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error("page: " + String(r.exceptionDetails.exception?.description || "").slice(0, 120));
  return r.result?.value;
};

async function attach() {
  for (;;) {
    try {
      const targets = await fetch("http://127.0.0.1:9223/json/list").then((r) => r.json());
      const page = targets.find((t) => t.type === "page" && t.url.includes("/game"));
      if (!page) throw new Error("no /game target");
      ws = new WebSocket(page.webSocketDebuggerUrl);
      await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
      };
      seq = 0; pending.clear();
      const r = await evalp(INJECT);
      log(`[attach] ok (${r}) target="${page.title}"`);
      return;
    } catch (e) { log(`[attach] retry: ${String(e).slice(0, 80)}`); await sleep(3000); }
  }
}
await attach();

let shotN = 0, lastSpikeAt = -1;
for (;;) {
  await sleep(1000);
  try {
    const raw = await evalp(SNAP);
    if (raw == null) { log("[warn] __MON missing -> re-inject"); await attach(); continue; }
    const snap = JSON.parse(raw);
    appendFileSync(LOG, JSON.stringify({ at: ts(), ...snap }) + "\n");
    if (snap.spike && snap.spike.t !== lastSpikeAt) {
      lastSpikeAt = snap.spike.t;
      log(`[spike] b=${snap.spike.b} d=${snap.spike.d} script=${snap.spike.st} style=${snap.spike.sl} fps=${snap.fps} vis=${snap.vis} names=${JSON.stringify(snap.spike.names)}`);
      if (snap.spike.b > 500) {
        try {
          const shot = await cdp("Page.captureScreenshot", { format: "png" });
          writeFileSync(`${OUT_DIR}/shots/spike_${String(++shotN).padStart(3, "0")}_${snap.spike.b}ms.png`, Buffer.from(shot.result.data, "base64"));
        } catch {}
      }
    }
  } catch (e) {
    const msg = String(e);
    log("[re-attach] " + msg.slice(0, 90));
    try { ws.close(); } catch {}
    await sleep(2000);
    await attach();
  }
}
