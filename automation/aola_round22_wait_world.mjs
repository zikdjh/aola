const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
await page.waitForTimeout(40000);
const state = await page.evaluate(() => ({
  title: document.title,
  socks: (window.__SOCK_LINES || []).slice(-20),
  netUrls: (window.__NET_STATS ? window.__NET_STATS.urls : []).slice(-40),
  netCount: window.__NET_STATS ? window.__NET_STATS.rewritten || 0 : 0,
  log: (window.__LOGS || []).slice(-30),
}));
console.log(JSON.stringify(state, null, 2));
const shot = await page.screenshot({ path: "D:/temp/ZCode/aola/client/docs/spike/round22-world.png" });
console.log({ screenshot: shot });
