// round25d: 提取所有 trace 输出（log_adapter）与唯一日志行，判断停滞点
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");

const st = await page.evaluate(() => {
  const all = (window.__LOG_LINES || []);
  const traces = all.filter(l => /log_adapter/.test(l));
  const others = all.filter(l => !/log_adapter|login-cmd|device font|audio|warmup/.test(l));
  return { total: all.length, traceCount: traces.length, traces: traces.slice(-120), others: others.slice(-40) };
});
console.log("total:", st.total, "trace lines:", st.traceCount);
console.log("=== TRACES (last 120) ===");
console.log(st.traces.map(l => l.replace(/^\[[^\]]+\] LOG %cINFO%c web\/src\/log_adapter\.rs:18%c /, "")).join(" | "));
console.log("=== LAST OTHER ===");
console.log(st.others.join("\n"));
