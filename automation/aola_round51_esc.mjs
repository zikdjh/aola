// round51: ESC 关面板，再点 stage(140,528) 试探亚比背包
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const OUT = "D:/temp/ZCode/aola/client/docs/spike";
try { await page.cdp("Page.bringToFront", {}); } catch (e) {}

await page.keyboard.press("Escape");
await page.waitForTimeout(2500);
console.log("afterEsc", await page.screenshot({ path: `${OUT}/r51_after_esc.png` }));

await page.mouse.click(380, 536, { label: "click stage 140,528" });
await page.waitForTimeout(4000);
console.log("icon", await page.screenshot({ path: `${OUT}/r51_icon.png` }));
