// round15_login2.mjs — 点击 loginBtn 提交登录，等待结果
const task = await taskSpace("aola-ruffle-login");
const page = await task.page("p1");
try { await page.cdp("Page.bringToFront", {}); } catch (e) {}
const r = await page.evaluate(() => {
  const d = document.getElementById("loginFrame").contentDocument;
  const btn = d.querySelector("input.loginBtn") || d.querySelector("input[type=submit]");
  if (!btn) return { err: "no submit btn" };
  btn.click();
  return { clicked: true, formAction: btn.form ? btn.form.action.slice(0, 80) : "?" };
});
console.log("CLICK:", JSON.stringify(r));
await new Promise(res => setTimeout(res, 15000));
const after = await page.evaluate(() => ({
  title: document.title,
  cookie: document.cookie.slice(0, 200),
  frameUrl: (document.getElementById("loginFrame") || {}).src || "(frame gone)",
  logs: (window.__LOG_LINES || []).slice(-12).join("\n"),
}));
console.log("AFTER:", JSON.stringify(after, null, 1));
await page.screenshot({ path: "D:/temp/ZCode/aola/client/docs/spike/round15_after_login2.png" });
console.log("screenshot saved");
