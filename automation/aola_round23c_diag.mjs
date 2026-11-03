// round23c: 诊断 —— 视口/画布几何 + 全量关键日志（过滤噪音）
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");

const geo = await page.evaluate(() => {
  const el = document.querySelector("ruffle-player, iframe, object, embed");
  const r = el ? el.getBoundingClientRect() : null;
  return {
    vw: window.innerWidth, vh: window.innerHeight,
    dpr: window.devicePixelRatio,
    rect: r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null,
    tag: el ? el.tagName : null,
  };
});
console.log("GEO:", JSON.stringify(geo));

const state = await page.evaluate(() => ({
  logsAll: (window.__LOG_LINES || []),
  netAll: window.__NET_STATS ? window.__NET_STATS.urls : [],
}));
const noise = /login-cmd|device font|audio|Audio|FONT/;
console.log("=== KEY LOG LINES ===");
console.log(state.logsAll.filter(l => !noise.test(l)).join("\n"));
console.log("=== NON-SWF URLS ===");
console.log(state.netAll.filter(u => !/\.swf$/.test(u)).join("\n"));
console.log("total logs:", state.logsAll.length, "total urls:", state.netAll.length);
