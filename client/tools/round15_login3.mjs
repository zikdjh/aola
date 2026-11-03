// round15_login3.mjs — 真实鼠标点击登录按钮
const task = await taskSpace("aola-ruffle-login");
const page = await task.page("p1");
try { await page.cdp("Page.bringToFront", {}); } catch (e) {}
await page.mouse.click(657, 403, { label: "click login button" });
console.log("mouse clicked @657,403");
await new Promise(res => setTimeout(res, 15000));
const after = await page.evaluate(() => ({
  title: document.title,
  cookie: document.cookie.slice(0, 200),
  frameUrl: ((document.getElementById("loginFrame") || {}).src || "(frame gone)").slice(0, 120),
  logs: (window.__LOG_LINES || []).slice(-10).join("\n"),
}));
console.log("AFTER:", JSON.stringify(after, null, 1));
await page.screenshot({ path: "D:/temp/ZCode/aola/client/docs/spike/round15_after_login3.png" });
console.log("screenshot saved");
