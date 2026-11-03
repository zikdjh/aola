// round111: trace 日志下打开背包，抓字体/字形相关日志
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
await page.waitForTimeout(78000);
await clickStage(925, 525, "click pet backpack");
await page.waitForTimeout(12000);
const st = await page.evaluate(() => {
  const L = window.__LOG_LINES || [];
  const pick = (re) => L.filter(l => re.test(l)).map(l => l.replace(/\s*color:.*$/, "").slice(0, 200)).slice(-25);
  return {
    font: pick(/font|Font|glyph|Glyph/),
    text: pick(/TextFormat|textfield|TextField|char|Char/),
  };
});
console.log("FONT/GLYPH:\n" + st.font.join("\n"));
console.log("TEXT:\n" + st.text.join("\n"));
console.log("done");
