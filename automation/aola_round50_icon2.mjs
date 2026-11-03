// round50: 关闭蓝宝石面板，试下一个图标（地图）
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const OUT = "D:/temp/ZCode/aola/client/docs/spike";
try { await page.cdp("Page.bringToFront", {}); } catch (e) {}

await page.mouse.click(1121, 34, { label: "close panel" });
await page.waitForTimeout(2500);
await page.mouse.click(327, 536, { label: "click icon 2" });
await page.waitForTimeout(4000);
console.log("shot", await page.screenshot({ path: `${OUT}/r50_icon2.png` }));
