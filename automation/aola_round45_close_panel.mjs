// round45: 关闭活动面板，抓取干净的世界 HUD
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const OUT = "D:/temp/ZCode/aola/client/docs/spike";
await page.mouse.click(1134, 64, { label: "close panel" });
await page.waitForTimeout(5000);
console.log("shot", await page.screenshot({ path: `${OUT}/r45_world_clean.png` }));
