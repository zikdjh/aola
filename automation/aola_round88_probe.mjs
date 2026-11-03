import fs from "node:fs";
const s = fs.readFileSync("D:/temp/ZCode/aola/client/web/ruffle/ruffle.js", "latin1");
let i = -1, n = 0;
while ((i = s.indexOf("fontSources", i + 1)) >= 0 && n < 6) {
  n++;
  console.log(`\n[${n}] @${i}: ...${s.slice(Math.max(0, i - 180), i + 220).replace(/\n/g, " ")}...`);
}
