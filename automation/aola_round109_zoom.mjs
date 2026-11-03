// round109: 2x 设备像素缩放截图，放大查看卡片名字区域
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const OUT = "D:/temp/ZCode/aola/client/docs/spike";
try {
  const w = await page.cdp("Browser.getWindowForTarget", {});
  const id = w.windowId ?? (w.result && w.result.windowId);
  await page.cdp("Browser.setWindowBounds", { windowId: id, bounds: { windowState: "normal" } });
} catch (e) {}
await page.waitForTimeout(1200);
try {
  await page.cdp("Emulation.setDeviceMetricsOverride", {
    width: 1128, height: 832, deviceScaleFactor: 2, mobile: false,
  });
} catch (e) { console.log("dsf fail:", e.message.slice(0, 100)); }
await page.waitForTimeout(1500);
const r = await page.evaluate(() => document.getElementById("stage").getBoundingClientRect().toJSON());
console.log("rect", JSON.stringify(r));
const crop = (name, x, y, w2, h) =>
  page.screenshot({ path: `${OUT}/${name}.png`, clip: { x: r.x + x, y: r.y + y, width: w2, height: h } });
await crop("r109_card1", 30, 440, 200, 120);
await crop("r109_card2", 150, 440, 220, 120);
await crop("r109_list", 420, 60, 160, 380);
try { await page.cdp("Emulation.clearDeviceMetricsOverride", {}); } catch (e) {}
console.log("saved");
