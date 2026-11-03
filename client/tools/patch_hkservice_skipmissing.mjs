// patch_hkservice_skipmissing.mjs — HKService.initItemData 跳过 materialdata 未定义的 HK
// 字节码（materialservice.swf, HKService.initItemData）:
//   83 findpropstrict Error; pushstring "没有 "; getlocal 4; add; constructprop Error; throw
//   → 改为 jump → 117 (hasnext2 循环尾) + nop 填充（等长 14B）
// 与 ItemService/PlantItemService 的差异: throw 分支取的是 getlocal 4（非 getlocal 5）
// 用法: node patch_hkservice_skipmissing.mjs <materialservice.swf>
import fs from "node:fs";
import zlib from "node:zlib";

const file = process.argv[2] || "D:/temp/ZCode/aola/client/cache/aola.100bt.com/play/material/materialservice.swf";
const raw = fs.readFileSync(file);
if (raw.subarray(0, 3).toString("latin1") !== "CWS") { console.error("不是 CWS"); process.exit(1); }
const body = zlib.inflateSync(raw.subarray(8));

const FROM = Buffer.from([0x5d, 0xe1, 0x0c, 0x2c, 0xf8, 0x10, 0x62, 0x04, 0xa0, 0x4a, 0xe1, 0x0c, 0x01, 0x03]);
// jump@83 下一条 87，hasnext2 位于 117 → offset 30 = 0x1e
const TO = Buffer.from([0x10, 0x1e, 0x00, 0x00, ...Array(10).fill(0x02)]);

if (TO.length !== 14) { console.error("补丁长度异常"); process.exit(1); }
// 该特征在全库出现 6 次（ItemService/PlantItemService 等），HKService 的唯一区别是
// throw 前用 setlocal 6（局部槽 6 存 material），前置字节为 80 30 2a 63 06 20 14 0e 00 00
const PREFIX = Buffer.from([0x80, 0x30, 0x2a, 0x63, 0x06, 0x20, 0x14, 0x0e, 0x00, 0x00]);
const hits = [];
let i = -1;
while ((i = body.indexOf(FROM, i + 1)) >= 0) hits.push(i);
const at = hits.find((p) => p >= PREFIX.length && body.subarray(p - PREFIX.length, p).equals(PREFIX));
if (at === undefined) { console.error("未定位到 HKService.initItemData，候选:", hits); process.exit(1); }

TO.copy(body, at);
console.log(`patched @${at}: 缺失 HK → 跳过（jump hasnext2）`);

const comp = zlib.deflateSync(body);
const head = Buffer.from(raw.subarray(0, 8));
head.writeUInt32LE(8 + body.length, 4);
fs.writeFileSync(file + ".prehk", raw);
fs.writeFileSync(file, Buffer.concat([head, comp]));
console.log("written " + file);
