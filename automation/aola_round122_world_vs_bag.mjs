// round122: 对比世界/背包 FPS，确认卡顿是否只在背包
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const stageClick = async (sx, sy, label) => {
  const r = await page.evaluate(() => document.getElementById("stage").getBoundingClientRect().toJSON());
  await page.mouse.click(r.x + sx, r.y + sy, { label });
};
const phase = async (name, ms, action) => {
  await page.evaluate(() => { window.__t = []; let last = performance.now();
    window.__tTimer = setInterval(() => { window.__t.push(performance.now() - last); last = performance.now(); }, 16); });
  if (action) await action();
  await page.waitForTimeout(ms);
  const st = await page.evaluate(() => { clearInterval(window.__tTimer); const G = window.__t || [];
    return { avg: Math.round((G.reduce((a,b)=>a+b,0)/G.length)*10)/10, max: Math.round(Math.max(...G)), over50: G.filter(x=>x>50).length }; });
  console.log(name, JSON.stringify(st));
};
try { const w = await page.cdp("Browser.getWindowForTarget", {}); const id = w.windowId ?? (w.result&&w.result.windowId);
  await page.cdp("Browser.setWindowBounds", { windowId: id, bounds: { windowState: "normal" } }); } catch (e) {}
await page.waitForTimeout(800);
await stageClick(930, 45, "close bag");
await page.waitForTimeout(2500);
await phase("world-idle-5s", 5000);
await stageClick(925, 525, "open bag");
await page.waitForTimeout(3000);
await phase("bag-idle-5s", 5000);
const warn = await page.evaluate(() => (window.__LOG_LINES||[]).filter(l=>/filter|Filter|slow|Warning/i.test(l)).slice(-6).map(l=>l.slice(0,150)));
console.log("WARN", warn.join("\n"));
