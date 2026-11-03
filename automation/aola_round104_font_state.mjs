// round104: 查 Ruffle 字体加载日志与 deviceFontRenderer 配置
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const st = await page.evaluate(() => ({
  loaded: (window.__LOG_LINES || []).filter(l => /Loaded|font|Font/.test(l) && !/login-cmd|audio/i.test(l)).map(l => l.replace(/\s*color:.*$/, "").slice(0, 180)).slice(-40),
  cfg: (() => { try { return JSON.stringify(window.RufflePlayer && window.RufflePlayer.config || {}); } catch (e) { return String(e); } })(),
}));
console.log("LOGS:\n" + st.loaded.join("\n"));
console.log("CONFIG:\n" + st.cfg.slice(0, 600));
