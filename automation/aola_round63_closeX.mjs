// round63: 精确关闭全屏活动页（stage 929,17 → CSS 1169,25）
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const OUT = "D:/temp/ZCode/aola/client/docs/spike";
try { await page.cdp("Page.bringToFront", {}); } catch (e) {}

await page.mouse.click(1169, 25, { label: "close X" });
await page.waitForTimeout(3500);
await page.screenshot({ path: `${OUT}/r63_stage.png`, clip: { x: 240, y: 8, width: 960, height: 560 } });
console.log("saved");
