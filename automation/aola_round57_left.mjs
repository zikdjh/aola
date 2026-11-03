// round57: 关召唤面板 + 截左侧活动栏局部
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const OUT = "D:/temp/ZCode/aola/client/docs/spike";
try { await page.cdp("Page.bringToFront", {}); } catch (e) {}

await page.mouse.click(1154, 43, { label: "close summon panel" });
await page.waitForTimeout(3000);
console.log("full", await page.screenshot({ path: `${OUT}/r57_full.png` }));
console.log("left", await page.screenshot({ path: `${OUT}/r57_left.png`, clip: { x: 240, y: 60, width: 130, height: 260 } }));
