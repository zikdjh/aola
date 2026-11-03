const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const state = await page.evaluate(() => ({
  title: document.title,
  url: window.location.href.slice(0, 100),
  logs: (window.__LOG_LINES || []).filter(l => /ERROR|loading|resolved|POST/.test(l)).slice(-15),
  cookies: document.cookie.slice(0, 300),
}));
console.log(JSON.stringify(state, null, 1));
