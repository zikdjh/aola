// round23: 复现 [2/61] 卡点 —— 全自动登录进世界，抓日志/网络/隧道状态
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const OUT = "D:/temp/ZCode/aola/client/docs/spike";

await page.goto("http://127.0.0.1:8700/game?via=web");
await page.waitForTimeout(20000);
console.log(await page.screenshot({ path: `${OUT}/r23_t20_login.png` }));

// 进入游戏
await page.mouse.click(822, 530, { label: "click enter" });
await page.waitForTimeout(4000);
console.log(await page.screenshot({ path: `${OUT}/r23_t24_servers.png` }));

// 快速开始游戏
await page.mouse.click(712, 521, { label: "click quickstart" });
console.log("quickstart clicked");

// 世界装配期采样
const marks = [10, 20, 40, 70];
let el = 0;
for (const w of marks) {
  await page.waitForTimeout((w - el) * 1000);
  el = w;
  console.log(await page.screenshot({ path: `${OUT}/r23_world_t${el}s.png` }));
}

// 终态采集
const state = await page.evaluate(() => ({
  title: document.title,
  net: window.__NET_STATS ? { count: window.__NET_STATS.urls.length, last: window.__NET_STATS.urls.slice(-60) } : null,
  socks: (window.__SOCK_LINES || []).slice(-40),
  logs: (window.__LOG_LINES || []).slice(-120),
}));
console.log("=== SOCK ===");
console.log(state.socks.join("\n"));
console.log("=== LOGS ===");
console.log(state.logs.join("\n"));
console.log("=== NET last ===");
console.log((state.net ? state.net.last : []).join("\n"));
console.log("done");
