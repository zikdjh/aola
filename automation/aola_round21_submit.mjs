const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
console.log("[1] filling login form...");
const fill = await page.evaluate(() => {
  const acct = document.getElementById("login_duoduoid");
  const pwd = document.getElementById("login_password");
  if (!acct || !pwd) return { err: "inputs gone" };
  function setVal(input, v) {
    input.focus();
    input.value = v;
    for (const ev of ["input", "change", "keyup", "blur"]) {
      input.dispatchEvent(new Event(ev, { bubbles: true }));
    }
  }
  setVal(acct, "26394032");
  setVal(pwd, "19811103");
  return { acct: acct.value, pwdLen: pwd.value.length };
});
console.log("FILL:", JSON.stringify(fill));
console.log("[2] clicking login button...");
await page.evaluate(() => {
  const btn = document.querySelector("input[type=submit]");
  if (btn) btn.click();
});
await page.waitForTimeout(15000);
const after = await page.evaluate(() => ({
  title: document.title,
  url: window.location.href.slice(0, 150),
  cookies: document.cookie.slice(0, 300),
}));
console.log("AFTER:", JSON.stringify(after, null, 1));
const shot = await page.screenshot({ path: "D:/temp/ZCode/aola/client/docs/spike/round21_official_result.png" });
console.log("shot:", shot);
