// round86: 验证字体回退后角色名是否完整显示
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const OUT = "D:/temp/ZCode/aola/client/docs/spike";
const clip = { x: 240, y: 8, width: 960, height: 560 };
try { await page.cdp("Page.bringToFront", {}); } catch (e) {}

await page.goto("http://127.0.0.1:8700/game");
await page.waitForTimeout(32000);
await page.screenshot({ path: `${OUT}/r86_autologin.png`, clip });
await page.screenshot({ path: `${OUT}/r86_name_zoom.png`, clip: { x: 500, y: 360, width: 420, height: 160 } });

const st = await page.evaluate(() => ({
  font: (window.__LOG_LINES || []).filter(l => /device font|fontSources|font/i.test(l)).slice(-8).map(l => l.replace(/color:.*$/, "").slice(0, 110)),
}));
console.log(st.font.join("\n"));
console.log("saved");
