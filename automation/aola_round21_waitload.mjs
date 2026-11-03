const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
console.log("waiting 60s for world resources to load...");
await page.waitForTimeout(60000);
const state = await page.evaluate(() => ({
  socks: (window.__SOCK_LINES || []).slice(-10),
  netReqs: window.__NET_STATS ? window.__NET_STATS.urls.length : 0,
  title: document.title,
}));
console.log(JSON.stringify(state, null, 1));
