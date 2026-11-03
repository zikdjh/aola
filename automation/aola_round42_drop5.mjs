// round42: 五服务摘除后验证世界是否可进
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

await page.waitForTimeout(35000);
console.log("t35", await page.screenshot({ path: `${OUT}/r42_world_t35.png` }));
await page.waitForTimeout(50000);
console.log("t85", await page.screenshot({ path: `${OUT}/r42_world_t85.png` }));

const st = await page.evaluate(() => ({
  errs: (window.__LOG_LINES || []).filter(l => /%cERROR%/.test(l)).slice(-3),
}));
console.log("ERRORS:\n" + st.errs.join("\n"));
console.log("done");
