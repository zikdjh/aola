// round114: 统计本次会话全部 Unknown device font（含早期被挤掉的）
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const st = await page.evaluate(() => {
  const all = (window.__LOG_LINES || []).filter(l => /Unknown device font/i.test(l));
  const uniq = {};
  for (const l of all) {
    const m = l.match(/Unknown device font "([^"]+)"/);
    if (m) uniq[m[1]] = (uniq[m[1]] || 0) + 1;
  }
  return { total: all.length, uniq, hasSong: all.some(l => l.includes("宋体")) };
});
console.log(JSON.stringify(st, null, 1));
