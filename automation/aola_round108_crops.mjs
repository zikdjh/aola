// round108: 背包内多处裁剪，定位精灵名字绘制位置
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const OUT = "D:/temp/ZCode/aola/client/docs/spike";
try {
  const w = await page.cdp("Browser.getWindowForTarget", {});
  const id = w.windowId ?? (w.result && w.result.windowId);
  await page.cdp("Browser.setWindowBounds", { windowId: id, bounds: { windowState: "normal" } });
} catch (e) {}
await page.waitForTimeout(1200);
const r = await page.evaluate(() => document.getElementById("stage").getBoundingClientRect().toJSON());
const crop = (name, x, y, w2, h) =>
  page.screenshot({ path: `${OUT}/${name}.png`, clip: { x: r.x + x, y: r.y + y, width: w2, height: h } });
await crop("r108_sel_icon", 430, 300, 140, 90);      // 选中精灵小图标区
await crop("r108_panel_top", 500, 0, 470, 70);       // 面板顶部
await crop("r108_card1", 0, 425, 210, 135);          // 第一张卡片
await crop("r108_card2", 170, 425, 210, 135);        // 第二张卡片
console.log("saved");
