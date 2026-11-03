const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
console.log("waiting 40s for game world...");
await page.waitForTimeout(40000);
const state = await page.evaluate(() => ({
  socks: (window.__SOCK_LINES || []).slice(-20),
  logs: (window.__LOG_LINES || []).filter(l => /ERROR|WARN|error/i.test(l)).slice(-20),
  netReqs: window.__NET_STATS ? window.__NET_STATS.urls.length : 0,
  title: document.title,
}));
console.log(JSON.stringify(state, null, 1));
