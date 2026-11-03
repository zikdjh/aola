// round97: 精确取 ruffle 画布 rect，并裁剪最右底部图标区域确认坐标
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const OUT = "D:/temp/ZCode/aola/client/docs/spike";
try {
  const w = await page.cdp("Browser.getWindowForTarget", {});
  const id = w.windowId ?? (w.result && w.result.windowId);
  await page.cdp("Browser.setWindowBounds", { windowId: id, bounds: { windowState: "normal" } });
} catch (e) { console.log("restore fail:", e.message.slice(0, 100)); }
await page.waitForTimeout(1500);
const info = await page.evaluate(() => {
  const c = document.querySelector("canvas");
  const r = c ? c.getBoundingClientRect() : null;
  return {
    rect: r && { x: r.x, y: r.y, w: r.width, h: r.height },
    dpr: window.devicePixelRatio,
    inner: { w: window.innerWidth, h: window.innerHeight },
    stageRect: document.getElementById("stage").getBoundingClientRect().toJSON(),
  };
});
console.log("INFO:", JSON.stringify(info));
const r = info.rect;
await page.screenshot({ path: `${OUT}/r97_bag_icon.png`, clip: { x: r.x + 860, y: r.y + 490, width: 100, height: 70 } });
console.log("saved");
