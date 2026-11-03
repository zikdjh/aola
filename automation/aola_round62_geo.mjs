// round62: 取精确画布几何 + 1:1 画布截图
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const OUT = "D:/temp/ZCode/aola/client/docs/spike";

const geo = await page.evaluate(() => {
  const el = document.querySelector("ruffle-player");
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height, vw: innerWidth, vh: innerHeight, dpr: devicePixelRatio };
});
console.log("GEO:", JSON.stringify(geo));
await page.screenshot({ path: `${OUT}/r62_stage.png`, clip: { x: geo.x, y: geo.y, width: geo.w, height: geo.h } });
console.log("stage shot saved");
