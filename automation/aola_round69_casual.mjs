// round69: 进入休闲模式
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const OUT = "D:/temp/ZCode/aola/client/docs/spike";
try { await page.cdp("Page.bringToFront", {}); } catch (e) {}

await page.mouse.click(1065, 348, { label: "click 休闲模式" });
await page.waitForTimeout(8000);
await page.screenshot({ path: `${OUT}/r69_a.png`, clip: { x: 240, y: 8, width: 960, height: 560 } });
