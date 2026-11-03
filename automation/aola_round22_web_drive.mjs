const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
await page.mouse.click(723, 523, { label: "进入游戏" });
await page.waitForTimeout(13000);
const midShot = await page.screenshot({ path: "D:/temp/ZCode/aola/client/docs/spike/round22-web-login.png" });
console.log({ midShot });
await page.mouse.click(723, 522, { label: "快速开始游戏" });
await page.waitForTimeout(30000);
const state = await page.evaluate(() => ({
  title: document.title,
  urls: (window.__NET_STATS ? window.__NET_STATS.urls : []).slice(-100),
  socks: (window.__SOCK_LINES || []).slice(-40),
  logs: (window.__LOG_LINES || []).slice(-45),
}));
console.log(JSON.stringify(state, null, 2));
const shot = await page.screenshot({ path: "D:/temp/ZCode/aola/client/docs/spike/round22-web-world.png" });
console.log({ screenshot: shot });
