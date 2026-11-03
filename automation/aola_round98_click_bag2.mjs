// round98: 用正确的画布偏移点击「亚比背包」
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const OUT = "D:/temp/ZCode/aola/client/docs/spike";
try {
  const w = await page.cdp("Browser.getWindowForTarget", {});
  const id = w.windowId ?? (w.result && w.result.windowId);
  await page.cdp("Browser.setWindowBounds", { windowId: id, bounds: { windowState: "normal" } });
} catch (e) { console.log("restore fail:", e.message.slice(0, 100)); }
await page.waitForTimeout(1500);

const rect = await page.evaluate(() => document.getElementById("stage").getBoundingClientRect().toJSON());
console.log("stage:", JSON.stringify(rect));
const cx = rect.x + 925, cy = rect.y + 525;
const n0 = await page.evaluate(() => (window.__LOG_LINES || []).length);
await page.mouse.click(cx, cy, { label: "click pet backpack" });
await page.waitForTimeout(6000);
await page.screenshot({ path: `${OUT}/r98_after.png`, clip: { x: rect.x, y: rect.y, width: 960, height: 560 } });
const st = await page.evaluate((n) => (window.__LOG_LINES || []).slice(n).filter(l => !/login-cmd|audio buffer|Audio underrun/i.test(l)).slice(0, 60), n0);
console.log("NEW LOGS:\n" + st.join("\n"));
console.log("done");
