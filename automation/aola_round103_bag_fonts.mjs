// round103: 背包面板内精灵名字区域截图 + 设备字体告警
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const OUT = "D:/temp/ZCode/aola/client/docs/spike";
try {
  const w = await page.cdp("Browser.getWindowForTarget", {});
  const id = w.windowId ?? (w.result && w.result.windowId);
  await page.cdp("Browser.setWindowBounds", { windowId: id, bounds: { windowState: "normal" } });
} catch (e) {}
await page.waitForTimeout(1500);
const rect = await page.evaluate(() => document.getElementById("stage").getBoundingClientRect().toJSON());
await page.screenshot({ path: `${OUT}/r103_bag_full.png`, clip: { x: rect.x, y: rect.y, width: 960, height: 560 } });
await page.screenshot({ path: `${OUT}/r103_bag_cards.png`, clip: { x: rect.x, y: rect.y + 400, width: 960, height: 160 } });
const st = await page.evaluate(() => ({
  fonts: (window.__LOG_LINES || []).filter(l => /device font|Unknown font|font family|fallback font/i.test(l)).map(l => l.replace(/\s*color:.*$/, "").slice(0, 160)).slice(-40),
  title: document.title,
}));
console.log("FONT LOGS:\n" + st.fonts.join("\n"));
console.log("done");
