const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const t0 = Date.now();
await page.mouse.click(822, 530, { label: "click enter aola" });
await page.waitForTimeout(3000);
await page.mouse.click(712, 521, { label: "click quick start" });
console.log("quickstart at", new Date().toISOString(), "elapsed", Date.now() - t0);
const waits = [15, 15, 15, 30];
let el = 15;
for (const w of waits) {
  await page.waitForTimeout(w * 1000);
  el += w;
  const shot = await page.screenshot({ path: `D:/temp/ZCode/aola/client/docs/spike/vianull_t${el}s.png` });
  console.log(`t=${el}s shot=${shot}`);
}
