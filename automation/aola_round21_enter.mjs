const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
console.log("[1] clicking 进入奥拉星 at (821, 535)...");
await page.mouse.click(821, 535, { label: "进入奥拉星 button" });
await page.waitForTimeout(15000);
const state = await page.evaluate(() => ({
  title: document.title,
  logs: (window.__LOG_LINES || []).filter(l => /ERROR|POST|loading|resolved|EI<-/.test(l)).slice(-20),
  ei: (window.__EI_LOG || []).slice(-10),
  cookie: document.cookie.slice(0, 200),
}));
console.log(JSON.stringify(state, null, 1));
const shot = await page.screenshot({ path: "D:/temp/ZCode/aola/client/docs/spike/round21_after_enter.png" });
console.log("shot:", shot);
