// round23e: 抓真实 cookie 值 + facade 侧状态
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const c = await page.evaluate(() => document.cookie);
console.log("COOKIE RAW:", c);

// facade /import-login 状态
const st = await page.fetch("http://127.0.0.1:8700/status").then(r => r.text());
console.log("STATUS:", st);
