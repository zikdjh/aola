// 把 materialservice 解压体重新封装为 CWS，供 abc_dump 解析
import fs from "node:fs";
import zlib from "node:zlib";
const body = fs.readFileSync("D:/temp/ZCode/aola/automation/ms_check_body.bin");
const ver = 18;
const len = 8 + body.length;
const comp = zlib.deflateSync(body);
const head = Buffer.concat([Buffer.from("CWS"), Buffer.from([ver]), Buffer.alloc(4)]);
head.writeUInt32LE(len, 4);
const out = Buffer.concat([head, comp]);
fs.writeFileSync("D:/temp/ZCode/aola/automation/ms_wrap.swf", out);
console.log("wrapped:", out.length, "body:", body.length);
