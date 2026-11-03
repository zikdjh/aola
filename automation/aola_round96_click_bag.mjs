// round96: 点击底部「亚比背包」，采集报错
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const OUT = "D:/temp/ZCode/aola/client/docs/spike";
const clip = { x: 240, y: 8, width: 960, height: 560 };
try {
  const w = await page.cdp("Browser.getWindowForTarget", {});
  const id = w.windowId ?? (w.result && w.result.windowId);
  await page.cdp("Browser.setWindowBounds", { windowId: id, bounds: { windowState: "normal" } });
} catch (e) { console.log("restore fail:", e.message.slice(0, 100)); }
await page.waitForTimeout(1500);

const n0 = await page.evaluate(() => (window.__LOG_LINES || []).length);
await page.mouse.click(1088, 505, { label: "click pet backpack" });
await page.waitForTimeout(6000);
await page.screenshot({ path: `${OUT}/r96_bag_after.png`, clip });
const st = await page.evaluate((n) => ({
  added: (window.__LOG_LINES || []).slice(n).filter(l => !/login-cmd|audio buffer/i.test(l)).slice(0, 60),
  els: true,
}), n0);
console.log("NEW LOGS:\n" + st.added.join("\n"));
console.log("done");
