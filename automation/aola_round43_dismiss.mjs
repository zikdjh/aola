// round43: 关闭公告弹窗，确认进入可玩世界
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const OUT = "D:/temp/ZCode/aola/client/docs/spike";

// “知道了”按钮位置（画布 240,8 起 960x560；截图里按钮中心约 (509,320) → stage (390,458)）
await page.mouse.click(630, 466, { label: "click 知道了" });
await page.waitForTimeout(6000);
console.log("after-dismiss", await page.screenshot({ path: `${OUT}/r43_world_hud.png` }));

const st = await page.evaluate(() => ({
  errs: (window.__LOG_LINES || []).filter(l => /%cERROR%/.test(l)).slice(-2).map(l => l.slice(0, 120)),
}));
console.log("ERR sample:\n" + st.errs.join("\n"));
console.log("done");
