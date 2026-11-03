// round120: 背包内切换精灵 + 打开魂卡编辑，测 FPS/日志量/异常，定位卡顿
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const OUT = "D:/temp/ZCode/aola/client/docs/spike";
try {
  const w = await page.cdp("Browser.getWindowForTarget", {});
  const id = w.windowId ?? (w.result && w.result.windowId);
  await page.cdp("Browser.setWindowBounds", { windowId: id, bounds: { windowState: "normal" } });
} catch (e) {}
await page.waitForTimeout(1000);

// 采样器：每帧记录时间戳，另统计 __LOG_LINES 增长
await page.evaluate(() => {
  window.__fps = [];
  window.__logMark = (window.__LOG_LINES || []).length;
  let last = performance.now();
  window.__fpsTimer = setInterval(() => {
    window.__fps.push({ t: performance.now(), n: (window.__LOG_LINES || []).length });
    if (window.__fps.length > 600) window.__fps.shift();
  }, 100);
});

const stageClick = async (sx, sy, label) => {
  const r = await page.evaluate(() => document.getElementById("stage").getBoundingClientRect().toJSON());
  await page.mouse.click(r.x + sx, r.y + sy, { label });
};

const t0 = Date.now();
await stageClick(760, 185, "open soulcard edit");   // 魂卡行卡片
await page.waitForTimeout(8000);
const tOpen = Date.now() - t0;
console.log("open elapsed ms:", tOpen);

// 切换精灵：点第二只 → 第三只
await stageClick(215, 495, "switch pet 2");
await page.waitForTimeout(6000);
await stageClick(350, 495, "switch pet 3");
await page.waitForTimeout(6000);

const r = await page.evaluate(() => document.getElementById("stage").getBoundingClientRect().toJSON());
await page.screenshot({ path: `${OUT}/r120_soulcard.png`, clip: { x: r.x, y: r.y, width: 960, height: 560 } });

const st = await page.evaluate(() => {
  const F = window.__fps || [];
  let maxGap = 0, gaps = [];
  for (let i = 1; i < F.length; i++) {
    const d = F[i].t - F[i - 1].t;
    gaps.push(Math.round(d));
    if (d > maxGap) maxGap = d;
  }
  const logGrowth = F.length ? F[F.length - 1].n - window.__logMark : -1;
  const L = (window.__LOG_LINES || []).slice(window.__logMark);
  const errs = L.filter(x => /%cERROR%|Error #|1009|1063|1065/.test(x));
  return {
    samples: F.length,
    avgGapMs: gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : -1,
    maxGapMs: Math.round(maxGap),
    slowSamples: gaps.filter(g => g > 500).length,
    logGrowth,
    errCount: errs.length,
    errSample: errs.slice(0, 6).map(x => x.replace(/\s*color:.*$/, "").slice(0, 160)),
    newLineSample: L.filter(x => !/login-cmd|audio/i.test(x)).slice(-8).map(x => x.slice(0, 160)),
  };
});
console.log(JSON.stringify(st, null, 1));
console.log("done");
