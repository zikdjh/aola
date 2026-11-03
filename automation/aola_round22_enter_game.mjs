const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
await page.mouse.click(821, 560, { label: "进入奥拉星" });
await page.waitForTimeout(5000);
const mid = await page.evaluate(() => ({
  title: document.title,
  cookies: document.cookie,
  socks: (window.__SOCK_LINES || []).slice(-10),
  urls: (window.__NET_STATS ? window.__NET_STATS.urls : []).slice(-25),
}));
console.log(JSON.stringify(mid, null, 2));
await page.waitForTimeout(35000);
const state = await page.evaluate(() => ({
  title: document.title,
  socks: (window.__SOCK_LINES || []).slice(-20),
  urls: (window.__NET_STATS ? window.__NET_STATS.urls : []).slice(-60),
}));
console.log(JSON.stringify(state, null, 2));
const shot = await page.screenshot({ path: "D:/temp/ZCode/aola/client/docs/spike/round22-enter.png" });
console.log({ screenshot: shot });
