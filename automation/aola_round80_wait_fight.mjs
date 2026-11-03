// round80: 等待战斗正式画面
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const OUT = "D:/temp/ZCode/aola/client/docs/spike";
const clip = { x: 240, y: 8, width: 960, height: 560 };
for (const t of [20, 40, 60, 90]) {
  await page.waitForTimeout(t === 20 ? 20000 : 20000);
  await page.screenshot({ path: `${OUT}/r80_t${t}.png`, clip });
  console.log("t" + t);
}
const st = await page.evaluate(() => ({
  errs: (window.__LOG_LINES || []).filter(l => /%cERROR%/.test(l)).slice(-4).map(l => l.slice(0, 140)),
  urls: ((window.__NET_STATS || {}).urls || []).filter(u => /fight|attack|skill/.test(u)).slice(-6),
}));
console.log("ERR:\n" + st.errs.join("\n"));
console.log("URLS:\n" + st.urls.join("\n"));
