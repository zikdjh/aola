// round23d: 复刻 round15 成功配方（bringToFront + 32s 等待 + 两次点击）并抓关键信号
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const OUT = "D:/temp/ZCode/aola/client/docs/spike";
try { await page.cdp("Page.bringToFront", {}); } catch (e) {}

await page.evaluate(() => location.reload());
console.log("reloading...");
await page.waitForTimeout(32000);
console.log(await page.screenshot({ path: `${OUT}/r23d_t32.png` }));

await page.mouse.click(723, 523, { label: "click enter game" });
console.log("clicked enter");
await page.waitForTimeout(13000);
console.log(await page.screenshot({ path: `${OUT}/r23d_t45.png` }));

await page.mouse.click(723, 522, { label: "click quickstart" });
console.log("clicked quickstart");
await page.waitForTimeout(25000);

const st = await page.evaluate(() => ({
  key: (window.__LOG_LINES || []).filter(l => /newLogin|AutoLogin|serverslist|query_role|SOCK|ocket|ERROR|FAIL|Verify|61\/|2\/61/i.test(l)).slice(-30).join("\n"),
  socks: (window.__SOCK_LINES || []).slice(-20),
}));
console.log("KEY:\n" + st.key);
console.log("SOCK:\n" + st.socks.join("\n"));
console.log(await page.screenshot({ path: `${OUT}/r23d_final.png` }));

// 若已进世界，继续观察 60s 看装配进度是否推进
await page.waitForTimeout(60000);
console.log(await page.screenshot({ path: `${OUT}/r23d_t150.png` }));
const st2 = await page.evaluate(() => ({
  socks: (window.__SOCK_LINES || []).slice(-10),
  tail: (window.__LOG_LINES || []).filter(l => !/login-cmd|device font|audio|Audio/.test(l)).slice(-15).join("\n"),
}));
console.log("SOCK2:\n" + st2.socks.join("\n"));
console.log("TAIL2:\n" + st2.tail);
console.log("done");
