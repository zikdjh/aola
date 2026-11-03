// round93: 通过 CDP 恢复最小化窗口后截图
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const OUT = "D:/temp/ZCode/aola/client/docs/spike";
try {
  const w = await page.cdp("Browser.getWindowForTarget", {});
  console.log("window:", JSON.stringify(w));
  const id = w.windowId ?? (w.result && w.result.windowId);
  await page.cdp("Browser.setWindowBounds", { windowId: id, bounds: { windowState: "normal" } });
  console.log("restored");
} catch (e) { console.log("cdp fail:", e.message.slice(0, 120)); }
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/r93_login.png`, clip: { x: 240, y: 8, width: 960, height: 560 } });
console.log("saved");
