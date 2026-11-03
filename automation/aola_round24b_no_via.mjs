// round24b: 按 round22 last-known-good 配方（无 via 参数）重跑，精确坐标点击
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const OUT = "D:/temp/ZCode/aola/client/docs/spike";
try { await page.cdp("Page.bringToFront", {}); } catch (e) {}

await page.goto("http://127.0.0.1:8700/game");
await page.waitForTimeout(30000);
console.log("shot1", await page.screenshot({ path: `${OUT}/r24b_t30.png` }));
const ei1 = await page.evaluate(() =>
  (window.__LOG_LINES || []).filter(l => /EI<-|newLogin|query_role|AutoLogin/.test(l)).join("\n"));
console.log("EI@30s:\n" + ei1);

// 进入奥拉星（画布 240,8 起 960x560；按钮 Flash 坐标约 416,535）
await page.mouse.click(656, 543, { label: "click enter aola" });
await page.waitForTimeout(12000);
console.log("shot2", await page.screenshot({ path: `${OUT}/r24b_after_enter.png` }));
const ei2 = await page.evaluate(() =>
  (window.__LOG_LINES || []).filter(l => /EI<-|newLogin|query_role|AutoLogin|serverslist/.test(l)).slice(-25).join("\n"));
console.log("EI after enter:\n" + ei2);
console.log("done");
