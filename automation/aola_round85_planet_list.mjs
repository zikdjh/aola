// round85: 打开「查看全部星球」列表，检查角色名显示
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const OUT = "D:/temp/ZCode/aola/client/docs/spike";
const clip = { x: 240, y: 8, width: 960, height: 560 };
try { await page.cdp("Page.bringToFront", {}); } catch (e) {}

await page.mouse.click(420, 513, { label: "view all planets" });
await page.waitForTimeout(8000);
await page.screenshot({ path: `${OUT}/r85_list.png`, clip });
await page.screenshot({ path: `${OUT}/r85_list_zoom.png`, clip: { x: 240, y: 60, width: 960, height: 260 } });
console.log("saved");
