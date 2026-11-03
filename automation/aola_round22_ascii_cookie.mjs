const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const cookie = await page.evaluate(() => document.cookie);
const token = (cookie.match(/token=([A-Za-z0-9]+)/) || [])[1];
if (!token) throw new Error("no token");
await page.evaluate((tok) => {
  document.cookie = "game_auth_sid=gameId=2,gameName=%E5%A5%A5%E6%8B%89%E6%98%9F," +
    "duoduoId=26394032,token=" + tok + ",autoLogin=true; path=/";
  location.reload();
}, token);
await page.waitForTimeout(30000);
const state = await page.evaluate(() => ({
  title: document.title,
  cookie: document.cookie,
  urls: (window.__NET_STATS ? window.__NET_STATS.urls : []).slice(-70),
  socks: (window.__SOCK_LINES || []).slice(-20),
}));
console.log(JSON.stringify(state, null, 2));
const shot = await page.screenshot({ path: "D:/temp/ZCode/aola/client/docs/spike/round22-ascii-cookie.png" });
console.log({ screenshot: shot });
