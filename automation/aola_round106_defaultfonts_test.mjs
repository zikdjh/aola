// round106: 仅加载到世界，检查 defaultFonts 映射实验（Elephant / 汉仪旗黑 是否还报 Unknown）
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
await page.waitForTimeout(75000);
const st = await page.evaluate(() => ({
  unknown: (window.__LOG_LINES || []).filter(l => /Unknown device font/i.test(l)).map(l => l.replace(/\s*color:.*$/, "").slice(0, 140)).slice(-20),
  fetches: (window.__NET_STATS || {}).urls ? window.__NET_STATS.urls.filter(u => /fonts\//.test(u)).slice(-10) : [],
}));
console.log("UNKNOWN:\n" + st.unknown.join("\n"));
console.log("FONT FETCH:\n" + st.fetches.join("\n"));
