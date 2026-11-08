// round15_auto_login.mjs — 完整自动登录：
// 1) 裸 POST normallogin → WAF 下发 x-waf-captcha-referer 通行证（60s）
// 2) 带 WAF 通行证 + ywzc 设备 cookie 重放 → 服务器下发组合 game_auth_sid（含新 token）
// 3) 解析 cookie → POST /import-login → game.html 自动注入并重载引导链
const YWZC = "ywzc_UUID=9fa60b8e-cd24-4535-e2ee-2837a415ce22; ywzc_new_UUID=4f1f4c77-7a46-4687-a01b-1108deb0b4f9";
const BODY = "account=26394032&password=bfb5d421cbdd3d1c1c70dcea02d5983f&captcha=&gameId=2&gameName=%E5%A5%A5%E6%8B%89%E6%98%9F&autoLogin=true&nickName=&gameEnName=aola";
const URL = "https://account.100bt.com/game/auth/normallogin.action";
const BASE = {
  "Content-Type": "application/x-www-form-urlencoded",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AolaP0/0.1",
  "Referer": "https://account.100bt.com/game/auth/login.html",
  "Origin": "https://account.100bt.com",
};

// 步骤 1：裸 POST 收集 WAF Set-Cookie
const r1 = await fetch(URL, { method: "POST", headers: BASE, body: BODY });
const waf = (r1.headers.getSetCookie() || [])
  .map(c => c.split(";")[0])
  .filter(kv => /^x-waf-/.test(kv));
await r1.text();
console.log("step1 WAF pass:", waf);

// 步骤 2：带全部 cookie 重放
const cookie = [...waf, YWZC].join("; ");
const r2 = await fetch(URL, { method: "POST", headers: { ...BASE, Cookie: cookie }, body: BODY });
const sc = r2.headers.getSetCookie() || [];
const text = await r2.text();
console.log("step2 status:", r2.status, "setcookies:", sc.length, "body:", text.slice(0, 80));

// 步骤 3：解析 game_auth_sid / his_auth_sid，注入 facade
const jar = sc
  .map(c => {
    const [kv] = c.split(";");
    const i = kv.indexOf("=");
    return { name: kv.slice(0, i), value: kv.slice(i + 1) };
  })
  .filter(c => /auth_sid|web_login_sid/.test(c.name));
if (!jar.length) { console.log("!! no auth cookie — abort"); process.exit(1); }
// Round 70f：网关端口自动选择后，可用第 2 个参数指定目标端口（默认 8700 开发环境）
const GWPORT = Number(process.argv[2] || 8700);
const imp = await fetch("http://127.0.0.1:" + GWPORT + "/import-login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(jar),
});
console.log("import:", JSON.stringify(jar.map(c => c.name)), "->", await imp.text());
console.log("game.html 将在 2s 内注入 Cookie 并重载引导链");
