const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
// The game stage is 960x560, centered in the page. Quick Start button should be center-ish.
// From P0 log: "快速开始游戏/查看全部星球/快速进入"
// Let me click a few positions where it might be
const positions = [[719, 350], [719, 400], [719, 450], [719, 300], [719, 500]];
for (const [x, y] of positions) {
  console.log(`clicking (${x}, ${y})...`);
  await page.mouse.click(x, y, { label: "quick start" });
  await page.waitForTimeout(2000);
  const sock = await page.evaluate(() => (window.__SOCK_LINES || []).slice(-3));
  if (sock.length > 0) { console.log("SOCKET ACTIVITY:", sock); break; }
}
const state = await page.evaluate(() => ({
  socks: (window.__SOCK_LINES || []).slice(-10),
  logs: (window.__LOG_LINES || []).filter(l => /ERROR|socket|connect/i.test(l)).slice(-10),
}));
console.log(JSON.stringify(state, null, 1));
