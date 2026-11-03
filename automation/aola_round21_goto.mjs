const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
await page.goto("http://127.0.0.1:8700/game");
console.log("navigating...");
await page.waitForTimeout(25000);
const state = await page.evaluate(() => ({
  title: document.title,
  url: window.location.href,
  logs: (window.__LOG_LINES || []).filter(l => /loading|resolved|ERROR/.test(l)).slice(-5),
}));
console.log(JSON.stringify(state, null, 1));
const shot = await page.screenshot({ path: "D:/temp/ZCode/aola/client/docs/spike/round21_goto.png" });
console.log("shot:", shot);
