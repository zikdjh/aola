// round30: 摘除 PetCard3Service 后看装配能走多远
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const OUT = "D:/temp/ZCode/aola/client/docs/spike";
try { await page.cdp("Page.bringToFront", {}); } catch (e) {}

await page.goto("http://127.0.0.1:8700/game");
await page.waitForTimeout(32000);
await page.mouse.click(724, 534, { label: "click enter game" });
await page.waitForTimeout(15000);
await page.mouse.click(712, 521, { label: "click quickstart" });
console.log("quickstart clicked");

for (const t of [20, 40, 60, 90]) {
  await page.waitForTimeout(t === 20 ? 20000 : 20000);
  console.log(`t${t}`, await page.screenshot({ path: `${OUT}/r30_world_t${t}.png` }));
}

const st = await page.evaluate(() => ({
  errs: (window.__LOG_LINES || []).filter(l => /%cERROR%|Error #|TypeError|stub:/.test(l)).slice(-8),
  tail: (window.__LOG_LINES || []).filter(l => !/login-cmd|device font|audio|warmup|log_adapter|focus_tracker/.test(l)).slice(-8),
}));
console.log("ERRORS:\n" + st.errs.join("\n"));
console.log("TAIL:\n" + st.tail.join("\n"));
console.log("done");
