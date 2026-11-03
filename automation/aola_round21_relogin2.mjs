const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
// Navigate to official login page
await page.goto("https://account.100bt.com/game/auth/login.html?gameId=2&gameName=aola");
console.log("[0] loading official login...");
await page.waitForTimeout(5000);
// Click 普通登录 tab
await page.evaluate(() => {
  const tabs = [...document.querySelectorAll("a, div, span, li")].filter(el =>
    /普通登录/.test(el.textContent || "") && (el.offsetWidth || el.offsetHeight) &&
    (el.textContent || "").trim().length < 10);
  if (tabs.length) tabs[0].click();
});
await page.waitForTimeout(2000);
// Fill form
console.log("[1] filling form...");
await page.evaluate(() => {
  const acct = document.getElementById("login_duoduoid");
  const pwd = document.getElementById("login_password");
  if (acct && pwd) {
    function setVal(input, v) {
      input.focus(); input.value = v;
      for (const ev of ["input", "change", "keyup", "blur"]) input.dispatchEvent(new Event(ev, { bubbles: true }));
    }
    setVal(acct, "26394032");
    setVal(pwd, "19811103");
  }
});
console.log("[2] clicking login...");
await page.evaluate(() => { const btn = document.querySelector("input[type=submit]"); if (btn) btn.click(); });
await page.waitForTimeout(10000);
// Dismiss password warning
console.log("[3] dismissing warning...");
await page.evaluate(() => {
  const btns = [...document.querySelectorAll("button, a, input, div")].filter(el =>
    /下次再说/.test(el.textContent || el.value || "") && (el.offsetWidth || el.offsetHeight));
  if (btns.length) btns[0].click();
});
await page.waitForTimeout(5000);
// Extract and import token
console.log("[4] importing token...");
const token = await page.evaluate(() => {
  const m = document.cookie.match(/game_auth_sid=([^;]*)/);
  return m ? m[1] : null;
});
console.log("token:", token ? token.slice(0, 60) + "..." : "null");
if (token) {
  const imp = await fetch("http://127.0.0.1:8700/import-login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify([{ name: "game_auth_sid", value: token }]),
  });
  console.log("import:", await imp.text());
}
