// round65: 地图 → 太空竞技场
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const OUT = "D:/temp/ZCode/aola/client/docs/spike";
try { await page.cdp("Page.bringToFront", {}); } catch (e) {}

await page.mouse.click(720, 528, { label: "open map" });
await page.waitForTimeout(5000);
await page.mouse.click(1060, 146, { label: "click 太空竞技场" });
await page.waitForTimeout(12000);
await page.screenshot({ path: `${OUT}/r65_stage.png`, clip: { x: 240, y: 8, width: 960, height: 560 } });
console.log("saved");
