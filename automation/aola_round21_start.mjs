const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
// The START GAME button in the Flash canvas, bottom-right of 960x560 stage
// Stage starts around x=750, y=80 on screen; within stage ~x=780, y=450
const stageX = 750;
const stageY = 80;
await page.mouse.click(stageX + 780, stageY + 450, { label: "click START GAME button" });
await page.waitForTimeout(5000);
const state = await page.evaluate(() => ({
  title: document.title,
  logs: (window.__LOG_LINES || []).slice(-20),
  ei: (window.__EI_LOG || []).slice(-10),
  loginFrame: !!document.getElementById("loginFrame"),
}));
console.log(JSON.stringify(state, null, 2));
