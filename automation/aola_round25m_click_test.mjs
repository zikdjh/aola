// round25m: 点击场景/界面，观察 [2/61] 是否推进 + 是否有新请求
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const OUT = "D:/temp/ZCode/aola/client/docs/spike";

const before = await page.evaluate(() => ((window.__NET_STATS || {}).urls || []).length);
await page.mouse.click(720, 300, { label: "click scene center" });
await page.waitForTimeout(4000);
await page.mouse.click(720, 480, { label: "click scene lower" });
await page.waitForTimeout(8000);
const after = await page.evaluate(() => ({
  urls: ((window.__NET_STATS || {}).urls || []).length,
  tail: ((window.__NET_STATS || {}).urls || []).slice(-4),
}));
console.log("urls before/after:", before, after.urls);
console.log("tail:", after.tail.join("\n"));
console.log("shot", await page.screenshot({ path: `${OUT}/r25m_after_click.png` }));
