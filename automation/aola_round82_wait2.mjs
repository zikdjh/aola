// round82: 继续等待匹配与战斗画面
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const OUT = "D:/temp/ZCode/aola/client/docs/spike";
const clip = { x: 240, y: 8, width: 960, height: 560 };
for (let i = 1; i <= 8; i++) {
  await page.waitForTimeout(15000);
  await page.screenshot({ path: `${OUT}/r82_${String(i).padStart(2, "0")}.png`, clip });
  console.log("shot", i, "at +", 15 * i, "s");
}
const st = await page.evaluate(() => ({
  errs: (window.__LOG_LINES || []).filter(l => /%cERROR%/.test(l)).slice(-3).map(l => l.slice(0, 120)),
}));
console.log("ERR:\n" + st.errs.join("\n"));
