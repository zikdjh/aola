// round15_check.mjs — 打开游戏页，检查登录 Cookie 状态与 boot 进展
const task = await taskSpace("aola-ruffle-login");
console.log("space:", task.spaceId);
let page = await task.page("p1");
if (!page) { page = await task.newPage(); console.log("new page p1"); }
await page.goto("http://127.0.0.1:8700/game");
await page.waitForFunction(() => window.__LOG_LINES && window.__LOG_LINES.length > 3, undefined, { timeout: 30000 }).catch(() => {});
await new Promise(r => setTimeout(r, 10000));
const cookie = await page.evaluate(() => document.cookie);
const logs = await page.evaluate(() => (window.__LOG_LINES || []).slice(-50).join("\n"));
const title = await page.evaluate(() => document.title);
console.log("TITLE:", title);
console.log("COOKIE:", cookie || "(none)");
console.log("LOGS:\n" + logs);
await page.screenshot({ path: "D:/temp/ZCode/aola/client/docs/spike/round15_boot.png" });
console.log("screenshot saved");
