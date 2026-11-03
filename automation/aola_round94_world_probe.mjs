// round94: 复现进入世界，抓取底部图标栏 1:1 截图，为定位「背包」入口做准备
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const OUT = "D:/temp/ZCode/aola/client/docs/spike";
const clip = { x: 240, y: 8, width: 960, height: 560 };
try { await page.cdp("Page.bringToFront", {}); } catch (e) {}
try {
  const w = await page.cdp("Browser.getWindowForTarget", {});
  const id = w.windowId ?? (w.result && w.result.windowId);
  await page.cdp("Browser.setWindowBounds", { windowId: id, bounds: { windowState: "normal" } });
  console.log("window restored");
} catch (e) { console.log("restore fail:", e.message.slice(0, 120)); }
await page.waitForTimeout(2000);

await page.goto("http://127.0.0.1:8700/game");
await page.waitForTimeout(32000);
console.log("t32", await page.screenshot({ path: `${OUT}/r94_login.png`, clip }));

await page.mouse.click(724, 534, { label: "click enter game" });
await page.waitForTimeout(15000);
console.log("t47", await page.screenshot({ path: `${OUT}/r94_servers.png`, clip }));

await page.mouse.click(712, 521, { label: "click quickstart" });
console.log("quickstart clicked");
await page.waitForTimeout(45000);
console.log("t92", await page.screenshot({ path: `${OUT}/r94_world.png`, clip }));
await page.waitForTimeout(25000);
console.log("t117", await page.screenshot({ path: `${OUT}/r94_world2.png`, clip }));

const st = await page.evaluate(() => ({
  errs: (window.__LOG_LINES || []).filter(l => /ERROR|VerifyError|#10|无法|fail/i.test(l)).slice(-30),
  tail: (window.__LOG_LINES || []).slice(-25),
}));
console.log("ERRORS:\n" + st.errs.join("\n"));
console.log("TAIL:\n" + st.tail.join("\n"));
console.log("done");
