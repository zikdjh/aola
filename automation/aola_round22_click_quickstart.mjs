const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const t0 = Date.now();
await page.mouse.click(712, 521, { label: "click quick start game" });
console.log("quickstart clicked at", new Date().toISOString(), "elapsed_ms", Date.now() - t0);
const waits = [10, 10, 10, 30, 30, 30];
let elapsed = 0;
for (const w of waits) {
  await page.waitForTimeout(w * 1000);
  elapsed += w;
  const shot = await page.screenshot({ path: `D:/temp/ZCode/aola/client/docs/spike/world_t${elapsed}s.png` });
  console.log(`t=${elapsed}s elapsed=${Date.now()-t0}ms shot=${shot}`);
}
