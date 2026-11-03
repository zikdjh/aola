// round79: 精准复刻已验证的战斗路径（跳过 TV 板，直接找竞技场 NPC）
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const OUT = "D:/temp/ZCode/aola/client/docs/spike";
const clip = { x: 240, y: 8, width: 960, height: 560 };
try { await page.cdp("Page.bringToFront", {}); } catch (e) {}

// 复位：重载
await page.goto("http://127.0.0.1:8700/game");
await page.waitForTimeout(30000);
await page.mouse.click(724, 534, { label: "enter game" });
await page.waitForTimeout(14000);
await page.mouse.click(712, 521, { label: "quickstart" });
await page.waitForTimeout(110000);
await page.screenshot({ path: `${OUT}/r79_world.png`, clip });

await page.mouse.click(720, 528, { label: "open map" });
await page.waitForTimeout(6000);
await page.mouse.click(1060, 146, { label: "space arena" });
await page.waitForTimeout(15000);
await page.screenshot({ path: `${OUT}/r79_arena.png`, clip });

await page.mouse.click(420, 373, { label: "arena npc" });
await page.waitForTimeout(8000);
await page.screenshot({ path: `${OUT}/r79_promo.png`, clip });

await page.mouse.click(805, 263, { label: "go battle space" });
await page.waitForTimeout(9000);
await page.mouse.click(1065, 348, { label: "casual" });
await page.waitForTimeout(7000);
await page.screenshot({ path: `${OUT}/r79_lobby.png`, clip });

await page.mouse.click(950, 423, { label: "single pet" });
await page.waitForTimeout(8000);
await page.mouse.click(833, 432, { label: "start matching" });
await page.waitForTimeout(22000);
await page.screenshot({ path: `${OUT}/r79_vs.png`, clip });
await page.waitForTimeout(35000);
await page.screenshot({ path: `${OUT}/r79_fight.png`, clip });

const st = await page.evaluate(() => ({
  errs: (window.__LOG_LINES || []).filter(l => /%cERROR%/.test(l)).slice(-4).map(l => l.slice(0, 130)),
}));
console.log("ERR:\n" + st.errs.join("\n"));
console.log("done");
