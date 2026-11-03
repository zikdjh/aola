// round49: 打开亚比背包
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const OUT = "D:/temp/ZCode/aola/client/docs/spike";
try { await page.cdp("Page.bringToFront", {}); } catch (e) {}

await page.mouse.click(279, 536, { label: "open pet bag" });
await page.waitForTimeout(4000);
console.log("bag", await page.screenshot({ path: `${OUT}/r49_petbag.png` }));
console.log("url", await page.url());
