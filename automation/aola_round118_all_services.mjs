// round118: 全服务启用后观察世界装配进度与 init 报错
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const OUT = "D:/temp/ZCode/aola/client/docs/spike";
try {
  const w = await page.cdp("Browser.getWindowForTarget", {});
  const id = w.windowId ?? (w.result && w.result.windowId);
  await page.cdp("Browser.setWindowBounds", { windowId: id, bounds: { windowState: "normal" } });
} catch (e) {}
await page.waitForTimeout(1200);
let rect = await page.evaluate(() => document.getElementById("stage").getBoundingClientRect().toJSON());
const clickStage = async (sx, sy, label) => {
  rect = await page.evaluate(() => document.getElementById("stage").getBoundingClientRect().toJSON());
  await page.mouse.click(rect.x + sx, rect.y + sy, { label });
};
await page.goto("http://127.0.0.1:8700/game");
await page.waitForTimeout(32000);
await clickStage(484, 526, "click enter game");
await page.waitForTimeout(15000);
await clickStage(472, 513, "click quickstart");
console.log("quickstart clicked");
for (const t of [30, 60, 90, 120]) {
  await page.waitForTimeout(t === 30 ? 30000 : 30000);
  console.log(`t${t}`, await page.screenshot({ path: `${OUT}/r118_world_t${t}.png`, clip: { x: rect.x, y: rect.y, width: 960, height: 560 } }));
}
const st = await page.evaluate(() => {
  const L = window.__LOG_LINES || [];
  return {
    errs: L.filter(l => /%cERROR%|Error #|没有 |TypeError|VerifyError|#10/i.test(l)).map(l => l.replace(/\s*color:.*$/, "").slice(0, 260)).slice(-30),
    tail: L.filter(l => !/login-cmd|audio|log_adapter/i.test(l)).slice(-10),
  };
});
console.log("ERRORS:\n" + st.errs.join("\n"));
console.log("TAIL:\n" + st.tail.join("\n"));
