const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
await page.goto("http://127.0.0.1:8700/game");
console.log("[0] booting...");
await page.waitForTimeout(25000);
console.log("[1] clicking START GAME...");
await page.mouse.click(719, 498, { label: "START GAME" });
await page.waitForTimeout(8000);
console.log("[2] clicking 进入奥拉星...");
await page.mouse.click(821, 560, { label: "进入奥拉星" });
await page.waitForTimeout(15000);
console.log("[3] scanning for quick start...");
const px = 240, py = 8;
outer: for (let dx = 300; dx <= 660; dx += 60) {
  for (let dy = 250; dy <= 500; dy += 50) {
    const x = px + dx, y = py + dy;
    await page.cdp("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
    await page.cdp("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
    await page.waitForTimeout(500);
    const sock = await page.evaluate(() => (window.__SOCK_LINES || []).length);
    if (sock > 0) { console.log(`SOCKET at (${x}, ${y})!`); break outer; }
  }
}
console.log("[4] waiting 30s for world...");
await page.waitForTimeout(30000);
const state = await page.evaluate(() => ({
  socks: (window.__SOCK_LINES || []).slice(-5),
  netReqs: window.__NET_STATS ? window.__NET_STATS.urls.length : 0,
}));
console.log(JSON.stringify(state, null, 1));
