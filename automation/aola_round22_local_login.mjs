const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
await page.mouse.click(811, 524, { label: "duoduo id input" });
await page.keyboard.type("26394032");
await page.waitForTimeout(300);
await page.mouse.click(641, 531, { label: "password input" });
await page.keyboard.type("19811103");
await page.waitForTimeout(300);
await page.mouse.click(821, 560, { label: "enter aola" });
await page.waitForTimeout(12000);
const mid = await page.evaluate(() => ({
  title: document.title,
  socks: (window.__SOCK_LINES || []).slice(-20),
  urls: (window.__NET_STATS ? window.__NET_STATS.urls : []).slice(-40),
}));
console.log(JSON.stringify(mid, null, 2));
await page.waitForTimeout(25000);
const state = await page.evaluate(() => ({
  title: document.title,
  socks: (window.__SOCK_LINES || []).slice(-20),
  urls: (window.__NET_STATS ? window.__NET_STATS.urls : []).slice(-80),
}));
console.log(JSON.stringify(state, null, 2));
const shot = await page.screenshot({ path: "D:/temp/ZCode/aola/client/docs/spike/round22-local-login.png" });
console.log({ screenshot: shot });
