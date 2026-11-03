// round24c: 在 SWF 登录表单内填多号+密码并点“进入奥拉星”
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const OUT = "D:/temp/ZCode/aola/client/docs/spike";
try { await page.cdp("Page.bringToFront", {}); } catch (e) {}

await page.goto("http://127.0.0.1:8700/game");
await page.waitForTimeout(28000);

// 多号输入框（画布 240,8 960x560）
await page.mouse.click(854, 504, { label: "focus account field" });
await page.waitForTimeout(600);
await page.keyboard.type("26394032", { delay: 120 });
await page.waitForTimeout(1500);
console.log("shot-acct", await page.screenshot({ path: `${OUT}/r24c_acct.png` }));

// 密码输入框
await page.mouse.click(640, 505, { label: "focus password field" });
await page.waitForTimeout(600);
await page.keyboard.type("19811103", { delay: 150 });
await page.waitForTimeout(1500);
console.log("shot-pwd", await page.screenshot({ path: `${OUT}/r24c_pwd.png` }));

// 进入奥拉星
await page.mouse.click(669, 545, { label: "click enter aola" });
await page.waitForTimeout(15000);
console.log("shot-enter", await page.screenshot({ path: `${OUT}/r24c_enter.png` }));

const st = await page.evaluate(() => ({
  key: (window.__LOG_LINES || []).filter(l => /newLogin|query_role|serverslist|SOCK|ocket|ERROR|FAIL|normallogin|EI<-/.test(l)).slice(-30).join("\n"),
  urls: ((window.__NET_STATS || {}).urls || []).filter(u => !/\.swf$/.test(u) && !/login-cmd/.test(u)),
}));
console.log("KEY:\n" + st.key);
console.log("NON-SWF:\n" + st.urls.join("\n"));
console.log("done");
