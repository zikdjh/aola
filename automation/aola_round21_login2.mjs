const ACC = "26394032";
const PWD = "19811103";

// Step 1: bare POST to trigger WAF and get the captcha-referer pass
const url = "https://account.100bt.com/game/auth/normallogin.action";
const body = `userName=${ACC}&password=${PWD}&gameId=2&gameName=aola`;
const baseHeaders = {
  "Content-Type": "application/x-www-form-urlencoded",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Referer: "https://account.100bt.com/game/auth/login.html",
  Origin: "https://account.100bt.com",
};

console.log("[step1] bare POST (trigger WAF)...");
const r1 = await fetch(url, { method: "POST", headers: baseHeaders, body });
const wafReferer = r1.headers.get("x-waf-captcha-referer");
const r1Text = await r1.text();
console.log("[step1] status:", r1.status, "isCaptcha:", /TencentCaptcha/.test(r1Text));
console.log("[step1] x-waf-captcha-referer:", wafReferer ? wafReferer.slice(0, 50) + "..." : "null");
console.log("[step1] all headers:", [...r1.headers.entries()].map(([k,v]) => k).join(", "));

if (!wafReferer) {
  console.log("[step1] no WAF referer header. Response:", r1Text.slice(0, 300));
}

// Generate device UUIDs (fake but stable)
const ywzcUUID = "b1c2d3e4-f5a6-7890-abcd-ef1234567890";
const ywzcNewUUID = ywzcUUID;

// Step 2: replay with WAF pass + device IDs
console.log("[step2] replay with WAF pass...");
const headers2 = {
  ...baseHeaders,
  ...(wafReferer ? { "x-waf-captcha-referer": wafReferer } : {}),
  Cookie: `ywzc_UUID=${ywzcUUID}; ywzc_new_UUID=${ywzcNewUUID}`,
};
const r2 = await fetch(url, { method: "POST", headers: headers2, body });
const r2Text = await r2.text();
console.log("[step2] status:", r2.status, "isCaptcha:", /TencentCaptcha/.test(r2Text));
console.log("[step2] body head:", r2Text.slice(0, 300));
const setCookies = r2.headers.getSetCookie ? r2.headers.getSetCookie() : [];
console.log("[step2] setCookies:", setCookies.map(s => s.slice(0, 80)));

// Check for game_auth_sid
const sidCookie = setCookies.find(s => s.startsWith("game_auth_sid="));
if (sidCookie) {
  const val = sidCookie.split(";")[0].split("=").slice(1).join("=");
  console.log("[step2] TOKEN FOUND:", val.slice(0, 60) + "...");
  // Import into facade
  const imp = await fetch("http://127.0.0.1:8700/import-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify([{ name: "game_auth_sid", value: val }]),
  });
  console.log("[import]", await imp.text());
} else {
  console.log("[step2] no game_auth_sid in response");
}
