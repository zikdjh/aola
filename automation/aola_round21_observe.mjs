const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
await page.waitForTimeout(30000);
const title = await page.title();
const state = await page.evaluate(() => ({
  title: document.title,
  netStats: window.__NET_STATS ? {
    rewritten: window.__NET_STATS.rewritten,
    passthrough: window.__NET_STATS.passthrough,
    urls: window.__NET_STATS.urls.length,
  } : null,
  logLines: (window.__LOG_LINES || []).slice(-40),
  sockLines: (window.__SOCK_LINES || []).slice(-20),
}));
const shot = await page.screenshot({ path: "D:/temp/ZCode/aola/client/docs/spike/round21_boot.png" });
console.log({ title, state, shot });
