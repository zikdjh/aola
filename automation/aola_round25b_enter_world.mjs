// round25b: 点进入游戏 → 选服 → 快速开始 → 观察世界装配
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const OUT = "D:/temp/ZCode/aola/client/docs/spike";

try { await page.cdp("Page.bringToFront", {}); } catch (e) {}
await page.mouse.click(724, 534, { label: "click enter game" });
await page.waitForTimeout(15000);
console.log("servers", await page.screenshot({ path: `${OUT}/r25b_servers.png` }));

const s1 = await page.evaluate(() => ({
  key: (window.__LOG_LINES || []).filter(l => /newLogin|serverslist|query_role|SOCK|ERROR|FAIL/.test(l)).slice(-12).join("\n"),
  urls: ((window.__NET_STATS || {}).urls || []).filter(u => !/\.swf$/.test(u) && !/login-cmd/.test(u)).slice(-6),
}));
console.log("AFTER-ENTER:\n" + s1.key + "\n" + s1.urls.join("\n"));

await page.mouse.click(712, 521, { label: "click quickstart" });
console.log("quickstart clicked");
await page.waitForTimeout(20000);
console.log("t20", await page.screenshot({ path: `${OUT}/r25b_world_t20.png` }));
await page.waitForTimeout(40000);
console.log("t60", await page.screenshot({ path: `${OUT}/r25b_world_t60.png` }));

const s2 = await page.evaluate(() => ({
  socks: (window.__SOCK_LINES || []).slice(-20),
  key: (window.__LOG_LINES || []).filter(l => /SOCK|ocket|61|ERROR|FAIL|Verify/.test(l)).slice(-25).join("\n"),
}));
console.log("SOCK:\n" + s2.socks.join("\n"));
console.log("KEY:\n" + s2.key);
console.log("done");
