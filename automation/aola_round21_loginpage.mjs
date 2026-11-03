const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const shot = await page.screenshot({ path: "D:/temp/ZCode/aola/client/docs/spike/round21_official_login.png" });
console.log("shot:", shot);
