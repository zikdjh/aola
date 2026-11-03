// round23f: 回到 11-01 跑通的 aola-ruffle-login space，重打票 + 复刻 round15 驱动
const task = await taskSpace("aola-ruffle-login");
let page;
const tabs = await task.tabs();
console.log("tabs:", JSON.stringify(tabs.map(t => ({ label: t.label, url: t.url, active: t.active }))));
page = task.page("p1");
try { await page.cdp("Page.bringToFront", {}); } catch (e) {}

// 1) 重新导入新鲜票据（facade 会注入 Cookie）
const YWZC = "ywzc_UUID=9fa60b8e-cd24-4535-e2ee-2837a415ce22; ywzc_new_UUID=4f1f4c77-7a46-4687-a01b-1108deb0b4f9";
const BODY = "account=26394032&password=bfb5d421cbdd3d1c1c70dcea02d5983f&captcha=&gameId=2&gameName=%E5%A5%A5%E6%8B%89%E6%98%9F&autoLogin=true&nickName=&gameEnName=aola";
const URL = "https://account.100bt.com/game/auth/normallogin.action";
const BASE = {
  "Content-Type": "application/x-www-form-urlencoded",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AolaP0/0.1",
  "Referer": "https://account.100bt.com/game/auth/login.html",
  "Origin": "https://account.100bt.com",
};
const r1 = await fetch(URL, { method: "POST", headers: BASE, body: BODY });
const waf = (r1.headers.getSetCookie() || []).map(c => c.split(";")[0]).filter(kv => /^x-waf-/.test(kv));
await r1.text();
const r2 = await fetch(URL, { method: "POST", headers: { ...BASE, Cookie: waf.join("; ") + "; " + YWZC }, body: BODY });
const sc = r2.headers.getSetCookie() || [];
await r2.text();
const jar = sc.map(c => { const [kv] = c.split(";"); const i = kv.indexOf("="); return { name: kv.slice(0, i), value: kv.slice(i + 1) }; })
  .filter(c => /auth_sid|web_login_sid/.test(c.name));
console.log("jar:", JSON.stringify(jar.map(c => c.name)));
const imp = await fetch("http://127.0.0.1:8700/import-login", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(jar),
});
console.log("import:", await imp.text());

// 2) 重载引导链，等 32s
await page.goto("http://127.0.0.1:8700/game?via=web");
await page.waitForTimeout(32000);
const OUT = "D:/temp/ZCode/aola/client/docs/spike";
console.log(await page.screenshot({ path: `${OUT}/r23f_t32.png` }));

// 3) round15 配方两次点击
await page.mouse.click(723, 523, { label: "click 1" });
await page.waitForTimeout(13000);
console.log(await page.screenshot({ path: `${OUT}/r23f_t45.png` }));
await page.mouse.click(723, 522, { label: "click 2" });
await page.waitForTimeout(25000);

const st = await page.evaluate(() => ({
  key: (window.__LOG_LINES || []).filter(l => /newLogin|AutoLogin|serverslist|query_role|SOCK|ocket connect|ERROR|FAIL/i.test(l)).slice(-30).join("\n"),
  socks: (window.__SOCK_LINES || []).slice(-20),
}));
console.log("KEY:\n" + st.key);
console.log("SOCK:\n" + st.socks.join("\n"));
console.log(await page.screenshot({ path: `${OUT}/r23f_final.png` }));
console.log("done");
