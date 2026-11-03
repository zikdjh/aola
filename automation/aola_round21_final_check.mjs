const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
console.log("waiting 30s...");
await page.waitForTimeout(30000);
const state = await page.evaluate(() => {
  const urls = window.__NET_STATS ? window.__NET_STATS.urls : [];
  const nonPoll = urls.filter(u => !u.includes("/login-cmd"));
  // Look for world/scene/fight specific resources that load after entering the game world
  const worldIndicators = nonPoll.filter(u => /scene|fight|battle|world|map|room/i.test(u));
  return {
    totalReqs: urls.length,
    totalNonPoll: nonPoll.length,
    lastReqs: nonPoll.slice(-10),
    worldCount: worldIndicators.length,
    worldRecent: worldIndicators.slice(-10),
    socks: (window.__SOCK_LINES || []).length,
    title: document.title,
  };
});
console.log(JSON.stringify(state, null, 1));
