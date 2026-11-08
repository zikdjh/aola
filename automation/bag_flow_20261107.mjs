// bag_flow_20261107.mjs — Round 64: CDP 驱动登录流程（进入游戏 → 快速开始 → 世界装配）
// 前置: bag_monitor 已附着并注入观察器; chrome 已开着 /game 登录页
// 用法: node automation/bag_flow_20261107.mjs <stage>
//   login  : 点「进入游戏」(484,526) — 登录页出现后
//   quick  : 点「快速开始游戏」(472,513) — 选服页出现后
//   bag    : 点「亚比背包」(925,525) — 世界装配完成后
//   shot   : 截图看当前画面
import fs from "node:fs";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const res = await fetch("http://127.0.0.1:9223/json/list");
const targets = await res.json();
const page = targets.find((t) => t.type === "page" && t.url.includes("/game"));
if (!page) { console.error("no /game target"); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res2, rej2) => { ws.onopen = res2; ws.onerror = rej2; });
let seq = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
};
const call = (method, params = {}) => new Promise((res2) => {
  const id = ++seq;
  pending.set(id, res2);
  ws.send(JSON.stringify({ id, method, params }));
});
const evalp = async (expr) => {
  const r = await call("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error("page error: " + JSON.stringify(r.result.exceptionDetails.exception?.description || "").slice(0, 200));
  return r.result?.result?.value;
};
const stage = process.argv[2] || "shot";
const OUT = "D:/temp/ZCode/scratch/bag_mon_20261107";

if (stage === "shot") {
  const shot = await call("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(`${OUT}/flow_shot.png`, Buffer.from(shot.result.data, "base64"));
  const rect = await evalp(`(() => { const s = document.getElementById("stage"); return s ? JSON.stringify(s.getBoundingClientRect().toJSON()) : "no-stage"; })()`);
  console.log("stage rect:", rect);
  console.log("shot ->", `${OUT}/flow_shot.png`);
  process.exit(0);
}

// 通用: stage 坐标点击
const steps = {
  login: [484, 526],
  quick: [472, 513],
  bag: [925, 525],
};
const [sx, sy] = steps[stage] || steps.login;
const rect = JSON.parse(await evalp(`JSON.stringify(document.getElementById("stage").getBoundingClientRect().toJSON())`));
const x = Math.round(rect.x + (sx / 960) * rect.width), y = Math.round(rect.y + (sy / 560) * rect.height);
await call("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
await call("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
console.log(`[${stage}] clicked stage(${sx},${sy}) -> page(${x},${y})`);
if (stage === "bag") {
  await sleep(12000);
  const shot = await call("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(`${OUT}/flow_bag_open.png`, Buffer.from(shot.result.data, "base64"));
  console.log("bag shot saved");
}
process.exit(0);
