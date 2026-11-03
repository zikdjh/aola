import { writeFileSync, readFileSync, existsSync } from "node:fs";

const ACC = "26394032";
const PWD = "19811103";

// Step 1: POST normallogin to get the token
const res = await fetch("https://account.100bt.com/game/auth/normallogin.action", {
  method: "POST",
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    Referer: "https://account.100bt.com/game/auth/login.html",
  },
  body: `userName=${ACC}&password=${PWD}&gameId=2&gameName=aola`,
});
const resText = await res.text();
console.log("[login] status:", res.status, "body head:", resText.slice(0, 200));

// Extract token from response (JSON or Set-Cookie)
let token = null;
try {
  const j = JSON.parse(resText);
  token = j.token || j.data?.token;
} catch (e) {}
if (!token) {
  const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  for (const sc of setCookies) {
    const m = sc.match(/game_auth_sid=([^;]+)/);
    if (m) { token = m[1]; break; }
  }
}
if (!token) {
  // Try parsing XML/HTML response for token field
  const m = resText.match(/token[=:"\s]+([A-Za-z0-9+/=_-]{20,})/);
  if (m) token = m[1];
}
console.log("[login] token:", token ? token.slice(0, 30) + "..." : "NOT FOUND");
if (!token) { console.log("[login] full response:", resText.slice(0, 2000)); process.exit(1); }

// Step 2: Import into facade so game.html picks it up on next /login-cmd poll
const imp = await fetch("http://127.0.0.1:8700/import-login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify([{ name: "game_auth_sid", value: token }]),
});
console.log("[import]", await imp.text());
