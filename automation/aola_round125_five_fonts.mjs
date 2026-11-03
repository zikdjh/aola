// round125: 5 字体集 + 撤销 SimSun 替换后：登录名/世界/背包渲染 + 切精灵性能
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
await page.screenshot({ path: `${OUT}/r125_login.png`, clip: { x: r.x, y: r.y, width: 960, height: 560 } });
await clickStage(484, 526, "click enter game");
await page.waitForTimeout(15000);
await clickStage(472, 513, "click quickstart");
await page.waitForTimeout(90000);
await clickStage(925, 525, "click pet backpack");
await page.waitForTimeout(12000);
await page.waitForTimeout(3000);
console.log("bag opened");

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
await phase("switch->2 #1", 6000, () => clickStage(215, 495, "switch pet 2"));
await phase("switch->3 #1", 6000, () => clickStage(350, 495, "switch pet 3"));
await phase("switch->2 #2", 6000, () => clickStage(215, 495, "switch pet 2 again"));
await phase("switch->3 #2", 6000, () => clickStage(350, 495, "switch pet 3 again"));
await phase("switch->2 #3", 6000, () => clickStage(215, 495, "switch pet 2 third"));
await phase("soulcard-open", 7000, () => clickStage(760, 185, "open soulcard edit"));
await page.screenshot({ path: `${OUT}/r125_bag.png`, clip: { x: r.x, y: r.y, width: 960, height: 560 } });
const st = await page.evaluate(() => ({
  unknown: (window.__LOG_LINES||[]).filter(l=>/Unknown device font/i.test(l)).slice(-10).map(l=>l.replace(/\s*color:.*$/,"").slice(0,120)),
  errs: (window.__LOG_LINES||[]).filter(l=>/%cERROR%|1009|1063|1065/.test(l)).slice(-8).map(l=>l.replace(/\s*color:.*$/,"").slice(0,150)),
}));
console.log("UNKNOWN:\n" + st.unknown.join("\n"));
console.log("ERRS:\n" + st.errs.join("\n"));
console.log("done");
