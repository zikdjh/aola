// round117: 重载后用真实宋体/雅黑字体，截取详情面板属性区（对比用户截图）
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const OUT = "D:/temp/ZCode/aola/client/docs/spike";
try {
  const w = await page.cdp("Browser.getWindowForTarget", {});
  const id = w.windowId ?? (w.result && w.result.windowId);
  await page.cdp("Browser.setWindowBounds", { windowId: id, bounds: { windowState: "normal" } });
} catch (e) {}
await page.waitForTimeout(1200);
let rect = await page.evaluate(() => document.getElementById("stage").getBoundingClientRect().toJSON());
const clickStage = async (sx, sy, label) => {
  rect = await page.evaluate(() => document.getElementById("stage").getBoundingClientRect().toJSON());
  await page.mouse.click(rect.x + sx, rect.y + sy, { label });
};
await page.goto("http://127.0.0.1:8700/game");
await page.waitForTimeout(32000);
await clickStage(484, 526, "click enter game");
await page.waitForTimeout(15000);
await clickStage(472, 513, "click quickstart");
await page.waitForTimeout(80000);
await clickStage(925, 525, "click pet backpack");
await page.waitForTimeout(12000);
rect = await page.evaluate(() => document.getElementById("stage").getBoundingClientRect().toJSON());
await page.screenshot({ path: `${OUT}/r117_bag.png`, clip: { x: rect.x, y: rect.y, width: 960, height: 560 } });
await page.screenshot({ path: `${OUT}/r117_attrs.png`, clip: { x: rect.x + 540, y: rect.y + 130, width: 400, height: 160 } });
console.log("saved");
