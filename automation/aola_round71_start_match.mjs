// round71: 点「开始匹配」，等待进入战斗
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const OUT = "D:/temp/ZCode/aola/client/docs/spike";
try { await page.cdp("Page.bringToFront", {}); } catch (e) {}

await page.mouse.click(833, 432, { label: "click 开始匹配" });
console.log("start matching");
for (const t of [10, 20, 30]) {
  await page.waitForTimeout(t * 1000);
  await page.screenshot({ path: `${OUT}/r71_t${t}.png`, clip: { x: 240, y: 8, width: 960, height: 560 } });
}
const st = await page.evaluate(() => ({
  errs: (window.__LOG_LINES || []).filter(l => /%cERROR%/.test(l)).slice(-3).map(l => l.slice(0, 110)),
}));
console.log("ERR:\n" + st.errs.join("\n"));
console.log("saved");
