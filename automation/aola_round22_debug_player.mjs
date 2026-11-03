const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const info = await page.evaluate(() => {
  const el = document.getElementById("player");
  if (!el) return { error: "no #player" };
  try {
    const di = el.debugPlayerInfo();
    return { type: typeof di, str: String(di).slice(0, 3000) };
  } catch (e) { return { error: e.message }; }
});
console.log(JSON.stringify(info, null, 2));
