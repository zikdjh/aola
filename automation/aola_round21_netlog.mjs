const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const state = await page.evaluate(() => {
  const urls = (window.__NET_STATS ? window.__NET_STATS.urls : []);
  const nonLogin = urls.filter(u => !u.includes("/login-cmd"));
  return {
    totalReqs: urls.length,
    recentReqs: nonLogin.slice(-30),
    allLogs: (window.__LOG_LINES || []).slice(-30),
  };
});
console.log(JSON.stringify(state, null, 1));
