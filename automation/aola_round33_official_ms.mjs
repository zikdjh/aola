// round33: 换成官方最新 materialservice（完整 initItemData）+ 不 drop 任何服务
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
console.log("t25", await page.screenshot({ path: `${OUT}/r33_world_t25.png` }));
await page.waitForTimeout(35000);
console.log("t60", await page.screenshot({ path: `${OUT}/r33_world_t60.png` }));
await page.waitForTimeout(45000);
console.log("t105", await page.screenshot({ path: `${OUT}/r33_world_t105.png` }));

const st = await page.evaluate(() => ({
  errs: (window.__LOG_LINES || []).filter(l => /%cERROR%/.test(l)).slice(-4),
}));
console.log("ERRORS:\n" + st.errs.join("\n"));
console.log("done");
