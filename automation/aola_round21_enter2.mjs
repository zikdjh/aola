const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
console.log("[1] clicking 进入奥拉星...");
await page.mouse.click(821, 560, { label: "进入奥拉星" });
await page.waitForTimeout(15000);
const state = await page.evaluate(() => ({
  title: document.title,
  logs: (window.__LOG_LINES || []).filter(l => /ERROR|POST|loading|EI<-/.test(l)).slice(-20),
}));
console.log(JSON.stringify(state, null, 1));
const shot = await page.screenshot({ path: "D:/temp/ZCode/aola/client/docs/spike/round21_enter2.png" });
console.log("shot:", shot);
