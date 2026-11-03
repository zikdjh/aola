// round25c: 读取当前页面完整日志尾部（过滤噪音），定位停滞点
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");

const st = await page.evaluate(() => {
  const noise = /login-cmd|device font|audio buffer|Audio underrun|Unknown device font|warmup/;
  const all = (window.__LOG_LINES || []).filter(l => !noise.test(l));
  return {
    total: (window.__LOG_LINES || []).length,
    tail: all.slice(-90),
    sock: (window.__SOCK_LINES || []),
  };
});
console.log("total log lines:", st.total, "| sock lines:", st.sock.length);
console.log("=== SOCK ===");
console.log(st.sock.join("\n"));
console.log("=== TAIL ===");
console.log(st.tail.join("\n"));
