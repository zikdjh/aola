const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
// Click 普通登录 tab
console.log("[1] clicking 普通登录 tab...");
const clicked = await page.evaluate(() => {
  const tabs = [...document.querySelectorAll("a, div, span, li")].filter(el =>
    /普通登录/.test(el.textContent || "") && (el.offsetWidth || el.offsetHeight) &&
    (el.textContent || "").trim().length < 10);
  if (!tabs.length) return { err: "no tab" };
  tabs[0].click();
  return { clicked: tabs[0].tagName + "." + String(tabs[0].className).slice(0, 40), txt: tabs[0].textContent.trim() };
});
console.log("CLICK:", JSON.stringify(clicked));
await page.waitForTimeout(2000);
const probe = await page.evaluate(() => ({
  inputs: [...document.querySelectorAll("input")].filter(i => (i.offsetWidth || i.offsetHeight)).map(i => ({ type: i.type, name: i.name || "", id: i.id || "", ph: i.placeholder || "" })),
  btns: [...document.querySelectorAll("input[type=submit], button, a")].filter(el => (el.offsetWidth || el.offsetHeight)).map(el => ({ tag: el.tagName, type: el.type || "", txt: (el.textContent || el.value || "").trim().slice(0, 15) })),
}));
console.log("PROBE:", JSON.stringify(probe, null, 1));
