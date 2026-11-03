// round81: 再匹配一局，密集截图抓战斗 UI
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const OUT = "D:/temp/ZCode/aola/client/docs/spike";
const clip = { x: 240, y: 8, width: 960, height: 560 };
try { await page.cdp("Page.bringToFront", {}); } catch (e) {}

await page.mouse.click(950, 423, { label: "single pet match" });
await page.waitForTimeout(7000);
await page.mouse.click(833, 432, { label: "start matching" });
console.log("matching");
for (let i = 1; i <= 10; i++) {
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `${OUT}/r81_${String(i).padStart(2, "0")}.png`, clip });
  console.log("shot", i, "at", 6 * i, "s");
}
