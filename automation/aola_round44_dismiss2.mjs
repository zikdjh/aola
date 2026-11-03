// round44: 正确坐标关闭公告（717,455）
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const OUT = "D:/temp/ZCode/aola/client/docs/spike";
await page.mouse.click(723, 455, { label: "click 知道了" });
await page.waitForTimeout(6000);
console.log("shot", await page.screenshot({ path: `${OUT}/r44_world_hud.png` }));
