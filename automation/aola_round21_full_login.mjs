const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
await page.goto("http://127.0.0.1:8700/game");
console.log("[0] booting...");
await page.waitForTimeout(25000);

// Click START GAME
console.log("[1] clicking START GAME...");
await page.mouse.click(719, 498, { label: "START GAME" });
await page.waitForTimeout(8000);

// Click 进入奥拉星
console.log("[2] clicking 进入奥拉星...");
await page.mouse.click(821, 535, { label: "进入奥拉星" });
await page.waitForTimeout(15000);

const state = await page.evaluate(() => ({
  title: document.title,
  logs: (window.__LOG_LINES || []).filter(l => /ERROR|POST|loading|EI<-/.test(l)).slice(-25),
}));
console.log(JSON.stringify(state, null, 1));
const shot = await page.screenshot({ path: "D:/temp/ZCode/aola/client/docs/spike/round21_full_login.png" });
console.log("shot:", shot);
