const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
await page.goto("http://127.0.0.1:8700/game");
await page.waitForTimeout(20000);
const shot = await page.screenshot({ path: "D:/temp/ZCode/aola/client/docs/spike/via_null_20s.png" });
console.log("reloaded via=null, 20s screenshot:", shot);
