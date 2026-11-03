// round36: 跳过缺失物品补丁验证（官方最新 materialservice + 最新 materialdata，无 drop）
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

await page.waitForTimeout(25000);
console.log("t25", await page.screenshot({ path: `${OUT}/r36_world_t25.png` }));
await page.waitForTimeout(40000);
console.log("t65", await page.screenshot({ path: `${OUT}/r36_world_t65.png` }));
await page.waitForTimeout(50000);
console.log("t115", await page.screenshot({ path: `${OUT}/r36_world_t115.png` }));

const st = await page.evaluate(() => ({
  errs: (window.__LOG_LINES || []).filter(l => /%cERROR%|VerifyError/.test(l)).slice(-5),
}));
console.log("ERRORS:\n" + st.errs.join("\n"));
console.log("done");
