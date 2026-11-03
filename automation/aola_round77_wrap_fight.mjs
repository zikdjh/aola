import fs from "node:fs";
const body = fs.readFileSync("D:/temp/ZCode/aola/automation/petfightnew_body.bin");
const head = Buffer.concat([Buffer.from("FWS"), Buffer.from([18]), Buffer.alloc(4)]);
head.writeUInt32LE(8 + body.length, 4);
fs.writeFileSync("D:/temp/ZCode/aola/automation/petfightnew_full.swf", Buffer.concat([head, body]));
console.log("wrapped");
