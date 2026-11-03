const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const result = await page.cdp("Page.captureScreenshot", { format: "png" });
const fs = await import("node:fs");
const buf = Buffer.from(result.data, "base64");
fs.writeFileSync("D:/temp/ZCode/aola/client/docs/spike/round21_cdp.png", buf);
console.log("saved, bytes:", buf.length);
