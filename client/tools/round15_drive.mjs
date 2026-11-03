// round15_drive.mjs — 全链驱动：刷新 → AutoLogin → 进入游戏 → 快速开始 → 等待区服会话
const task = await taskSpace("aola-ruffle-login");
const page = await task.page("p1");
try { await page.cdp("Page.bringToFront", {}); } catch (e) {}
await page.evaluate(() => location.reload());
console.log("reloading...");
await new Promise(r => setTimeout(r, 32000));
await page.mouse.click(723, 523, { label: "click 进入游戏" });
console.log("clicked 进入游戏");
await new Promise(r => setTimeout(r, 13000));
await page.mouse.click(723, 522, { label: "click 快速开始游戏" });
console.log("clicked 快速开始");
await new Promise(r => setTimeout(r, 22000));
const k = await page.evaluate(() => (window.__LOG_LINES || []).filter(l => /SOCK|ocket|ERROR|FAIL|Verify/i.test(l)).slice(-14).join("\n"));
console.log("KEY:\n" + k);
await page.screenshot({ path: "D:/temp/ZCode/aola/client/docs/spike/round15_world2.png" });
console.log("shot ok");
