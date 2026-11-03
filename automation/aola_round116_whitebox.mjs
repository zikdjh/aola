// round116: 4x 放大卡片内白色小方块与名字区域
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const OUT = "D:/temp/ZCode/aola/client/docs/spike";
try {
  await page.cdp("Emulation.setDeviceMetricsOverride", { width: 1128, height: 832, deviceScaleFactor: 4, mobile: false });
} catch (e) { console.log("dsf", e.message.slice(0, 80)); }
await page.waitForTimeout(1200);
const r = await page.evaluate(() => document.getElementById("stage").getBoundingClientRect().toJSON());
await page.screenshot({ path: `${OUT}/r116_whitebox.png`, clip: { x: r.x + 95, y: r.y + 465, width: 70, height: 50 } });
await page.screenshot({ path: `${OUT}/r116_card2name.png`, clip: { x: r.x + 185, y: r.y + 495, width: 110, height: 40 } });
try { await page.cdp("Emulation.clearDeviceMetricsOverride", {}); } catch (e) {}
console.log("saved");
