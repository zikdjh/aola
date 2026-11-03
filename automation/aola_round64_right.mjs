// round64: 截取右侧活动栏（1:1）
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const OUT = "D:/temp/ZCode/aola/client/docs/spike";
await page.screenshot({ path: `${OUT}/r64_right.png`, clip: { x: 1080, y: 8, width: 120, height: 560 } });
console.log("saved");
