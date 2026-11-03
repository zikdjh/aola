// 解压 ZWS（SWF LZMA）原始 materialservice.swf.orig
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire("file:///C:/Users/z2351/AppData/Local/Temp/aola-lzma/");
const lzma = require("lzma");

const src = "D:/temp/ZCode/aola/client/docs/spike/materialservice.swf.orig";
const raw = fs.readFileSync(src);
console.log("sig:", raw.subarray(0, 3).toString("latin1"), "ver:", raw[3], "len:", raw.length);
if (raw.subarray(0, 3).toString("latin1") !== "ZWS") { console.log("not ZWS"); process.exit(0); }
// ZWS: header 8B + LZMA props(5) + uncompressed size u64(8) + data
const props = raw.subarray(8, 13);
const declared = Number(raw.readBigUInt64LE(13));
const payload = raw.subarray(21);
console.log("props:", props.toString("hex"), "declared:", declared, "payload:", payload.length);
const data = lzma.decompress(payload);
console.log("decompressed:", data.length);
fs.writeFileSync("D:/temp/ZCode/aola/automation/ms_orig_body.bin", Buffer.from(data));
const head = Buffer.concat([Buffer.from("FWS"), Buffer.from([raw[3]]), Buffer.alloc(4)]);
head.writeUInt32LE(8 + data.length, 4);
fs.writeFileSync("D:/temp/ZCode/aola/automation/ms_orig_full.swf", Buffer.concat([head, Buffer.from(data)]));
console.log("ok");
