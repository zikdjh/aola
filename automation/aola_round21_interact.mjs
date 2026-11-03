const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
// Try clicking in the game world (character is usually center-ish)
console.log("[1] clicking center to interact...");
await page.cdp("Input.dispatchMouseEvent", { type: "mousePressed", x: 720, y: 350, button: "left", clickCount: 1 });
await page.cdp("Input.dispatchMouseEvent", { type: "mouseReleased", x: 720, y: 350, button: "left", clickCount: 1 });
await page.waitForTimeout(3000);
// Try arrow keys to move
console.log("[2] pressing arrow keys...");
await page.keyboard.press("ArrowRight");
await page.waitForTimeout(2000);
await page.keyboard.press("ArrowUp");
await page.waitForTimeout(2000);
const state = await page.evaluate(() => ({
  netReqs: window.__NET_STATS ? window.__NET_STATS.urls.length : 0,
  socks: (window.__SOCK_LINES || []).length,
  recentLogs: (window.__LOG_LINES || []).slice(-5),
}));
console.log(JSON.stringify(state, null, 1));
