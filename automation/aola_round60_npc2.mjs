// round60: 关域界面，点场景中「神谕创世之战」NPC
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const OUT = "D:/temp/ZCode/aola/client/docs/spike";
try { await page.cdp("Page.bringToFront", {}); } catch (e) {}

await page.mouse.click(1163, 21, { label: "close panel" });
await page.waitForTimeout(3000);
console.log("closed", await page.screenshot({ path: `${OUT}/r60_closed.png` }));

await page.mouse.click(909, 213, { label: "click 神谕创世之战" });
await page.waitForTimeout(5000);
console.log("npc", await page.screenshot({ path: `${OUT}/r60_npc.png` }));
