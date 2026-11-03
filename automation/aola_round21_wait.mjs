const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
await page.waitForTimeout(45000);
const state = await page.evaluate(() => ({
  title: document.title,
  net: window.__NET_STATS ? {
    rewritten: window.__NET_STATS.rewritten,
    passthrough: window.__NET_STATS.passthrough,
    totalUrls: window.__NET_STATS.urls.length,
  } : null,
  lastUrls: (window.__NET_STATS ? window.__NET_STATS.urls : []).slice(-30),
  logs: (window.__LOG_LINES || []).filter(l => /EI<-|ERROR|WARN|loading|resolved|FAILED/.test(l)).slice(-40),
  socks: (window.__SOCK_LINES || []).slice(-30),
  eiLog: (window.__EI_LOG || []).slice(-20),
}));
console.log(JSON.stringify(state, null, 2));
