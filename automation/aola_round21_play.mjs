const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
await page.goto("http://127.0.0.1:8700/game");
console.log("[0] booting game...");
await page.waitForTimeout(25000);
const state = await page.evaluate(() => ({
  title: document.title,
  cookie: document.cookie.slice(0, 200),
  logs: (window.__LOG_LINES || []).filter(l => /ERROR|EI<-|loading|resolved|cookie/.test(l)).slice(-25),
}));
console.log(JSON.stringify(state, null, 1));
const shot = await page.screenshot({ path: "D:/temp/ZCode/aola/client/docs/spike/round21_play.png" });
console.log("shot:", shot);
