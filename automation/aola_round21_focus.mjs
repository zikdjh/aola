const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
try { await page.cdp("Page.bringToFront", {}); } catch (e) { console.log("bringToFront:", e.message); }
await page.waitForTimeout(2000);
const info = await page.cdp("Runtime.evaluate", { expression: "document.title" });
console.log("title via CDP:", JSON.stringify(info));
