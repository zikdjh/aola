import fs from "node:fs";
import zlib from "node:zlib";
const raw = fs.readFileSync("D:/temp/ZCode/aola/automation/materialservice_skip.swf");
const body = zlib.inflateSync(raw.subarray(8));
const head = Buffer.concat([Buffer.from("FWS"), Buffer.from([raw[3]]), Buffer.alloc(4)]);
head.writeUInt32LE(8 + body.length, 4);
fs.writeFileSync("D:/temp/ZCode/aola/automation/ms_skip_full.swf", Buffer.concat([head, body]));
console.log("wrapped", body.length);
