// round66: 点击竞技场对战入口
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const OUT = "D:/temp/ZCode/aola/client/docs/spike";
try { await page.cdp("Page.bringToFront", {}); } catch (e) {}

await page.mouse.click(505, 203, { label: "click arena board" });
await page.waitForTimeout(6000);
await page.screenshot({ path: `${OUT}/r66_a.png`, clip: { x: 240, y: 8, width: 960, height: 560 } });

await page.mouse.click(495, 355, { label: "click arena npc" });
await page.waitForTimeout(6000);
await page.screenshot({ path: `${OUT}/r66_b.png`, clip: { x: 240, y: 8, width: 960, height: 560 } });
console.log("saved");
