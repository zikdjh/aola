const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
// Player at (240, 8), size 960x560
const px = 240, py = 8;
// Systematically scan for the quick start button in the center-lower area
const positions = [];
for (let dx = 300; dx <= 660; dx += 60) {
  for (let dy = 250; dy <= 500; dy += 50) {
    positions.push([px + dx, py + dy]);
  }
}
console.log(`scanning ${positions.length} positions...`);
for (const [x, y] of positions) {
  await page.cdp("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await page.cdp("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
  await page.waitForTimeout(500);
  const sock = await page.evaluate(() => (window.__SOCK_LINES || []).length);
  if (sock > 0) {
    console.log(`SOCKET at (${x}, ${y})! socks=${sock}`);
    break;
  }
}
const final = await page.evaluate(() => ({
  socks: (window.__SOCK_LINES || []).slice(-5),
  netReqs: window.__NET_STATS ? window.__NET_STATS.urls.length : 0,
}));
console.log(JSON.stringify(final, null, 1));
