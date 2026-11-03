// round70: 单亚比对战 → 匹配 → 观察战斗
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const OUT = "D:/temp/ZCode/aola/client/docs/spike";
try { await page.cdp("Page.bringToFront", {}); } catch (e) {}

await page.mouse.click(950, 423, { label: "click 匹配 单亚比" });
console.log("match clicked");
await page.waitForTimeout(12000);
await page.screenshot({ path: `${OUT}/r70_t12.png`, clip: { x: 240, y: 8, width: 960, height: 560 } });
await page.waitForTimeout(20000);
await page.screenshot({ path: `${OUT}/r70_t32.png`, clip: { x: 240, y: 8, width: 960, height: 560 } });
await page.waitForTimeout(25000);
await page.screenshot({ path: `${OUT}/r70_t57.png`, clip: { x: 240, y: 8, width: 960, height: 560 } });

const st = await page.evaluate(() => ({
  errs: (window.__LOG_LINES || []).filter(l => /%cERROR%/.test(l)).slice(-4).map(l => l.slice(0, 110)),
}));
console.log("ERR:\n" + st.errs.join("\n"));
console.log("saved");
