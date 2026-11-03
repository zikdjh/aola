// round91: 验证「宋体→SimSun」替换后角色名
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const OUT = "D:/temp/ZCode/aola/client/docs/spike";
const clip = { x: 240, y: 8, width: 960, height: 560 };
try { await page.cdp("Page.bringToFront", {}); } catch (e) {}

await page.goto("http://127.0.0.1:8700/game");
await page.waitForTimeout(32000);
await page.screenshot({ path: `${OUT}/r91_login.png`, clip });
await page.screenshot({ path: `${OUT}/r91_name.png`, clip: { x: 330, y: 300, width: 620, height: 240 } });

const st = await page.evaluate(() => ({
  fonts: (window.__LOG_LINES || []).filter(l => /Unknown device font|Loaded new device font/i.test(l)).map(l => l.replace(/\s*color:.*$/, "").slice(0, 110)),
}));
console.log(st.fonts.slice(-8).join("\n"));
console.log("saved");
