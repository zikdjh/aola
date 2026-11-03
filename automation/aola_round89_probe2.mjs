import fs from "node:fs";
const s = fs.readFileSync("D:/temp/ZCode/aola/client/web/ruffle/ruffle.js", "latin1");
for (const key of ["deviceFontRenderer", "addFont(", "defaultFonts"]) {
  let i = -1, n = 0;
  console.log(`\n===== ${key} =====`);
  while ((i = s.indexOf(key, i + 1)) >= 0 && n < 3) {
    n++;
    console.log(`@${i}: ...${s.slice(Math.max(0, i - 150), i + 260).replace(/\n/g, " ")}...\n`);
  }
}
