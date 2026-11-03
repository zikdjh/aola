const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
await page.goto("http://127.0.0.1:8700/game");
console.log({ taskSpaceId: task.spaceId, url: await page.url() });
