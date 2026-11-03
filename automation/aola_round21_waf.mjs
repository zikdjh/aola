const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
// Use the browser's fetch (carries all cookies + device fingerprints)
const result = await page.evaluate(async () => {
  const url = "https://account.100bt.com/game/auth/normallogin.action";
  const body = "userName=26394032&password=19811103&gameId=2&gameName=aola";
  // Step 1: bare POST to trigger WAF
  const r1 = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  const t1 = await r1.text();
  const isCap1 = /TencentCaptcha/.test(t1);
  // Step 2: replay (same origin, same cookies -> WAF should pass now)
  const r2 = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  const t2 = await r2.text();
  const cookies = document.cookie;
  return {
    step1: { status: r1.status, isCaptcha: isCap1, head: t1.slice(0, 200) },
    step2: { status: r2.status, isCaptcha: /TencentCaptcha/.test(t2), head: t2.slice(0, 500), setCookie: r2.headers.get("set-cookie") },
    cookies,
  };
});
console.log(JSON.stringify(result, null, 2));
