// round74: 诊断战斗未开始的原因（可见性/资源请求/日志）
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const OUT = "D:/temp/ZCode/aola/client/docs/spike";

const st = await page.evaluate(() => ({
  hidden: document.hidden,
  vis: document.visibilityState,
  urls: ((window.__NET_STATS || {}).urls || []).slice(-30),
  logs: (window.__LOG_LINES || []).filter(l => !/login-cmd|device font|audio|warmup|log_adapter/.test(l)).slice(-15),
  errs: (window.__LOG_LINES || []).filter(l => /%cERROR%/.test(l)).slice(-4).map(l => l.slice(0, 120)),
}));
console.log("hidden:", st.hidden, st.vis);
console.log("LAST URLS:\n" + st.urls.join("\n"));
console.log("LOGS:\n" + st.logs.join("\n"));
console.log("ERRS:\n" + st.errs.join("\n"));
