// round26: socket debug 开启下完整进世界，抓分发日志
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const OUT = "D:/temp/ZCode/aola/client/docs/spike";
try { await page.cdp("Page.bringToFront", {}); } catch (e) {}

await page.goto("http://127.0.0.1:8700/game");
await page.waitForTimeout(32000);
console.log("auto-login page:", await page.screenshot({ path: `${OUT}/r26_t32.png` }));

await page.mouse.click(724, 534, { label: "click enter game" });
await page.waitForTimeout(15000);
console.log("servers:", await page.screenshot({ path: `${OUT}/r26_servers.png` }));

await page.mouse.click(712, 521, { label: "click quickstart" });
console.log("quickstart clicked");
await page.waitForTimeout(45000);
console.log("world:", await page.screenshot({ path: `${OUT}/r26_world.png` }));

const st = await page.evaluate(() => ({
  total: (window.__LOG_LINES || []).length,
  tail: (window.__LOG_LINES || []).filter(l => !/login-cmd|device font|audio|warmup|log_adapter/.test(l)).slice(-70),
}));
console.log("total logs:", st.total);
console.log(st.tail.join("\n"));
console.log("done");
