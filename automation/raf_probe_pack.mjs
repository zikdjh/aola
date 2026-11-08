// raf_probe_pack.mjs — 对比探针：整合包浏览器（禁用遮挡计算）vs IAB 的 RAF 频率
// 用法: node raf_probe_pack.mjs
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function cdpEval(port, urlPart, expr) {
  const res = await fetch(`http://127.0.0.1:${port}/json/list`);
  const targets = await res.json();
  const page = targets.find((t) => t.type === "page" && t.url.includes(urlPart));
  if (!page) throw new Error("target not found: " + urlPart);
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
  const r = await call("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
  ws.close();
  return r.result?.result?.value ?? r.result;
}

const COUNTER = `(async () => {
  let raf = 0, timer = 0;
  const tick = () => { raf++; if (raf < 100000) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  const iv = setInterval(() => timer++, 50);
  const t0 = performance.now();
  await new Promise(r => setTimeout(r, 2000));
  clearInterval(iv);
  return { rafIn2s: raf, timerIn2s: timer, ms: Math.round(performance.now() - t0), vis: document.visibilityState };
})()`;

const pack = await cdpEval(9223, "/status", COUNTER);
console.log("整合包浏览器(禁用遮挡计算) /status:", JSON.stringify(pack));

const IAB = "http://127.0.0.1:8700/status";
// IAB 无法从外部 CDP 访问 —— 由调用方在 IAB 内跑同款计数器
process.stdout.write("IAB_PROBE_URL=" + IAB);
