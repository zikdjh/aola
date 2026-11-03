const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
console.log("url:", await page.url());
console.log("title:", await page.title());
const state = await page.evaluate(() => ({
  hasPlayer: !!document.getElementById("player"),
  hasLoginFrame: !!document.getElementById("loginFrame"),
  bodyChildren: [...document.body.children].map(c => c.tagName + "#" + c.id).slice(0, 10),
  logs: (window.__LOG_LINES || []).length,
  title: document.title,
}));
console.log(JSON.stringify(state, null, 1));
