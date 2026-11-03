// round48: 重新进入世界（自动登录 → 选服 → 快速开始 → 等世界）
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const OUT = "D:/temp/ZCode/aola/client/docs/spike";
try { await page.cdp("Page.bringToFront", {}); } catch (e) {}

await page.goto("http://127.0.0.1:8700/game");
await page.waitForTimeout(30000);
console.log("t30", await page.screenshot({ path: `${OUT}/r48_t30.png` }));

const cookieOk = await page.evaluate(() => /game_auth_sid=.*token=/.test(document.cookie));
console.log("cookie ok:", cookieOk);

await page.mouse.click(724, 534, { label: "click enter game" });
await page.waitForTimeout(14000);
console.log("servers", await page.screenshot({ path: `${OUT}/r48_servers.png` }));

await page.mouse.click(712, 521, { label: "click quickstart" });
console.log("quickstart clicked");
await page.waitForTimeout(90000);
console.log("world", await page.screenshot({ path: `${OUT}/r48_world.png` }));

const st = await page.evaluate(() => ({
  errs: (window.__LOG_LINES || []).filter(l => /%cERROR%/.test(l)).slice(-2).map(l => l.slice(0, 90)),
}));
console.log("ERR:\n" + st.errs.join("\n"));
console.log("done");
