const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const state = await page.evaluate(() => {
  const urls = window.__NET_STATS ? window.__NET_STATS.urls : [];
  const worldUrls = urls.filter(u => /play|scene|fight|world|battle/i.test(u));
  return {
    totalReqs: urls.length,
    lastNonPoll: urls.filter(u => !u.includes("/login-cmd")).slice(-15),
    worldRelated: worldUrls.slice(-10),
    socks: (window.__SOCK_LINES || []).length,
    allSockLines: (window.__SOCK_LINES || []),
    title: document.title,
  };
});
console.log(JSON.stringify(state, null, 1));
