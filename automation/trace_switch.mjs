// trace_switch.mjs — CDP Tracing 抓切宠期间渲染主线程全事件, 定位 100ms/帧的真实归属
import { writeFileSync } from "node:fs";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const targets = await fetch("http://127.0.0.1:9223/json/list").then((r) => r.json());
const page = targets.find((t) => t.url.includes("/game"));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let seq = 0;
const pending = new Map();
const events = [];
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  else if (msg.method === "Tracing.dataCollected") events.push(...(msg.params.value || []));
  else if (msg.method === "Tracing.tracingComplete") pending.get("done")?.(msg);
};
const call = (method, params = {}) => new Promise((res) => {
  const id = ++seq;
  pending.set(id, res);
  ws.send(JSON.stringify({ id, method, params }));
});
const evalp = async (expr) => {
  const r = await call("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
  return r.result?.result?.value;
};

const rect = JSON.parse(await evalp(`JSON.stringify(document.getElementById("stage").getBoundingClientRect().toJSON())`));
const x = Math.round(rect.x + (371 / 960) * rect.width);
const y = Math.round(rect.y + (600 / 560) * rect.height);

// 开始 tracing（只要主线程相关的大类）
await call("Tracing.start", {
  traceConfig: {
    includedCategories: [
      "devtools.timeline", "disabled-by-default-devtools.timeline",
      "toplevel", "blink", "v8", "v8.execute", "gpu", "viz", "cc", "benchmark",
      "disabled-by-default-devtools.timeline.stack",
    ],
    excludedCategories: ["*"],
  },
  transferMode: "ReportEvents",
});
await sleep(600);
await call("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
await call("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
console.log("switch clicked at", x, y, "— tracing 7s");
await sleep(7000);
const donePromise = new Promise((res) => pending.set("done", res));
await call("Tracing.end", {});
await donePromise;
console.log("events collected:", events.length);

// 保存原始
writeFileSync("D:/temp/ZCode/scratch/bag_mon_20261107/trace_switch.json", JSON.stringify(events));

// 分析: 按 name 聚合主线程上的 dur
const byName = new Map();
const mainTid = new Set();
for (const e of events) {
  if (e.ph === "M" && e.name === "thread_name" && e.args?.name === "CrRendererMain") mainTid.add(`${e.pid}:${e.tid}`);
}
console.log("renderer main threads:", [...mainTid].join(", "));

let total = 0;
for (const e of events) {
  if (e.ph !== "X" || !e.dur) continue;
  if (mainTid.size && !mainTid.has(`${e.pid}:${e.tid}`)) continue;
  const key = e.name;
  const rec = byName.get(key) || { n: 0, dur: 0 };
  rec.n++; rec.dur += e.dur;
  byName.set(key, rec);
  total += e.dur;
}
const top = [...byName.entries()].sort((a, b) => b[1].dur - a[1].dur).slice(0, 30);
console.log(`\n=== 主线程事件 Top 30（总 ${(total / 1000).toFixed(0)}ms）===`);
for (const [name, r] of top) {
  console.log(`${(r.dur / 1000).toFixed(0).padStart(7)}ms  n=${String(r.n).padStart(5)}  ${name}`);
}
process.exit(0);
