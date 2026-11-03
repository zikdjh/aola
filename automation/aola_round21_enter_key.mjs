const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
// Try pressing Enter on the Flash player (many games use Enter for quick start)
console.log("[1] clicking canvas center then pressing Enter...");
await page.cdp("Input.dispatchMouseEvent", { type: "mousePressed", x: 720, y: 288, button: "left", clickCount: 1 });
await page.cdp("Input.dispatchMouseEvent", { type: "mouseReleased", x: 720, y: 288, button: "left", clickCount: 1 });
await page.waitForTimeout(1000);
await page.keyboard.press("Enter");
await page.waitForTimeout(5000);
const sock = await page.evaluate(() => (window.__SOCK_LINES || []).slice(-5));
console.log("socks:", JSON.stringify(sock));

// Check the full element tree for clues
const info = await page.evaluate(() => {
  const p = document.getElementById("player");
  return {
    playerExists: !!p,
    playerTag: p?.tagName,
    playerChildren: p ? p.children.length : 0,
    playerHTML: p ? p.innerHTML.slice(0, 200) : "(none)",
    activeElement: document.activeElement?.tagName,
  };
});
console.log("info:", JSON.stringify(info, null, 1));
