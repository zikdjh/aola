const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
try {
  const result = await page.cdp("Page.captureScreenshot", { format: "png", fromSurface: false });
  const fs = await import("node:fs");
  const buf = Buffer.from(result.data, "base64");
  fs.writeFileSync("D:/temp/ZCode/aola/client/docs/spike/round21_cdp2.png", buf);
  console.log("saved, bytes:", buf.length);
} catch (e) {
  console.log("fromSurface:false failed:", e.message);
  // Try the regular screenshot
  try {
    const shot = await page.screenshot({ path: "D:/temp/ZCode/aola/client/docs/spike/round21_cdp2.png" });
    console.log("regular shot:", shot);
  } catch (e2) { console.log("also failed:", e2.message); }
}
