const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
await page.goto("http://127.0.0.1:8700/game");
console.log("loading...");
await page.waitForTimeout(30000);
const state = await page.evaluate(() => ({
  title: document.title,
  logs: (window.__LOG_LINES || []).filter(l => /ERROR|loading|resolved/.test(l)).slice(-5),
}));
console.log(JSON.stringify(state, null, 1));
