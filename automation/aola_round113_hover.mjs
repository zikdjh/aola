// round113: 悬停卡片看名字提示
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const OUT = "D:/temp/ZCode/aola/client/docs/spike";
try {
  await page.cdp("Emulation.setDeviceMetricsOverride", { width: 1128, height: 832, deviceScaleFactor: 2, mobile: false });
} catch (e) {}
await page.waitForTimeout(1000);
const r = await page.evaluate(() => document.getElementById("stage").getBoundingClientRect().toJSON());
await page.mouse.move(r.x + 90, r.y + 500, { label: "hover card1" });
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/r113_hover1.png`, clip: { x: r.x + 20, y: r.y + 380, width: 500, height: 180 } });
await page.mouse.move(r.x + 215, r.y + 500, { label: "hover card2" });
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/r113_hover2.png`, clip: { x: r.x + 20, y: r.y + 380, width: 500, height: 180 } });
try { await page.cdp("Emulation.clearDeviceMetricsOverride", {}); } catch (e) {}
console.log("saved");
