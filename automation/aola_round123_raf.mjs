// round123: 用 rAF 精确测 FPS；反复切换同一批精灵，区分「回源/解析」与「渲染」
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const stageClick = async (sx, sy, label) => {
  const r = await page.evaluate(() => document.getElementById("stage").getBoundingClientRect().toJSON());
  await page.mouse.click(r.x + sx, r.y + sy, { label });
};
const phase = async (name, ms, action) => {
  await page.evaluate(() => { window.__raf = []; window.__rafOn = true;
    const tick = (t) => { if (!window.__rafOn) return; window.__raf.push(t); requestAnimationFrame(tick); };
    requestAnimationFrame(tick); });
  if (action) await action();
  await page.waitForTimeout(ms);
  const st = await page.evaluate(() => { window.__rafOn = false; const R = window.__raf || [];
    let maxGap = 0; for (let i = 1; i < R.length; i++) maxGap = Math.max(maxGap, R[i] - R[i-1]);
    const dur = R.length ? (R[R.length-1] - R[0]) : 0;
    return { frames: R.length, fps: dur ? +(R.length / (dur/1000)).toFixed(1) : -1, maxGap: Math.round(maxGap) }; });
  console.log(name, JSON.stringify(st));
};
try { const w = await page.cdp("Browser.getWindowForTarget", {}); const id = w.windowId ?? (w.result&&w.result.windowId);
  await page.cdp("Browser.setWindowBounds", { windowId: id, bounds: { windowState: "normal" } }); } catch (e) {}
await page.waitForTimeout(800);
await phase("bag-idle", 4000);
await phase("switch->2 (first)", 5000, () => stageClick(215, 495, "switch pet 2"));
await phase("switch->3 (first)", 5000, () => stageClick(350, 495, "switch pet 3"));
await phase("switch->2 (again)", 4000, () => stageClick(215, 495, "switch pet 2 again"));
await phase("switch->3 (again)", 4000, () => stageClick(350, 495, "switch pet 3 again"));
await phase("soulcard-open", 6000, () => stageClick(760, 185, "open soulcard edit"));
