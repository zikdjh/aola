const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const url = await page.url();
const title = await page.title();
const shot = await page.screenshot({ path: "D:/temp/ZCode/aola/client/docs/spike/world_state_now.png" });
console.log({ url, title, shot });
