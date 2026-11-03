// round59: 点「深入」进入关卡，观察是否触发战斗
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const OUT = "D:/temp/ZCode/aola/client/docs/spike";
try { await page.cdp("Page.bringToFront", {}); } catch (e) {}

await page.mouse.click(475, 242, { label: "click 深入 1" });
await page.waitForTimeout(7000);
console.log("a", await page.screenshot({ path: `${OUT}/r59_a.png` }));

// 若出现确认弹窗，点常见确认位置（面板中下方黄色按钮）
await page.mouse.click(600, 470, { label: "click confirm" });
await page.waitForTimeout(10000);
console.log("b", await page.screenshot({ path: `${OUT}/r59_b.png` }));

const st = await page.evaluate(() => ({
  errs: (window.__LOG_LINES || []).filter(l => /%cERROR%/.test(l)).slice(-3).map(l => l.slice(0, 90)),
}));
console.log("ERR:\n" + st.errs.join("\n"));
