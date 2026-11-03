// round90: 验证 defaultFonts 后角色名完整显示
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const OUT = "D:/temp/ZCode/aola/client/docs/spike";
const clip = { x: 240, y: 8, width: 960, height: 560 };
try { await page.cdp("Page.bringToFront", {}); } catch (e) {}

await page.goto("http://127.0.0.1:8700/game");
await page.waitForTimeout(32000);
await page.screenshot({ path: `${OUT}/r90_login.png`, clip });
await page.screenshot({ path: `${OUT}/r90_name.png`, clip: { x: 480, y: 350, width: 460, height: 180 } });

const st = await page.evaluate(() => ({
  fonts: (window.__LOG_LINES || []).filter(l => /device font|font source|Couldn't download/i.test(l)).map(l => l.replace(/\s*color:.*$/, "").slice(0, 120)),
}));
console.log(st.fonts.slice(-10).join("\n"));
console.log("saved");
