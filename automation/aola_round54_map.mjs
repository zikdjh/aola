// round54: 打开世界地图
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const OUT = "D:/temp/ZCode/aola/client/docs/spike";
try { await page.cdp("Page.bringToFront", {}); } catch (e) {}

await page.mouse.click(720, 528, { label: "open map" });
await page.waitForTimeout(4500);
console.log("map", await page.screenshot({ path: `${OUT}/r54_map.png` }));
