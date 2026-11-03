const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
await page.fill("@15", "26394032");
await page.fill("@16", "19811103");
await page.click("@18");
await page.waitForTimeout(10000);
console.log(await page.snapshot());
const shot = await page.screenshot({ path: "D:/temp/ZCode/aola/client/docs/spike/round22-after-submit.png" });
console.log({
  screenshot: shot,
  url: await page.url(),
  title: await page.title(),
  cookies: await page.evaluate(() => document.cookie),
});
