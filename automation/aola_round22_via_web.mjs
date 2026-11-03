const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
await page.goto("http://127.0.0.1:8700/game?via=web");
await page.waitForTimeout(30000);
const state = await page.evaluate(() => ({
  title: document.title,
  url: location.href,
  urls: (window.__NET_STATS ? window.__NET_STATS.urls : []).slice(-80),
  socks: (window.__SOCK_LINES || []).slice(-20),
  logs: (window.__LOG_LINES || []).slice(-35),
}));
console.log(JSON.stringify(state, null, 2));
const shot = await page.screenshot({ path: "D:/temp/ZCode/aola/client/docs/spike/round22-via-web.png" });
console.log({ screenshot: shot });
