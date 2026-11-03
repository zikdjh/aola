const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
// Navigate to the official login page
await page.goto("https://account.100bt.com/game/auth/login.html?gameId=2&gameName=aola");
console.log("[0] loading official login page...");
await page.waitForTimeout(5000);
const probe = await page.evaluate(() => ({
  title: document.title,
  url: window.location.href,
  inputs: [...document.querySelectorAll("input")].map(i => ({ type: i.type, name: i.name || "", id: i.id || "", vis: !!(i.offsetWidth || i.offsetHeight) })),
  btns: [...document.querySelectorAll("button, input[type=submit], a.btn")].filter(el => (el.offsetWidth || el.offsetHeight)).map(el => ({ tag: el.tagName, txt: (el.textContent || el.value || "").trim().slice(0, 20) })),
}));
console.log("PROBE:", JSON.stringify(probe, null, 1));
