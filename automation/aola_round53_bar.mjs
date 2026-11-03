// round53: 关面板 + 截取底部图标栏局部（放大看清图标）
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const OUT = "D:/temp/ZCode/aola/client/docs/spike";
try { await page.cdp("Page.bringToFront", {}); } catch (e) {}

await page.mouse.click(1165, 28, { label: "close panel X" });
await page.waitForTimeout(3500);
console.log("full", await page.screenshot({ path: `${OUT}/r53_full.png` }));
console.log("bar", await page.screenshot({ path: `${OUT}/r53_bar.png`, clip: { x: 240, y: 480, width: 960, height: 80 } }));
