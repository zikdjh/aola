// 解压官方原始 materialservice.swf 并封装为 FWS，供 abc_dump
import fs from "node:fs";
import zlib from "node:zlib";
const raw = fs.readFileSync("D:/temp/ZCode/aola/automation/materialservice_orig.swf");
const sig = raw.subarray(0, 3).toString("latin1");
console.log("sig:", sig, "ver:", raw[3], "len:", raw.length);
let body;
if (sig === "CWS") body = zlib.inflateSync(raw.subarray(8));
else if (sig === "ZWS") { console.log("ZWS - need lzma"); process.exit(0); }
else body = raw.subarray(8);
console.log("body:", body.length);
const head = Buffer.concat([Buffer.from("FWS"), Buffer.from([raw[3]]), Buffer.alloc(4)]);
head.writeUInt32LE(8 + body.length, 4);
fs.writeFileSync("D:/temp/ZCode/aola/automation/ms_orig_full.swf", Buffer.concat([head, body]));
console.log("wrapped ok");
