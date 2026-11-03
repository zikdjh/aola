const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
// Find the player canvas position and size
const dims = await page.evaluate(() => {
  const p = document.getElementById("player");
  if (!p) return { err: "no player" };
  const r = p.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
});
console.log("player dims:", JSON.stringify(dims));
if (dims.err) { process.exit(1); }
// Try clicking "快速开始" - typically a large button on the server select page
// Positions relative to the 960x560 stage (center-ish and bottom-center)
const stageX = dims.left, stageY = dims.top;
const positions = [
  [stageX + 480, stageY + 280],   // center
  [stageX + 480, stageY + 350],   // below center
  [stageX + 480, stageY + 420],   // lower center
  [stageX + 350, stageY + 400],   // left of center
  [stageX + 600, stageY + 400],   // right of center
];
for (const [x, y] of positions) {
  console.log(`CDP click at page (${Math.round(x)}, ${Math.round(y)})...`);
  await page.cdp("Input.dispatchMouseEvent", { type: "mousePressed", x: Math.round(x), y: Math.round(y), button: "left", clickCount: 1 });
  await page.cdp("Input.dispatchMouseEvent", { type: "mouseReleased", x: Math.round(x), y: Math.round(y), button: "left", clickCount: 1 });
  await page.waitForTimeout(3000);
  const sock = await page.evaluate(() => (window.__SOCK_LINES || []).slice(-3));
  if (sock.length > 0) { console.log("SOCKET FOUND:", sock); break; }
}
const state = await page.evaluate(() => ({
  socks: (window.__SOCK_LINES || []).slice(-5),
  recentLogs: (window.__LOG_LINES || []).slice(-5),
}));
console.log(JSON.stringify(state, null, 1));
