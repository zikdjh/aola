// round55: 从地图进入战武圣殿
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const OUT = "D:/temp/ZCode/aola/client/docs/spike";
try { await page.cdp("Page.bringToFront", {}); } catch (e) {}

await page.mouse.click(469, 305, { label: "click 战武圣殿" });
await page.waitForTimeout(12000);
console.log("scene", await page.screenshot({ path: `${OUT}/r55_scene.png` }));

const st = await page.evaluate(() => ({
  errs: (window.__LOG_LINES || []).filter(l => /%cERROR%/.test(l)).slice(-2).map(l => l.slice(0, 100)),
}));
console.log("ERR:\n" + st.errs.join("\n"));
