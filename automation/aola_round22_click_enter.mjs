const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const t0 = Date.now();
await page.mouse.click(822, 530, { label: "click enter aola button" });
console.log("clicked at", new Date().toISOString(), "elapsed_ms", Date.now() - t0);
await page.waitForTimeout(30000);
const shot = await page.screenshot({ path: "D:/temp/ZCode/aola/client/docs/spike/world_after_enter.png" });
console.log("after 30s elapsed_ms", Date.now() - t0, "shot", shot);
