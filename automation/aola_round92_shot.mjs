// round92: 仅截图（页面已加载）
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const OUT = "D:/temp/ZCode/aola/client/docs/spike";
try { await page.cdp("Page.bringToFront", {}); } catch (e) {}
await page.waitForTimeout(3000);
await page.screenshot({ path: `${OUT}/r92_login.png`, clip: { x: 240, y: 8, width: 960, height: 560 } });
await page.screenshot({ path: `${OUT}/r92_name.png`, clip: { x: 330, y: 300, width: 620, height: 240 } });
const st = await page.evaluate(() => ({
  fonts: (window.__LOG_LINES || []).filter(l => /Unknown device font|Loaded new device font/i.test(l)).map(l => l.replace(/\s*color:.*$/, "").slice(0, 110)),
}));
console.log(st.fonts.slice(-8).join("\n"));
console.log("saved");
