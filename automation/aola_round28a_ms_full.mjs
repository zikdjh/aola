// 生成 FWS 完整容器（8B 头 + 解压体），abc_dump 期望从 offset 8 开始解析
import fs from "node:fs";
import zlib from "node:zlib";
const src = "D:/temp/ZCode/aola/client/cache/aola.100bt.com/play/material/materialservice.swf";
const raw = fs.readFileSync(src);
const body = zlib.inflateSync(raw.subarray(8));
const head = Buffer.concat([Buffer.from("FWS"), Buffer.from([raw[3]]), Buffer.alloc(4)]);
head.writeUInt32LE(8 + body.length, 4);
fs.writeFileSync("D:/temp/ZCode/aola/automation/ms_full.swf", Buffer.concat([head, body]));
console.log("written", 8 + body.length);
