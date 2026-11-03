// round68: 点「去对战空间」进入战斗匹配
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const OUT = "D:/temp/ZCode/aola/client/docs/spike";
try { await page.cdp("Page.bringToFront", {}); } catch (e) {}

await page.mouse.click(805, 263, { label: "click 去对战空间" });
await page.waitForTimeout(10000);
await page.screenshot({ path: `${OUT}/r68_a.png`, clip: { x: 240, y: 8, width: 960, height: 560 } });
await page.waitForTimeout(15000);
await page.screenshot({ path: `${OUT}/r68_b.png`, clip: { x: 240, y: 8, width: 960, height: 560 } });

const st = await page.evaluate(() => ({
  errs: (window.__LOG_LINES || []).filter(l => /%cERROR%/.test(l)).slice(-3).map(l => l.slice(0, 110)),
}));
console.log("ERR:\n" + st.errs.join("\n"));
console.log("saved");
