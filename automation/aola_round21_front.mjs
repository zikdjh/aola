const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
try { await page.cdp("Page.bringToFront", {}); } catch (e) { console.log("bringToFront:", e.message); }
await page.waitForTimeout(1500);
const info = await page.cdp("Runtime.evaluate", { expression: "document.title + ' | ' + window.__NET_STATS.urls.length + ' reqs'" });
console.log("state:", JSON.stringify(info));
