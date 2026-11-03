// round56: 点击黄泉元凰挑战 NPC
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const OUT = "D:/temp/ZCode/aola/client/docs/spike";
try { await page.cdp("Page.bringToFront", {}); } catch (e) {}

await page.mouse.click(423, 235, { label: "click challenge npc" });
await page.waitForTimeout(5000);
console.log("a", await page.screenshot({ path: `${OUT}/r56_a.png` }));
await page.mouse.click(426, 303, { label: "click label" });
await page.waitForTimeout(5000);
console.log("b", await page.screenshot({ path: `${OUT}/r56_b.png` }));
