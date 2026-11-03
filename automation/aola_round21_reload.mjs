const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
await page.goto("http://127.0.0.1:8700/game");
console.log("reloaded, url:", await page.url());
await page.waitForTimeout(8000);
const state = await page.evaluate(() => ({
  title: document.title,
  logs: (window.__LOG_LINES || []).slice(-5),
}));
console.log(JSON.stringify(state, null, 1));
