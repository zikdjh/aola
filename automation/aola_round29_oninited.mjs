// round29: onInited 修复后重进世界，验证装配是否越过 2/61
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

await page.waitForTimeout(20000);
console.log("t20", await page.screenshot({ path: `${OUT}/r29_world_t20.png` }));
await page.waitForTimeout(30000);
console.log("t50", await page.screenshot({ path: `${OUT}/r29_world_t50.png` }));
await page.waitForTimeout(40000);
console.log("t90", await page.screenshot({ path: `${OUT}/r29_world_t90.png` }));

const st = await page.evaluate(() => ({
  errs: (window.__LOG_LINES || []).filter(l => /%cERROR%|Error #|TypeError/.test(l)).slice(-6),
  tail: (window.__LOG_LINES || []).filter(l => !/login-cmd|device font|audio|warmup|log_adapter|focus_tracker/.test(l)).slice(-10),
}));
console.log("ERRORS:\n" + st.errs.join("\n"));
console.log("TAIL:\n" + st.tail.join("\n"));
console.log("done");
