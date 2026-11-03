// round119: 接管任务空间 → 重载 → 进世界 → 开背包，检查魂卡战力与报错
const spaces = await listTaskSpaces();
const target = spaces.find(s => s.name === "aola-ruffle-battle");
console.log("spaces:", JSON.stringify(spaces.map(s => ({ id: s.id, name: s.name, ownership: s.ownership }))));
if (!target) throw new Error("space not found");
const task = await takeOverTaskSpace(target.id);
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
await page.waitForTimeout(90000);
rect = await page.evaluate(() => document.getElementById("stage").getBoundingClientRect().toJSON());
await page.screenshot({ path: `${OUT}/r119_world.png`, clip: { x: rect.x, y: rect.y, width: 960, height: 560 } });
await clickStage(925, 525, "click pet backpack");
await page.waitForTimeout(12000);
await page.screenshot({ path: `${OUT}/r119_bag.png`, clip: { x: rect.x, y: rect.y, width: 960, height: 560 } });
await page.screenshot({ path: `${OUT}/r119_attrs.png`, clip: { x: rect.x + 540, y: rect.y + 130, width: 400, height: 160 } });
const st = await page.evaluate(() => {
  const L = window.__LOG_LINES || [];
  const errs = L.filter(l => /%cERROR%|Error #|没有 |1009|1063|1065/i.test(l)).map(l => l.replace(/\s*color:.*$/, "").slice(0, 180));
  return { n: errs.length, errs: errs.slice(-14) };
});
console.log("ERR count:", st.n);
console.log(st.errs.join("\n"));
console.log("done");
