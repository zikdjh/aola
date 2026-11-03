// round78: 全流程重跑 → 竞技场 → 单亚比匹配 → 战斗
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const OUT = "D:/temp/ZCode/aola/client/docs/spike";
const clip = { x: 240, y: 8, width: 960, height: 560 };
try { await page.cdp("Page.bringToFront", {}); } catch (e) {}

// 1) 进世界
await page.goto("http://127.0.0.1:8700/game");
await page.waitForTimeout(30000);
await page.mouse.click(724, 534, { label: "enter game" });
await page.waitForTimeout(14000);
await page.mouse.click(712, 521, { label: "quickstart" });
console.log("quickstart");
await page.waitForTimeout(110000);
await page.screenshot({ path: `${OUT}/r78_world.png`, clip });

// 2) 竞技场路径
await page.mouse.click(720, 528, { label: "open map" });        // 地图
await page.waitForTimeout(6000);
await page.mouse.click(1060, 146, { label: "space arena" });   // 太空竞技场
await page.waitForTimeout(14000);
await page.mouse.click(505, 203, { label: "arena board" });
await page.waitForTimeout(7000);
await page.mouse.click(420, 373, { label: "arena npc" });
await page.waitForTimeout(8000);
await page.screenshot({ path: `${OUT}/r78_arena.png`, clip });

// 3) 去对战空间 → 休闲 → 单亚比 → 匹配
await page.mouse.click(805, 263, { label: "go battle space" });
await page.waitForTimeout(9000);
await page.mouse.click(1065, 348, { label: "casual mode" });
await page.waitForTimeout(7000);
await page.mouse.click(950, 423, { label: "single pet match" });
await page.waitForTimeout(8000);
await page.screenshot({ path: `${OUT}/r78_setup.png`, clip });
await page.mouse.click(833, 432, { label: "start matching" });
console.log("matching started");

// 4) 等 VS 与战斗
await page.waitForTimeout(20000);
await page.screenshot({ path: `${OUT}/r78_vs.png`, clip });
await page.waitForTimeout(30000);
await page.screenshot({ path: `${OUT}/r78_fight1.png`, clip });
await page.waitForTimeout(30000);
await page.screenshot({ path: `${OUT}/r78_fight2.png`, clip });

const st = await page.evaluate(() => ({
  errs: (window.__LOG_LINES || []).filter(l => /%cERROR%/.test(l)).slice(-5).map(l => l.slice(0, 130)),
}));
console.log("ERR:\n" + st.errs.join("\n"));
console.log("done");
