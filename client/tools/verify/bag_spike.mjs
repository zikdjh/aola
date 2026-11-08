// bag_spike.mjs — 测「开背包」触发的 LoAF 长帧（真实游戏路径，脚本耗时 = Ruffle 解码成本）
// 用法: node bag_spike.mjs <label>
import { writeFileSync, mkdirSync } from "node:fs";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = "D:/temp/ZCode/scratch/bag_mon_20261107/spike";
mkdirSync(OUT, { recursive: true });
const label = process.argv[2] || "trial";

const targets = await fetch("http://127.0.0.1:9223/json/list").then((r) => r.json());
const page = targets.find((t) => t.url.includes("/game"));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let seq = 0;
const pending = new Map();
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const call = (method, params = {}) => new Promise((r) => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const evalp = async (expr) => {
  const r = await call("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(String(r.exceptionDetails.exception?.description || "").slice(0, 200));
  return r.result?.result?.value;
};
await call("Emulation.setFocusEmulationEnabled", { enabled: true });

const rect = JSON.parse(await evalp(`JSON.stringify(document.getElementById("stage").getBoundingClientRect().toJSON())`));
const click = async (sx, sy) => {
  const x = Math.round(rect.x + (sx / 960) * rect.width), y = Math.round(rect.y + (sy / 560) * rect.height);
  await call("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await call("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
};

// 记录基线
const snap = () => evalp(`(() => { const M = window.__MON; if (!M) return null;
  return JSON.stringify({ loaf: M.loaf, block: Math.round(M.loafBlock), script: Math.round(M.loafScriptTotal),
    worst: M.loafWorst, res: M.res, t: Math.round(performance.now() - M.t0) }); })()`);

const b0 = JSON.parse(await snap());
console.log(`[${label}] 基线: LoAF=${b0.loaf} 阻塞=${b0.block}ms 脚本=${b0.script}ms`);

// 确保背包是关的（点底栏背包按钮切换）
console.log(`[${label}] 关闭背包（若已开）...`);
await click(925, 525);
await sleep(3500);

const b1 = JSON.parse(await snap());
// 现在开背包并测量
console.log(`[${label}] 打开背包，测量 12s...`);
const tClick = Date.now();
await click(925, 525);
await sleep(12000);
const b2 = JSON.parse(await snap());

const dLoaf = b2.loaf - b1.loaf;
const dBlock = b2.block - b1.block;
const dScript = b2.script - b1.script;
const result = { label, at: new Date(tClick).toISOString(), dLoaf, dBlock, dScript,
  worstFrame: b2.worst, resDelta: b2.res - b1.res };
console.log(`[${label}] 开背包后 12s: 新增 LoAF ${dLoaf} 帧, 阻塞 +${dBlock}ms, 脚本 +${dScript}ms, 资源 +${result.resDelta}`);
if (b2.worst) console.log(`[${label}] 最重帧: d=${b2.worst.d}ms b=${b2.worst.b}ms script=${b2.worst.st}ms names=${JSON.stringify(b2.worst.names)}`);
writeFileSync(`${OUT}/${label}.json`, JSON.stringify(result, null, 2));
process.exit(0);
