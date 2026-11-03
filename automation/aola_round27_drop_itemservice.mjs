// round27: ItemService 摘除后进世界，看装配是否越过第 2 项
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
console.log("t25", await page.screenshot({ path: `${OUT}/r27_world_t25.png` }));
await page.waitForTimeout(35000);
console.log("t60", await page.screenshot({ path: `${OUT}/r27_world_t60.png` }));

const st = await page.evaluate(() => ({
  tail: (window.__LOG_LINES || []).filter(l => !/login-cmd|device font|audio|warmup|log_adapter|focus_tracker/.test(l)).slice(-18),
  urls: ((window.__NET_STATS || {}).urls || []).filter(u => !/\.swf$/.test(u) && !/login-cmd/.test(u)).slice(-8),
}));
console.log(st.tail.join("\n"));
console.log("NON-SWF:\n" + st.urls.join("\n"));
console.log("done");
