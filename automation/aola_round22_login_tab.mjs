const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
await page.click("text=普通登录");
await page.waitForTimeout(1000);
console.log(await page.snapshot());
const shot = await page.screenshot({ path: "D:/temp/ZCode/aola/client/docs/spike/round22-login-tab.png" });
console.log({ screenshot: shot });
