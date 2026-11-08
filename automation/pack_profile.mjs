// pack_profile.mjs — 在整合包浏览器里测量游戏页 RAF + 抓 CPU profile（不登录）
import fs from "node:fs";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getTarget(urlPart) {
  for (let i = 0; i < 20; i++) {
    try {
      const res = await fetch("http://127.0.0.1:9223/json/list");
      const targets = await res.json();
      const page = targets.find((t) => t.type === "page" && t.url.includes(urlPart));
      if (page) return page;
    } catch {}
    await sleep(800);
  }
  throw new Error("target not found: " + urlPart);
}
const page = await getTarget("/status");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let seq = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
};
const call = (method, params = {}) => new Promise((res) => {
  const id = ++seq;
  pending.set(id, res);
  ws.send(JSON.stringify({ id, method, params }));
});
const evalp = async (expr) => (await call("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;

// 导航到游戏页
await call("Page.enable", {});
await call("Page.navigate", { url: "http://127.0.0.1:8700/game" });
await sleep(15000);   // 等登录页完全起播

// RAF 计数（登录页动画期间）
const r1 = await evalp(`(async () => {
  let raf = 0;
  const tick = () => { raf++; if (raf < 100000) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  const t0 = performance.now();
  await new Promise(r => setTimeout(r, 3000));
  return { rafIn3s: raf, fps: +(raf / ((performance.now() - t0) / 1000)).toFixed(1), vis: document.visibilityState };
})()`);
console.log("登录页 RAF:", JSON.stringify(r1));

// CPU profile 5s
await call("Profiler.enable", {});
await call("Profiler.setSamplingInterval", { interval: 250 });
await call("Profiler.start", {});
await sleep(5000);
const prof = await call("Profiler.stop", {});
const cpu = prof.profile ?? prof.result?.profile;
fs.writeFileSync("D:/temp/ZCode/scratch/pack_login.cpuprofile", JSON.stringify(cpu));
// 聚合自时间热点
const self = new Map();
const walk = (node) => {
  if (node.hitCount) self.set(node.callFrame.functionName || "(anonymous)", (self.get(node.callFrame.functionName || "(anonymous)") || 0) + node.hitCount);
  (node.children || []).forEach(walk);
};
walk(cpu.head);
let total = 0;
self.forEach((v) => total += v);
const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14);
console.log("profile 采样 " + total + "，热点：");
for (const [name, hits] of top) console.log("  " + (hits * 100 / total).toFixed(1) + "%  " + name);
process.exit(0);
