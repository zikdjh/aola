// round46: 战斗验证第一步 —— 打开亚比背包，看可用入口
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const OUT = "D:/temp/ZCode/aola/client/docs/spike";
try { await page.cdp("Page.bringToFront", {}); } catch (e) {}

console.log("before", await page.screenshot({ path: `${OUT}/r46_before.png` }));

// 底部图标栏「亚比背包」（画布 240,8 起 960x560）
await page.mouse.click(279, 536, { label: "open pet bag" });
await page.waitForTimeout(4000);
console.log("bag", await page.screenshot({ path: `${OUT}/r46_petbag.png` }));

const st = await page.evaluate(() => ({
  errs: (window.__LOG_LINES || []).filter(l => /%cERROR%/.test(l)).slice(-2).map(l => l.slice(0, 100)),
}));
console.log("ERR:\n" + st.errs.join("\n"));
console.log("done");
