// round112: 2x 放大详情面板左上角（名字可能的显示位）
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
await page.screenshot({ path: `${OUT}/r112_panel_left.png`, clip: { x: r.x + 400, y: r.y + 25, width: 260, height: 70 } });
await page.screenshot({ path: `${OUT}/r112_panel_head.png`, clip: { x: r.x + 530, y: r.y + 25, width: 430, height: 60 } });
try { await page.cdp("Emulation.clearDeviceMetricsOverride", {}); } catch (e) {}
console.log("saved");
