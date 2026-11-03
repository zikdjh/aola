// round124: 全流程到背包 + 逐步切换精灵测 rAF（当前字体集可配置，用于对照实验）
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const OUT = "D:/temp/ZCode/aola/client/docs/spike";
try { const w = await page.cdp("Browser.getWindowForTarget", {}); const id = w.windowId ?? (w.result&&w.result.windowId);
  await page.cdp("Browser.setWindowBounds", { windowId: id, bounds: { windowState: "normal" } }); } catch (e) {}
await page.waitForTimeout(1000);
let r = await page.evaluate(() => document.getElementById("stage").getBoundingClientRect().toJSON());
const clickStage = async (sx, sy, label) => {
  r = await page.evaluate(() => document.getElementById("stage").getBoundingClientRect().toJSON());
  await page.mouse.click(r.x + sx, r.y + sy, { label });
};
await page.goto("http://127.0.0.1:8700/game");
await page.waitForTimeout(32000);
await clickStage(484, 526, "click enter game");
await page.waitForTimeout(15000);
await clickStage(472, 513, "click quickstart");
await page.waitForTimeout(90000);
await clickStage(925, 525, "click pet backpack");
await page.waitForTimeout(12000);
console.log("bag opened");
await page.waitForTimeout(3000);

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
await phase("bag-idle", 4000);
await phase("switch->2 #1", 8000, () => clickStage(215, 495, "switch pet 2"));
await phase("switch->3 #1", 8000, () => clickStage(350, 495, "switch pet 3"));
await phase("switch->2 #2", 8000, () => clickStage(215, 495, "switch pet 2 again"));
await phase("switch->3 #2", 8000, () => clickStage(350, 495, "switch pet 3 again"));
await phase("soulcard-open", 7000, () => clickStage(760, 185, "open soulcard edit"));
await page.screenshot({ path: `${OUT}/r124_soulcard.png`, clip: { x: r.x, y: r.y, width: 960, height: 560 } });
console.log("done");
