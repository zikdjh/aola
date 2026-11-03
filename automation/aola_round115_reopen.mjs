// round115: 关闭背包再重开，4s 内截图（捕捉详情面板弹出前的状态）
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const OUT = "D:/temp/ZCode/aola/client/docs/spike";
try {
  const w = await page.cdp("Browser.getWindowForTarget", {});
  const id = w.windowId ?? (w.result && w.result.windowId);
  await page.cdp("Browser.setWindowBounds", { windowId: id, bounds: { windowState: "normal" } });
} catch (e) {}
await page.waitForTimeout(1000);
let r = await page.evaluate(() => document.getElementById("stage").getBoundingClientRect().toJSON());
await page.mouse.click(r.x + 930, r.y + 45, { label: "close bag" });
await page.waitForTimeout(2500);
await page.mouse.click(r.x + 925, r.y + 525, { label: "reopen bag" });
await page.waitForTimeout(4000);
r = await page.evaluate(() => document.getElementById("stage").getBoundingClientRect().toJSON());
await page.screenshot({ path: `${OUT}/r115_reopen4s.png`, clip: { x: r.x, y: r.y, width: 960, height: 560 } });
await page.waitForTimeout(15000);
await page.screenshot({ path: `${OUT}/r115_reopen19s.png`, clip: { x: r.x, y: r.y, width: 960, height: 560 } });
console.log("saved");
