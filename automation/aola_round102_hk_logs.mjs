// round102: 拉取本次会话里 HK / 没有 / 背包 相关日志
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const lines = await page.evaluate(() => (window.__LOG_LINES || []).filter(l =>
  /HK|hk|没有|PetPackage|背包/i.test(l) && !/login-cmd|petUIservice|hkbuff|hkview|hk_panel|hkcommonview/i.test(l)).slice(-60));
console.log(lines.join("\n") || "(none)");
