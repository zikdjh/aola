// round105: 全流程 + 打开背包，检查设备字体告警与精灵名字
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
const shot = async (name, oy = 0, h = 560) => {
  rect = await page.evaluate(() => document.getElementById("stage").getBoundingClientRect().toJSON());
  return page.screenshot({ path: `${OUT}/${name}.png`, clip: { x: rect.x, y: rect.y + oy, width: 960, height: h } });
};

await page.goto("http://127.0.0.1:8700/game");
await page.waitForTimeout(32000);
await clickStage(484, 526, "click enter game");
await page.waitForTimeout(15000);
await clickStage(472, 513, "click quickstart");
console.log("quickstart clicked");
await page.waitForTimeout(80000);
console.log("world", await shot("r105_world"));

await clickStage(925, 525, "click pet backpack");
await page.waitForTimeout(12000);
console.log("bag", await shot("r105_bag"));
console.log("cards", await shot("r105_cards", 400, 160));

const st = await page.evaluate(() => ({
  unknown: (window.__LOG_LINES || []).filter(l => /Unknown device font/i.test(l)).map(l => l.replace(/\s*color:.*$/, "").slice(0, 140)).slice(-20),
  loaded: (window.__LOG_LINES || []).filter(l => /Loaded new device font|loaded font/i.test(l)).slice(-10),
}));
console.log("UNKNOWN FONTS:\n" + st.unknown.join("\n"));
console.log("done");
