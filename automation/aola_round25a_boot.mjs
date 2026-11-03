// round25a: isWebLogin=true 下重走自动登录，先看 30s 后的界面
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const OUT = "D:/temp/ZCode/aola/client/docs/spike";
try { await page.cdp("Page.bringToFront", {}); } catch (e) {}

await page.goto("http://127.0.0.1:8700/game");
await page.waitForTimeout(32000);
console.log("shot", await page.screenshot({ path: `${OUT}/r25a_t32.png` }));

const st = await page.evaluate(() => ({
  key: (window.__LOG_LINES || []).filter(l => /EI<-|newLogin|query_role|serverslist|AutoLogin|SOCK|ERROR|FAIL/.test(l)).slice(-25).join("\n"),
  urls: ((window.__NET_STATS || {}).urls || []).filter(u => !/\.swf$/.test(u) && !/login-cmd/.test(u)),
}));
console.log("KEY:\n" + st.key);
console.log("NON-SWF:\n" + st.urls.join("\n"));
console.log("done");
