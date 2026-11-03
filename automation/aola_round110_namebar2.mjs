// round110: 2x 放大背包「名字条」区域（卡片上方 y≈405-455）
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const OUT = "D:/temp/ZCode/aola/client/docs/spike";
try {
  await page.cdp("Emulation.setDeviceMetricsOverride", {
    width: 1128, height: 832, deviceScaleFactor: 2, mobile: false,
  });
} catch (e) {}
await page.waitForTimeout(1200);
const r = await page.evaluate(() => document.getElementById("stage").getBoundingClientRect().toJSON());
await page.screenshot({ path: `${OUT}/r110_namebar2.png`, clip: { x: r.x + 40, y: r.y + 400, width: 560, height: 60 } });
try { await page.cdp("Emulation.clearDeviceMetricsOverride", {}); } catch (e) {}
console.log("saved");
