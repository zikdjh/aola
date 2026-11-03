const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
console.log({ url: await page.url(), title: await page.title(), info: await page.info() });
console.log(await page.snapshot());
const shot = await page.screenshot({ path: "D:/temp/ZCode/aola/client/docs/spike/round22-state.png" });
console.log({ screenshot: shot });
