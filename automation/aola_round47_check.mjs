// round47: 检查页面状态（游戏页是否还在）
const task = await taskSpace("aola-ruffle-battle");
const tabs = await task.tabs();
console.log("tabs:", JSON.stringify(tabs.map(t => ({ label: t.label, url: t.url, title: t.title, active: t.active })), null, 1));
const page = task.page("p1");
console.log("p1 url:", await page.url(), "title:", await page.title());
