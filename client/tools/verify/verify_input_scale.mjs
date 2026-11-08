// verify_input_scale.mjs — 验证 CSS transform 放大后，鼠标坐标仍能正确落到 SWF 上
// 做法：在 canvas 上挂 pointerdown 监听，从页面外部派发点击，读回 Ruffle 实际收到的坐标
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const list = await fetch("http://127.0.0.1:9223/json/list").then((r) => r.json());
const page = list.find((t) => t.type === "page" && t.url.includes("/game"));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let seq = 0;
const pend = new Map();
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
const call = (method, params = {}) => new Promise((r) => { const id = ++seq; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const evalp = async (expr) => {
  const r = await call("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(String(r.exceptionDetails.exception?.description || "").slice(0, 300));
  return r.result?.result?.value;
};

await call("Page.enable", {});
console.log("重载页面（应用新 CSS）…");
await call("Page.navigate", { url: "http://127.0.0.1:8700/game?scale=1.3" });
await sleep(12000);
await call("Emulation.setFocusEmulationEnabled", { enabled: true });
await sleep(12000);

// 装监听
await evalp(`(() => {
  const p = document.querySelector("ruffle-player");
  if (!p || !p.shadowRoot) return "no-player";
  const cv = p.shadowRoot.querySelector("canvas");
  if (!cv) return "no-canvas";
  window.__HITS = [];
  if (!cv.__probe) {
    cv.__probe = true;
    cv.addEventListener("pointerdown", (e) => {
      const r = cv.getBoundingClientRect();
      window.__HITS.push({
        clientX: Math.round(e.clientX), clientY: Math.round(e.clientY),
        offsetX: Math.round(e.offsetX), offsetY: Math.round(e.offsetY),
        rect: { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y) },
        canvas: { w: cv.width, h: cv.height }
      });
    }, true);
  }
  return "ok";
})()`);

// 读布局
const geo = JSON.parse(await evalp(`(() => {
  const p = document.querySelector("ruffle-player");
  const cv = p.shadowRoot.querySelector("canvas");
  const r = cv.getBoundingClientRect();
  return JSON.stringify({ x: r.x, y: r.y, w: r.width, h: r.height, cw: cv.width, ch: cv.height });
})()`));
console.log("canvas 显示矩形:", JSON.stringify({ x: Math.round(geo.x), y: Math.round(geo.y), w: Math.round(geo.w), h: Math.round(geo.h) }), " 后备:", geo.cw + "x" + geo.ch);

// 在显示区域的 25% / 75% 处点击，看坐标映射
for (const [fx, fy] of [[0.25, 0.25], [0.75, 0.75]]) {
  const x = Math.round(geo.x + geo.w * fx);
  const y = Math.round(geo.y + geo.h * fy);
  await call("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await call("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await call("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
  await sleep(400);
}

const hits = JSON.parse(await evalp(`JSON.stringify(window.__HITS || [])`));
console.log(`\n收到 ${hits.length} 次 pointerdown：`);
let allGood = hits.length >= 2;
for (const h of hits) {
  // Ruffle 用的换算：canvas.width / rect.width
  const ratio = h.canvas.w / h.rect.w;
  const mappedX = Math.round((h.clientX - h.rect.x) * ratio);
  const mappedY = Math.round((h.clientY - h.rect.y) * ratio);
  const inRange = mappedX >= 0 && mappedX < h.canvas.w && mappedY >= 0 && mappedY < h.canvas.h;
  console.log(`  client(${h.clientX},${h.clientY}) → 画布内(${mappedX},${mappedY})  范围${inRange ? "✅" : "❌"}  比例=${ratio.toFixed(4)}`);
  if (!inRange) allGood = false;
}
console.log(`\n结论: ${allGood ? "✅ 鼠标坐标能正确穿过 1.3 倍 transform 映射到 960×560 画布" : "❌ 坐标映射有问题"}`);
process.exit(allGood ? 0 : 1);
