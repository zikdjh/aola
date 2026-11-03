const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
// Bring window to foreground so screenshot works
await page.cdp("Page.bringToFront", {});
await page.waitForTimeout(2000);
const shot = await page.screenshot({ path: "D:/temp/ZCode/aola/client/docs/spike/round21_current.png" });
console.log({ shot });
