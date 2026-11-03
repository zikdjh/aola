const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
console.log("waiting 30s for world assembly...");
await page.waitForTimeout(30000);
const state = await page.evaluate(() => ({
  socks: (window.__SOCK_LINES || []).slice(-15),
  logs: (window.__LOG_LINES || []).filter(l => /ERROR|WARN|socket|connect/i.test(l)).slice(-15),
  netReqs: window.__NET_STATS ? window.__NET_STATS.urls.length : 0,
  recentUrls: window.__NET_STATS ? window.__NET_STATS.urls.filter(u => !u.includes("login-cmd")).slice(-10) : [],
}));
console.log(JSON.stringify(state, null, 1));
