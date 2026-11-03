// round83: 复现「角色名显示不完整」——登录页 1:1 截图 + 相关日志
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const OUT = "D:/temp/ZCode/aola/client/docs/spike";
const clip = { x: 240, y: 8, width: 960, height: 560 };
try { await page.cdp("Page.bringToFront", {}); } catch (e) {}

await page.goto("http://127.0.0.1:8700/game");
await page.waitForTimeout(32000);
await page.screenshot({ path: `${OUT}/r83_login.png`, clip });
await page.screenshot({ path: `${OUT}/r83_login_zoom.png`, clip: { x: 240, y: 8, width: 960, height: 300 } });

const st = await page.evaluate(() => ({
  logs: (window.__LOG_LINES || []).filter(l => /AutoLogin|query_role|role|name|font|Font|EI<-/.test(l)).slice(-25),
}));
console.log(st.logs.join("\n"));
console.log("saved");
