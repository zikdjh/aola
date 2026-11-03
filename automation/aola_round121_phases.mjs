// round121: 分阶段测 FPS：背包静止 / 切换精灵 / 打开魂卡编辑后静止
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
try {
  const w = await page.cdp("Browser.getWindowForTarget", {});
  const id = w.windowId ?? (w.result && w.result.windowId);
  await page.cdp("Browser.setWindowBounds", { windowId: id, bounds: { windowState: "normal" } });
} catch (e) {}

const stageClick = async (sx, sy, label) => {
  const r = await page.evaluate(() => document.getElementById("stage").getBoundingClientRect().toJSON());
  await page.mouse.click(r.x + sx, r.y + sy, { label });
};
const phase = async (name, ms, action) => {
  await page.evaluate(() => {
    window.__t = [];
    let last = performance.now();
    window.__tTimer = setInterval(() => { window.__t.push(performance.now() - last); last = performance.now(); }, 16);
  });
  if (action) await action();
  await page.waitForTimeout(ms);
  const st = await page.evaluate(() => {
    clearInterval(window.__tTimer);
    const G = window.__t || [];
    const avg = G.length ? G.reduce((a, b) => a + b, 0) / G.length : -1;
    return { n: G.length, avg: Math.round(avg * 10) / 10, max: Math.round(Math.max(...G)), over50: G.filter(x => x > 50).length };
  });
  console.log(name, JSON.stringify(st));
};

await page.waitForTimeout(1000);
await phase("bag-idle-5s", 5000);
await phase("switch-pet2", 4000, () => stageClick(215, 495, "switch pet 2"));
await phase("switch-pet3", 4000, () => stageClick(350, 495, "switch pet 3"));
await phase("soulcard-open+idle", 7000, () => stageClick(760, 185, "open soulcard edit"));
const info = await page.evaluate(() => {
  const L = window.__LOG_LINES || [];
  return {
    renderer: L.filter(l => /wgpu|webgl|renderer|Using .* backend/i.test(l)).slice(-4),
    mem: performance.memory ? { used: Math.round(performance.memory.usedJSHeapSize / 1e6) } : null,
  };
});
console.log("INFO", JSON.stringify(info));
