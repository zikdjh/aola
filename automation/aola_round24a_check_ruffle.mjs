// round24a: 确认页面实际加载的是哪个 ruffle（nightly /ruffle/ vs stable /ruffle-stable/）
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");

const info = await page.evaluate(() => {
  const res = performance.getEntriesByType("resource")
    .filter(e => /ruffle/i.test(e.name))
    .map(e => ({ name: e.name, size: e.transferSize, dur: Math.round(e.duration) }));
  const scripts = [...document.querySelectorAll("script[src]")].map(s => s.getAttribute("src"));
  const ver = (window.RufflePlayer && window.RufflePlayer.version) ? window.RufflePlayer.version : null;
  return { res, scripts, ver };
});
console.log(JSON.stringify(info, null, 2));
