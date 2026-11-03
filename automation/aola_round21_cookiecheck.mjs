const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const state = await page.evaluate(() => ({
  title: document.title,
  cookies: document.cookie.slice(0, 500),
  hasLoginFrame: !!document.getElementById("loginFrame"),
  logs: (window.__LOG_LINES || []).filter(l => /cookie|Cookie|EI<-/.test(l)).slice(-15),
}));
console.log(JSON.stringify(state, null, 1));
