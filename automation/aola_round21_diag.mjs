const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const state = await page.evaluate(() => {
  const urls = window.__NET_STATS ? window.__NET_STATS.urls : [];
  // Find index of play.swf request
  const playIdx = urls.findIndex(u => u.includes("play~") || u.endsWith("play.swf"));
  const after = playIdx >= 0 ? urls.slice(playIdx) : [];
  const uniqueAfter = [...new Set(after)];
  return {
    total: urls.length,
    playIdx,
    afterPlayTotal: after.length,
    afterPlayUnique: uniqueAfter.length,
    afterPlayList: uniqueAfter.slice(0, 30),
    sockCount: (window.__SOCK_LINES || []).length,
  };
});
console.log(JSON.stringify(state, null, 1));
