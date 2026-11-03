// round15_state.mjs — 检查注入后的引导状态并截图
const task = await taskSpace("aola-ruffle-login");
const page = await task.page("p1");
try { await page.cdp("Page.bringToFront", {}); } catch (e) {}
await new Promise(r => setTimeout(r, 22000));
const st = await page.evaluate(() => ({
  title: document.title,
  cookie: document.cookie.slice(0, 100),
  newLogin: (window.__LOG_LINES || []).filter(l => /newLogin|AutoLogin|serverslist|socket|query_role|ERROR|FAIL/i.test(l)).slice(-12).join("\n"),
  tail: (window.__LOG_LINES || []).slice(-6).join("\n"),
}));
console.log("TITLE:", st.title);
console.log("COOKIE:", st.cookie);
console.log("KEY LOGS:\n" + st.newLogin);
console.log("TAIL:\n" + st.tail);
await page.screenshot({ path: "D:/temp/ZCode/aola/client/docs/spike/round15_state.png" });
console.log("screenshot saved");
