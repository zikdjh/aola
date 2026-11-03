// round73: 恢复窗口并截战斗画面
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const OUT = "D:/temp/ZCode/aola/client/docs/spike";

for (const st of ["normal", "maximized"]) {
  try { await page.cdp("Browser.setWindowState", { windowState: st }); console.log("windowState:", st); break; } catch (e) { console.log("fail", st, e.message.slice(0, 80)); }
}
await page.waitForTimeout(1500);
await page.cdp("Page.bringToFront", {}).catch(() => {});
await page.waitForTimeout(2500);
console.log(await page.screenshot({ path: `${OUT}/r73_battle.png`, clip: { x: 240, y: 8, width: 960, height: 560 } }));
