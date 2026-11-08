// bag_monitor_20261107.mjs — Round 64: 背包卡顿全量监听（整合包浏览器, CDP）
// 用法: node automation/bag_monitor_20261107.mjs
//   1. 启动整合包浏览器（带 --remote-debugging-port=9223, 其余参数与启动器一致）
//   2. 自动打开 /game, 等世界装配完成后注入「全程观察器」:
//      LoAF(含 script 归因) + longtask + RAF fps + resource, 每秒聚合
//   3. 日志每 2s 落盘 D:/temp/ZCode/scratch/bag_mon_20261107/live.jsonl（JSON Lines, 一行一秒）
//   4. 每 30s 落一张截图, 用户操作 / 卡顿尖峰自动对应到时间戳, 网关日志可对齐
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync, appendFileSync, existsSync } from "node:fs";

const PACK = "D:/temp/ZCode/aola/dist/aola-launcher-pack/AolaStarLauncher";
const CHROME = `${PACK}/runtime/browser/chrome.exe`;
const PROFILE = `${PACK}/profile`;
const URL_GAME = "http://127.0.0.1:8700/game";
const DEBUG_PORT = 9223;
const OUT_DIR = "D:/temp/ZCode/scratch/bag_mon_20261107";
mkdirSync(OUT_DIR, { recursive: true });
const LOG = `${OUT_DIR}/live.jsonl`;
const SHOT_DIR = `${OUT_DIR}/shots`;
mkdirSync(SHOT_DIR, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ts = () => new Date().toISOString();

// ---------- 1. 启动整合包浏览器（与 launcher_new_utf8.cmd 相同参数 + 调试端口） ----------
if (!existsSync(CHROME)) { console.error("chrome not found: " + CHROME); process.exit(1); }
const chrome = spawn(CHROME, [
  `--app=${URL_GAME}`,
  `--user-data-dir=${PROFILE}`,
  "--no-first-run", "--no-default-browser-check",
  "--disable-features=CalculateNativeWindowOcclusion",
  "--window-size=1224,816",
  "--no-sandbox",
  "--mute-audio",
  `--remote-debugging-port=${DEBUG_PORT}`,
], { detached: true, stdio: "ignore" });
chrome.unref();
console.log(`[${ts()}] [1] 整合包浏览器已启动 pid=${chrome.pid} cdp=9223`);

// ---------- 2. CDP 客户端 ----------
async function getGameTarget() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
      const targets = await res.json();
      const game = targets.find((t) => t.type === "page" && t.url.includes("/game"));
      if (game) return game;
    } catch {}
    await sleep(1000);
  }
  throw new Error("游戏页面 target 未出现");
}
const target = await getGameTarget();
console.log(`[${ts()}] [2] 已附着 target: ${target.title} | ${target.url.slice(0, 60)}`);
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let seq = 0;
const pending = new Map();
const events = [];
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  else if (msg.method) events.push(msg);
};
const cdp = (method, params = {}) => new Promise((res, rej) => {
  const id = ++seq;
  pending.set(id, (m) => (m.error ? rej(new Error(method + ": " + m.error.message)) : res(m.result)));
  ws.send(JSON.stringify({ id, method, params }));
});
const evalp = async (expr) => {
  const r = await cdp("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error("page: " + JSON.stringify(r.exceptionDetails.exception?.description || "").slice(0, 300));
  return r.result?.value;
};

// ---------- 3. 注入全程观察器（LoAF 归因 + longtask + RAF + resource） ----------
// 返回值写 window.__MON, 采样器每秒读一次聚合快照
await evalp(`(() => {
  if (window.__MON) return "already";
  const M = window.__MON = {
    t0: performance.now(),
    loaf: 0, loafBlock: 0, loafScriptTotal: 0,
    loafWorst: null, loafScripts: [], loafRecent: [],
    lt: 0, ltBlock: 0, ltWorst: null,
    raf: 0, rafWin: [], fps: 0, vis: document.visibilityState,
    res: 0, resRecent: [],
    spike: null
  };
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) {
      const b = e.blockingDuration || 0;
      M.loaf++; M.loafBlock += b;
      const st = (e.scripts || []).reduce((s, x) => s + (x.duration || 0), 0);
      M.loafScriptTotal += st;
      const rec = { t: Math.round(e.startTime), d: Math.round(e.duration), b: Math.round(b),
                    st: Math.round(st), style: Math.round((e.styleAndLayoutStart||0)-(e.startTime||0)),
                    names: [...new Set((e.scripts||[]).map(x=>(x.invokerType||'?')+':'+(x.invoker||'')))].slice(0,4) };
      M.loafRecent.push(rec); if (M.loafRecent.length > 40) M.loafRecent.shift();
      if (!M.loafWorst || b > M.loafWorst.b) M.loafWorst = rec;
      if (b > 300 && (!M.spike || performance.now() - M.spike.at > 5000)) {
        M.spike = { at: performance.now(), rec };
        M.loafScripts.push({ at: new Date().toISOString(), rec, scripts: (e.scripts||[]).map(x=>({
            name: (x.invokerType||'?')+':'+(x.invoker||''), d: Math.round(x.duration||0),
            st: Math.round(x.startTime - M.t0), pf: x.pauseDuration|0, fc: x.forcedStyleAndLayoutDuration|0 })) });
        if (M.loafScripts.length > 60) M.loafScripts.shift();
      }
    }}).observe({ type: "long-animation-frame", buffered: true });
  } catch (err) { M.loafErr = String(err); }
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) {
      M.lt++; M.ltBlock += e.blockingTime || 0;
      if (!M.ltWorst || e.duration > M.ltWorst.d) M.ltWorst = { t: Math.round(e.startTime), d: Math.round(e.duration) };
    }}).observe({ type: "longtask", buffered: true });
  } catch (err) {}
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) {
      M.res++;
      if ((e.decodedBodySize||0) > 20000 || (e.transferSize||0) > 20000)
        M.resRecent.push({ t: Math.round(e.startTime), n: e.name.split('/').slice(-2).join('/'), dur: Math.round(e.duration), dec: e.decodedBodySize|0 });
      if (M.resRecent.length > 60) M.resRecent.shift();
    }}).observe({ type: "resource", buffered: true });
  } catch (err) {}
  const tick = () => { M.raf++; if (performance.now() - M.t0 < 86400000) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  setInterval(() => {
    const now = performance.now();
    M.rafWin.push(M.raf); if (M.rafWin.length > 4) M.rafWin.shift();
    M.fps = M.rafWin.length >= 2 ? Math.round((M.rafWin[M.rafWin.length-1] - M.rafWin[0]) / ((M.rafWin.length-1)) * 10) / 10 : 0;
    M.vis = document.visibilityState;
  }, 1000);
  return "ok";
})()`);
console.log(`[${ts()}] [3] 观察器已注入（LoAF归因/longtask/RAF/resource）`);

// ---------- 4. 等世界装配（轮询 /status 服务计数 + 页面状态） ----------
let worldReady = false;
for (let i = 0; i < 240; i++) {
  await sleep(5000);
  let st = null;
  try { st = await fetch("http://127.0.0.1:8700/status").then(r => r.json()); } catch {}
  const snap = await evalp(`(() => { const M = window.__MON; return JSON.stringify({ fps: M.fps, vis: M.vis, lt: M.lt, loaf: M.loaf, spike: M.spike && M.spike.rec }); })()`).catch(() => null);
  let p = {}; try { p = JSON.parse(snap); } catch {}
  const svc = st && st.services !== undefined ? st.services : (st && st.world ? st.world.services : null);
  console.log(`[${ts()}] [wait] fps=${p.fps} vis=${p.vis} lt=${p.lt} loaf=${p.loaf} services=${svc ?? "?"} spike=${p.spike ? p.spike.b + "ms" : "-"}`);
  if (svc && svc >= 57) { worldReady = true; console.log(`[${ts()}] [4] 世界装配完成 (services=${svc}) → 进入正式监听`); break; }
  if (p.spike && p.spike.b > 2000) console.log(`[${ts()}] [!] 装配期尖峰 ${p.spike.b}ms @${p.spike.t}`);
}
if (!worldReady) console.log(`[${ts()}] [4] 等待超时（20min）, 继续保持监听 —— 请手动操作到可玩状态`);

// ---------- 5. 每秒采样落盘 + 每 30s 截图 ----------
let shotI = 0;
let lastLog = "";
for (;;) {
  await sleep(1000);
  let snap = null;
  try {
    snap = JSON.parse(await evalp(`(() => { const M = window.__MON; return JSON.stringify({
      t: Math.round(performance.now() - M.t0), fps: M.fps, vis: M.vis,
      lt: M.lt, ltB: Math.round(M.ltBlock), ltW: M.ltWorst,
      loaf: M.loaf, loafB: Math.round(M.loafBlock), loafS: Math.round(M.loafScriptTotal), loafW: M.loafWorst,
      res: M.res, resRecent: M.resRecent.slice(-6),
      recent: M.loafRecent.slice(-8), spike: M.spike && M.spike.rec
    }); })()`));
  } catch (e) { appendFileSync(LOG, JSON.stringify({ at: ts(), err: String(e).slice(0, 120) }) + "\n"); continue; }
  const line = { at: ts(), ...snap };
  const key = JSON.stringify(snap);
  appendFileSync(LOG, JSON.stringify(line) + "\n");
  if (snap.spike && key !== lastLog) {
    console.log(`[${ts()}] [spike] +${snap.spike.b}ms(block ${snap.spike.b} d=${snap.spike.d} script=${snap.spike.st}) fps=${snap.fps} vis=${snap.vis} res+${snap.res}`);
    lastLog = key;
    if (snap.spike.b > 800) {
      try {
        const shot = await cdp("Page.captureScreenshot", { format: "png" });
        writeFileSync(`${SHOT_DIR}/spike_${String(++shotI).padStart(3, "0")}_${Math.round(snap.spike.b)}ms.png`, Buffer.from(shot.data, "base64"));
      } catch {}
    }
  }
}
