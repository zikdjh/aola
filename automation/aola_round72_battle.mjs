// round72: 等待战斗场景加载并截图
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const OUT = "D:/temp/ZCode/aola/client/docs/spike";

for (const t of [15, 40, 70, 100]) {
  await page.waitForTimeout(t === 15 ? 15000 : 25000 + (t > 40 ? 5000 : 0));
  await page.screenshot({ path: `${OUT}/r72_t${t}.png`, clip: { x: 240, y: 8, width: 960, height: 560 } });
  console.log("t" + t);
}
const st = await page.evaluate(() => ({
  errs: (window.__LOG_LINES || []).filter(l => /%cERROR%/.test(l)).slice(-5).map(l => l.slice(0, 120)),
  net: ((window.__NET_STATS || {}).urls || []).filter(u => /fight|shoot|pet/).slice(-8),
}));
console.log("ERR:\n" + st.errs.join("\n"));
console.log("NET:\n" + st.net.join("\n"));
console.log("saved");
