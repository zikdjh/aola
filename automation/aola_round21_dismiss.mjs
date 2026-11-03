const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
console.log("[1] clicking 下次再说...");
const clicked = await page.evaluate(() => {
  const btns = [...document.querySelectorAll("button, a, input, div")].filter(el =>
    /下次再说/.test(el.textContent || el.value || "") && (el.offsetWidth || el.offsetHeight));
  if (!btns.length) return { err: "no btn" };
  btns[0].click();
  return { clicked: btns[0].tagName + "." + String(btns[0].className).slice(0, 30) };
});
console.log("CLICK:", JSON.stringify(clicked));
await page.waitForTimeout(8000);
const after = await page.evaluate(() => ({
  title: document.title,
  url: window.location.href.slice(0, 200),
  cookies: document.cookie.slice(0, 500),
}));
console.log("AFTER:", JSON.stringify(after, null, 1));
const shot = await page.screenshot({ path: "D:/temp/ZCode/aola/client/docs/spike/round21_after_dismiss.png" });
console.log("shot:", shot);
