// round101: 背包加载完成后补拍（页面保持当前状态）
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const OUT = "D:/temp/ZCode/aola/client/docs/spike";
try {
  const w = await page.cdp("Browser.getWindowForTarget", {});
  const id = w.windowId ?? (w.result && w.result.windowId);
  await page.cdp("Browser.setWindowBounds", { windowId: id, bounds: { windowState: "normal" } });
} catch (e) {}
await page.waitForTimeout(20000);
const rect = await page.evaluate(() => document.getElementById("stage").getBoundingClientRect().toJSON());
await page.screenshot({ path: `${OUT}/r101_bag_settled.png`, clip: { x: rect.x, y: rect.y, width: 960, height: 560 } });
const st = await page.evaluate(() => (window.__LOG_LINES || []).filter(l => /%cERROR%|Error #|TypeError/i.test(l)).slice(-6));
console.log("ERRORS:\n" + st.join("\n"));
console.log("done");
