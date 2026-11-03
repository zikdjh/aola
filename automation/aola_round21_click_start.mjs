const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
console.log("[1] clicking START GAME at (719, 498)...");
await page.mouse.click(719, 498, { label: "START GAME" });
await page.waitForTimeout(8000);
const state = await page.evaluate(() => ({
  title: document.title,
  hasLoginFrame: !!document.getElementById("loginFrame"),
  loginFrameSrc: (document.getElementById("loginFrame") || {}).src?.slice(0, 100) || "(none)",
  logs: (window.__LOG_LINES || []).filter(l => /EI<-|showWebLogin|loading/.test(l)).slice(-15),
  ei: (window.__EI_LOG || []).slice(-10),
}));
console.log(JSON.stringify(state, null, 1));
const shot = await page.screenshot({ path: "D:/temp/ZCode/aola/client/docs/spike/round21_after_start.png" });
console.log("shot:", shot);
