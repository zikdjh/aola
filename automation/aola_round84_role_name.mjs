// round84: 自动登录页 → 选服页，抓角色名显示
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const OUT = "D:/temp/ZCode/aola/client/docs/spike";
const clip = { x: 240, y: 8, width: 960, height: 560 };
try { await page.cdp("Page.bringToFront", {}); } catch (e) {}

await page.goto("http://127.0.0.1:8700/game");
await page.waitForTimeout(32000);
await page.screenshot({ path: `${OUT}/r84_autologin.png`, clip });
console.log("autologin shot");

await page.mouse.click(724, 534, { label: "enter game" });
await page.waitForTimeout(15000);
await page.screenshot({ path: `${OUT}/r84_servers.png`, clip });
console.log("servers shot");

const st = await page.evaluate(() => ({
  logs: (window.__LOG_LINES || []).filter(l => /newLogin|serverslist|query_role|charName|role|AutoLogin/.test(l)).slice(-12),
}));
console.log(st.logs.join("\n"));
