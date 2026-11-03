// round40: 回退 materialdata + skip 补丁 + 三服务摘除，最终验证
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const OUT = "D:/temp/ZCode/aola/client/docs/spike";
try { await page.cdp("Page.bringToFront", {}); } catch (e) {}

await page.goto("http://127.0.0.1:8700/game");
await page.waitForTimeout(32000);
await page.mouse.click(724, 534, { label: "click enter game" });
await page.waitForTimeout(15000);
await page.mouse.click(712, 521, { label: "click quickstart" });
console.log("quickstart clicked");

await page.waitForTimeout(30000);
console.log("t30", await page.screenshot({ path: `${OUT}/r40_world_t30.png` }));
await page.waitForTimeout(45000);
console.log("t75", await page.screenshot({ path: `${OUT}/r40_world_t75.png` }));
await page.waitForTimeout(50000);
console.log("t125", await page.screenshot({ path: `${OUT}/r40_world_t125.png` }));

const st = await page.evaluate(() => ({
  errs: (window.__LOG_LINES || []).filter(l => /%cERROR%/.test(l)).slice(-4),
}));
console.log("ERRORS:\n" + st.errs.join("\n"));
console.log("done");
