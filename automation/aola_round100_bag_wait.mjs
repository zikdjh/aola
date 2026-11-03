// round100: 世界装配等待更长（约 90s）后点亚比背包
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const OUT = "D:/temp/ZCode/aola/client/docs/spike";
try {
  const w = await page.cdp("Browser.getWindowForTarget", {});
  const id = w.windowId ?? (w.result && w.result.windowId);
  await page.cdp("Browser.setWindowBounds", { windowId: id, bounds: { windowState: "normal" } });
} catch (e) { console.log("restore fail:", e.message.slice(0, 100)); }
await page.waitForTimeout(1500);

let rect = await page.evaluate(() => document.getElementById("stage").getBoundingClientRect().toJSON());
const clickStage = async (sx, sy, label) => {
  rect = await page.evaluate(() => document.getElementById("stage").getBoundingClientRect().toJSON());
  await page.mouse.click(rect.x + sx, rect.y + sy, { label });
};
const shot = async (name) => {
  rect = await page.evaluate(() => document.getElementById("stage").getBoundingClientRect().toJSON());
  return page.screenshot({ path: `${OUT}/${name}.png`, clip: { x: rect.x, y: rect.y, width: 960, height: 560 } });
};

await page.goto("http://127.0.0.1:8700/game");
await page.waitForTimeout(32000);
await clickStage(484, 526, "click enter game");
await page.waitForTimeout(15000);
await clickStage(472, 513, "click quickstart");
console.log("quickstart clicked");
await page.waitForTimeout(80000);
console.log("world", await shot("r100_world"));

const n0 = await page.evaluate(() => (window.__LOG_LINES || []).length);
await clickStage(925, 525, "click pet backpack");
await page.waitForTimeout(9000);
console.log("bag", await shot("r100_bag"));

const st = await page.evaluate((n) => (window.__LOG_LINES || []).slice(n).filter(l => !/login-cmd|audio buffer|Audio underrun|log_adapter/i.test(l)).slice(0, 60), n0);
console.log("NEW LOGS:\n" + st.join("\n"));
console.log("done");
