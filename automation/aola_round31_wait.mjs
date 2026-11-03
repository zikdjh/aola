// round31: 继续观察装配是否收敛到 60/60
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const OUT = "D:/temp/ZCode/aola/client/docs/spike";
await page.waitForTimeout(40000);
console.log("t130", await page.screenshot({ path: `${OUT}/r31_world_t130.png` }));
await page.waitForTimeout(60000);
console.log("t190", await page.screenshot({ path: `${OUT}/r31_world_t190.png` }));
const st = await page.evaluate(() => ({
  errs: (window.__LOG_LINES || []).filter(l => /%cERROR%/).slice(-3),
  tail: (window.__LOG_LINES || []).slice(-3),
}));
console.log("ERR count sample:\n" + st.errs.join("\n"));
console.log("TAIL:\n" + st.tail.join("\n"));
