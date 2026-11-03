// round23b: 新票注入后重进世界，复现 [2/61] 卡点并采样
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const OUT = "D:/temp/ZCode/aola/client/docs/spike";

await page.goto("http://127.0.0.1:8700/game?via=web");
await page.waitForTimeout(20000);
console.log(await page.screenshot({ path: `${OUT}/r23b_t20_login.png` }));

// cookie 检查
const cookieOk = await page.evaluate(() => document.cookie.includes("game_auth_sid"));
console.log("cookie game_auth_sid present:", cookieOk);

// 进入游戏
await page.mouse.click(822, 530, { label: "click enter" });
await page.waitForTimeout(5000);
console.log(await page.screenshot({ path: `${OUT}/r23b_t25_servers.png` }));

// 快速开始游戏
await page.mouse.click(712, 521, { label: "click quickstart" });
console.log("quickstart clicked");

// 世界装配期采样
const marks = [10, 20, 40, 70, 100];
let el = 0;
for (const w of marks) {
  await page.waitForTimeout((w - el) * 1000);
  el = w;
  console.log(await page.screenshot({ path: `${OUT}/r23b_world_t${el}s.png` }));
}

// 终态采集
const state = await page.evaluate(() => ({
  socks: (window.__SOCK_LINES || []).slice(-40),
  logs: (window.__LOG_LINES || []).slice(-150).filter(l => !/FONT|audio|font/.test(l)),
}));
console.log("=== SOCK ===");
console.log(state.socks.join("\n"));
console.log("=== LOGS ===");
console.log(state.logs.join("\n"));
console.log("done");
