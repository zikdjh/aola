// round67: 关名人堂 → 点竞技场对战 NPC
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const OUT = "D:/temp/ZCode/aola/client/docs/spike";
try { await page.cdp("Page.bringToFront", {}); } catch (e) {}

await page.mouse.click(1175, 23, { label: "close hall of fame" });
await page.waitForTimeout(3000);
await page.mouse.click(420, 373, { label: "click arena npc" });
await page.waitForTimeout(7000);
await page.screenshot({ path: `${OUT}/r67_npc.png`, clip: { x: 240, y: 8, width: 960, height: 560 } });
console.log("saved");
