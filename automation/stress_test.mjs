// stress_test.mjs — 连续操作压测: 多张卡片切换 + 页签, 记录每步耗时
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
  if (r.exceptionDetails) throw new Error(String(r.exceptionDetails.exception?.description || "").slice(0, 150));
  return r.result?.result?.value;
};
const click = async (fx, fy) => {
  const rect = JSON.parse(await evalp(`JSON.stringify(document.getElementById("stage").getBoundingClientRect().toJSON())`));
  const x = Math.round(rect.x + fx * rect.width), y = Math.round(rect.y + fy * rect.height);
  await call("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await call("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
  return [x, y];
};
// 每步: 记录该步期间的最长帧 + LoAF 阻塞
const step = async (label, fx, fy, waitMs = 3500) => {
  const m0 = await evalp(`(() => { const M = window.__MON; return JSON.stringify({
    loaf: M.loaf, block: Math.round(M.loafBlock), script: Math.round(M.loafScriptTotal),
    worst: M.loafWorst && M.loafWorst.b, t: Math.round(performance.now() - M.t0) }); })()`);
  const before = JSON.parse(m0);
  const at = await click(fx, fy);
  await sleep(waitMs);
  const m1 = await evalp(`(() => { const M = window.__MON; const recent = M.loafRecent.filter(r => r.t > ${before.t});
    return JSON.stringify({ loaf: M.loaf, block: Math.round(M.loafBlock), script: Math.round(M.loafScriptTotal),
      worst: M.loafWorst && M.loafWorst.b, fps: M.fps,
      recentWorst: recent.slice().sort((a,b)=>b.d-a.d).slice(0,3).map(r=>({d:r.d,b:r.b,st:r.st,n:r.names})) }); })()`);
  const after = JSON.parse(m1);
  const dLoaf = after.loaf - before.loaf;
  const dScript = after.script - before.script;
  const worstRecent = after.recentWorst && after.recentWorst[0];
  console.log(`${label.padEnd(14)} 帧+${String(dLoaf).padStart(2)} 脚本+${String(dScript).padStart(5)}ms 最长帧=${worstRecent ? worstRecent.d : "-"}ms(script=${worstRecent ? worstRecent.st : "-"}) fps=${after.fps}`);
  return { label, dLoaf, dScript, worst: worstRecent && worstRecent.d };
};

console.log("=== 连续操作压测 (DPR=1 修复后) ===\n");
const results = [];
// 背包内不同卡片位置
results.push(await step("卡片1", 371/960, 600/560));
results.push(await step("卡片2", 458/960, 600/560));
results.push(await step("卡片3", 545/960, 600/560));
results.push(await step("卡片4", 632/960, 600/560));
results.push(await step("卡片1再切", 371/960, 600/560));
// 页签
results.push(await step("页签-属性", 120/960, 120/560));
results.push(await step("页签-技能", 220/960, 120/560));
results.push(await step("页签-魂卡", 320/960, 120/560));

console.log("\n=== 汇总 ===");
const worst = results.reduce((a, b) => (b.worst || 0) > (a.worst || 0) ? b : a);
const avgScript = results.reduce((s, r) => s + r.dScript, 0) / results.length;
const maxScript = results.reduce((s, r) => Math.max(s, r.dScript), 0);
console.log(`操作数: ${results.length}`);
console.log(`平均脚本耗时: ${avgScript.toFixed(0)}ms/步`);
console.log(`最大脚本耗时: ${maxScript}ms/步`);
console.log(`最差一步: ${worst.label} 最长帧 ${worst.worst}ms`);
console.log(`\n对比 Round 63c 基线: 单帧最长 15321ms, 长任务 1971 个/194s 阻塞`);
process.exit(0);
