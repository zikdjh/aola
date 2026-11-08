// switch_measure.mjs — 切宠并测量: 记录切宠前后 8s 的 LoAF 明细
// 用法: node scratch/switch_measure.mjs <fx> <fy>   (stage 归一化坐标, 默认 371/960, 600/560)
import { appendFileSync } from "node:fs";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fx = Number(process.argv[2] ?? 371 / 960);
const fy = Number(process.argv[3] ?? 600 / 560);

const targets = await fetch("http://127.0.0.1:9223/json/list").then((r) => r.json());
const page = targets.find((t) => t.url.includes("/game"));
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
const evalp = async (expr) => {
  const r = await call("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(String(r.result.exceptionDetails.exception?.description || "").slice(0, 200));
  return r.result?.result?.value;
};

const rect = JSON.parse(await evalp(`JSON.stringify(document.getElementById("stage").getBoundingClientRect().toJSON())`));
const x = Math.round(rect.x + fx * rect.width);
const y = Math.round(rect.y + fy * rect.height);

// 切宠前基线
const base = JSON.parse(await evalp(`(() => { const M = window.__MON; return JSON.stringify({ loaf: M.loaf, loafB: M.loafB ?? Math.round(M.loafBlock), lt: M.lt, t: Math.round(performance.now() - M.t0) }); })()`));
console.log("baseline:", JSON.stringify(base), "click at", x, y);

await call("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
await call("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
const tClick = Date.now();

await sleep(9000);

const after = JSON.parse(await evalp(`(() => {
  const M = window.__MON;
  const fresh = M.loafRecent.filter(r => r.t > ${base.t});
  const spikes = (M.loafScripts || []).slice(-12);
  return JSON.stringify({
    loaf: M.loaf, loafB: Math.round(M.loafBlock), loafS: Math.round(M.loafScriptTotal),
    loafSL: Math.round(M.loafStyleTotal), lt: M.lt, fps: M.fps, vis: M.vis,
    freshCount: fresh.length,
    fresh: fresh.slice().sort((a,b)=>b.b-a.b).slice(0,6),
    spikes
  });
})()`));

const dLoaf = after.loaf - base.loaf;
const dB = after.loafB - (base.loafB ?? 0);
const dS = after.loafS - 0;
console.log("\n=== 切宠后 9s 汇总 ===");
console.log(`新增 LoAF 长帧: ${dLoaf}  新增阻塞: ${dB}ms  fps: ${after.fps}  vis: ${after.vis}`);
console.log(`累计脚本耗时: ${after.loafS}ms  累计样式布局: ${after.loafSL}ms`);
console.log("\n最重的 6 个新长帧:");
for (const f of after.fresh) {
  console.log(`  b=${f.b}ms d=${f.d} script=${f.st} style=${f.sl} @t=${f.t} names=${JSON.stringify(f.names)}`);
}
console.log("\n最近长帧的脚本归因:");
for (const s of after.spikes.slice(-6)) {
  console.log(`  b=${s.rec.b}ms @${s.at}`);
  for (const sc of s.scripts.slice(0, 6)) console.log(`     ${sc.name} d=${sc.d} pause=${sc.pause} forced=${sc.forced}`);
}
appendFileSync("D:/temp/ZCode/scratch/bag_mon_20261107/switch_events.jsonl",
  JSON.stringify({ at: new Date(tClick).toISOString(), click: [x, y], base, after }) + "\n");
process.exit(0);
