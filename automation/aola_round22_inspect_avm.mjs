const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const info = await page.evaluate(() => {
  const el = document.getElementById("player");
  if (!el) return { error: "no #player element" };
  const keys = Object.getOwnPropertyNames(el).concat(
    Object.getOwnPropertyNames(Object.getPrototypeOf(el) || {}));
  return { tag: el.tagName, id: el.id, keys: keys.slice(0, 60) };
});
console.log(JSON.stringify(info, null, 2));
