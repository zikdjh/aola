const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
for (let i = 0; i < 6; i++) {
  console.log(`waiting... check ${i + 1}/6`);
  await page.waitForTimeout(30000);
  const state = await page.evaluate(() => ({
    netReqs: window.__NET_STATS ? window.__NET_STATS.urls.length : 0,
    socks: (window.__SOCK_LINES || []).length,
  }));
  console.log(`  reqs=${state.netReqs} socks=${state.socks}`);
}
console.log("final check...");
const shot = await page.screenshot({ path: "D:/temp/ZCode/aola/client/docs/spike/round21_world_loaded.png" });
console.log("shot:", shot);
