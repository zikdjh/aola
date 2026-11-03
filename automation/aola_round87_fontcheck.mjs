// round87: 检查 fontSources 是否被 Ruffle 拉取
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const u = await page.evaluate(() => ((window.__NET_STATS || {}).urls || []).filter(x => /font/i.test(x)));
console.log("font urls:", JSON.stringify(u, null, 1));
const cfg = await page.evaluate(() => {
  const c = (window.RufflePlayer && window.RufflePlayer.config) || {};
  return { keys: Object.keys(c), fontSources: c.fontSources, ver: window.RufflePlayer.version };
});
console.log("config:", JSON.stringify(cfg));
