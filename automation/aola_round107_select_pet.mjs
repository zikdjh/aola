// round107: 点击第一只精灵卡片，查看详情页名字显示
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const OUT = "D:/temp/ZCode/aola/client/docs/spike";
try {
  const w = await page.cdp("Browser.getWindowForTarget", {});
  const id = w.windowId ?? (w.result && w.result.windowId);
  await page.cdp("Browser.setWindowBounds", { windowId: id, bounds: { windowState: "normal" } });
} catch (e) {}
await page.waitForTimeout(1200);
const rect = await page.evaluate(() => document.getElementById("stage").getBoundingClientRect().toJSON());
await page.mouse.click(rect.x + 85, rect.y + 495, { label: "select first pet" });
await page.waitForTimeout(5000);
await page.screenshot({ path: `${OUT}/r107_detail.png`, clip: { x: rect.x, y: rect.y, width: 960, height: 560 } });
await page.screenshot({ path: `${OUT}/r107_detail_top.png`, clip: { x: rect.x + 520, y: rect.y + 30, width: 440, height: 130 } });
await page.screenshot({ path: `${OUT}/r107_namebar.png`, clip: { x: rect.x + 40, y: rect.y + 400, width: 480, height: 60 } });
console.log("saved");
