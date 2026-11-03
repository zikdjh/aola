// round52: 尝试右上角关闭蓝宝石面板
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const OUT = "D:/temp/ZCode/aola/client/docs/spike";
try { await page.cdp("Page.bringToFront", {}); } catch (e) {}

await page.mouse.click(1163, 28, { label: "close top-right" });
await page.waitForTimeout(3000);
console.log("a", await page.screenshot({ path: `${OUT}/r52_a.png` }));
await page.mouse.click(1176, 40, { label: "close corner2" });
await page.waitForTimeout(3000);
console.log("b", await page.screenshot({ path: `${OUT}/r52_b.png` }));
