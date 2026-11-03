const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const title = await page.title();
const state = await page.evaluate(() => ({
  title: document.title,
  net: window.__NET_STATS ? {
    rewritten: window.__NET_STATS.rewritten,
    passthrough: window.__NET_STATS.passthrough,
    urls: window.__NET_STATS.urls.length,
    lastUrls: window.__NET_STATS.urls.slice(-20),
  } : null,
  logs: (window.__LOG_LINES || []).slice(-60),
  socks: (window.__SOCK_LINES || []).slice(-30),
}));
console.log({ title, state });
