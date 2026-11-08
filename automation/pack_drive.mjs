// pack_drive.mjs — 驱动整合包浏览器测背包切宠（CDP）
// 用法: node pack_drive.mjs <step>
//   shot  : 截图看当前状态
//   open  : 点开亚比背包
//   switch: 装监测+切宠测阻塞
import fs from "node:fs";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const res = await fetch("http://127.0.0.1:9223/json/list");
const targets = await res.json();
const page = targets.find((t) => t.type === "page" && t.url.includes("/game"));
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
const step = process.argv[2] || "shot";

if (step === "click") {
  const [x, y] = process.argv.slice(3).map(Number);
  await call("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await call("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
  console.log("clicked", x, y);
  process.exit(0);
}
if (step === "switchfrac") {
  const [fx, fy] = process.argv.slice(3).map(Number);
  const rect = JSON.parse(await evalp('JSON.stringify(document.getElementById("stage").getBoundingClientRect().toJSON())'));
  const x = Math.round(rect.x + fx * rect.width), y = Math.round(rect.y + fy * rect.height);
  await evalp('(() => { const m = { t0: performance.now(), loaf: [] }; window.__PSW = m; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) m.loaf.push({ t: Math.round(e.startTime - m.t0), d: Math.round(e.duration), b: Math.round(e.blockingDuration) }); }).observe({ type: "long-animation-frame", buffered: true }); } catch (e) {}})()');
  await call("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await call("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
  console.log("switchfrac clicked", x, y, "— waiting 8s");
  await sleep(8000);
  const r = await evalp('(() => { const L = window.__PSW.loaf.filter(x => x.t >= 0); return { frames: L.length, blockingTotal: L.reduce((s,x)=>s+(x.b||0),0), worst: L.slice().sort((a,b)=>(b.b||0)-(a.b||0)).slice(0,3).map(x=>x.b+"ms@"+x.t) }; })()');
  console.log("LoAF:", JSON.stringify(r));
  const shot = await call("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync("D:/temp/ZCode/scratch/pack_switch_after.png", Buffer.from(shot.result.data, "base64"));
  process.exit(0);
}
if (step === "shot") {
  const r = await call("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync("D:/temp/ZCode/scratch/pack_screen.png", Buffer.from(r.result.data, "base64"));
  const rect = await evalp(`(() => { const s = document.getElementById("stage"); return s ? JSON.stringify(s.getBoundingClientRect().toJSON()) : "no-stage"; })()`);
  console.log("stage rect:", rect);
  process.exit(0);
}
if (step === "open") {
  // 亚比背包：底栏右侧（stage 960x560 内约 x=862,y=486 → 页面坐标按 rect 换算）
  const rect = JSON.parse(await evalp(`JSON.stringify(document.getElementById("stage").getBoundingClientRect().toJSON())`));
  const sx = rect.x + rect.width * (1150 / 1280), sy = rect.y + rect.height * (653 / 720);
  console.log("click at", Math.round(sx), Math.round(sy));
  await call("Input.dispatchMouseEvent", { type: "mousePressed", x: Math.round(sx), y: Math.round(sy), button: "left", clickCount: 1 });
  await call("Input.dispatchMouseEvent", { type: "mouseReleased", x: Math.round(sx), y: Math.round(sy), button: "left", clickCount: 1 });
  process.exit(0);
}
if (step === "switch") {
  await evalp(`(() => {
    const m = { t0: performance.now(), loaf: [] };
    window.__PSW = m;
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) m.loaf.push({ t: Math.round(e.startTime - m.t0), d: Math.round(e.duration), b: Math.round(e.blockingDuration) }); }).observe({ type: "long-animation-frame", buffered: true }); } catch (e) {}
  })()`);
  const rect = JSON.parse(await evalp(`JSON.stringify(document.getElementById("stage").getBoundingClientRect().toJSON())`));
  const cardX = rect.x + rect.width * (371 / 1280), cardY = rect.y + rect.height * (600 / 720);
  await call("Input.dispatchMouseEvent", { type: "mousePressed", x: Math.round(cardX), y: Math.round(cardY), button: "left", clickCount: 1 });
  await call("Input.dispatchMouseEvent", { type: "mouseReleased", x: Math.round(cardX), y: Math.round(cardY), button: "left", clickCount: 1 });
  console.log("switch clicked, waiting 8s...");
  await sleep(8000);
  const r = await evalp(`(() => { const m = window.__PSW; const L = m.loaf.filter(x => x.t >= 0); return { frames: L.length, blockingTotal: L.reduce((s,x)=>s+(x.b||0),0), worst: L.slice().sort((a,b)=>(b.b||0)-(a.b||0)).slice(0,4) }; })()`);
  console.log("switch LoAF:", JSON.stringify(r));
  const shot = await call("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync("D:/temp/ZCode/scratch/pack_switch_after.png", Buffer.from(shot.result.data, "base64"));
  process.exit(0);
}
console.log("unknown step");
process.exit(1);
