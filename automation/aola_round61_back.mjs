// round61: 用左上角返回按钮关掉全屏活动页
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const OUT = "D:/temp/ZCode/aola/client/docs/spike";
try { await page.cdp("Page.bringToFront", {}); } catch (e) {}

await page.mouse.click(291, 28, { label: "back icon" });
await page.waitForTimeout(3500);
console.log("a", await page.screenshot({ path: `${OUT}/r61_a.png` }));
