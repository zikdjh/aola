// round95: 放大底部左/右两段图标栏，确认「背包」按钮位置（页面已在世界中）
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const OUT = "D:/temp/ZCode/aola/client/docs/spike";
try {
  const w = await page.cdp("Browser.getWindowForTarget", {});
  const id = w.windowId ?? (w.result && w.result.windowId);
  await page.cdp("Browser.setWindowBounds", { windowId: id, bounds: { windowState: "normal" } });
} catch (e) { console.log("restore fail:", e.message.slice(0, 100)); }
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/r95_bar_left.png`, clip: { x: 240, y: 420, width: 400, height: 148 } });
await page.screenshot({ path: `${OUT}/r95_bar_right.png`, clip: { x: 760, y: 420, width: 440, height: 148 } });
console.log("crops saved");
