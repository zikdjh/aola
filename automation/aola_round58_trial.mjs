// round58: 点左侧「挑战试炼」
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const OUT = "D:/temp/ZCode/aola/client/docs/spike";
try { await page.cdp("Page.bringToFront", {}); } catch (e) {}

await page.mouse.click(272, 300, { label: "click 挑战试炼" });
await page.waitForTimeout(5000);
console.log("shot", await page.screenshot({ path: `${OUT}/r58_panel.png` }));
