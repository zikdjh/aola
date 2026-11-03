// patch_hkhelp_skip.mjs — HKHelp.getPbiHkBattle 跳过未定义 HK 槽位
// 背景: 账号 HK 槽位 id=350 在 materialdata 中无定义 → getHKDataById 返回 null，
//       循环条件 local8.wordDataAry.length 抛 #1009，导致背包与战斗力汇总中断。
// 位置: interfaces.swf ABC, HKHelp.getPbiHkBattle code 111..114
//   原: ifnle →119（正常放行），115 jump →230（NoExistId 命中时跳过）
//   补: 111 改为 jump →230，所有槽位直接跳过（HK 加成按 0 计，与摘除 HKService 时一致）
// 用法: node patch_hkhelp_skip.mjs <interfaces.swf>
import fs from "node:fs";
import zlib from "node:zlib";

const file = process.argv[2] || "D:/temp/ZCode/aola/client/cache/aola.100bt.com/play/library/interfaces.swf";
const raw = fs.readFileSync(file);
if (raw.subarray(0, 3).toString("latin1") !== "CWS") { console.error("不是 CWS"); process.exit(1); }
const body = zlib.inflateSync(raw.subarray(8));

const FROM = Buffer.from([
  0x62, 0x07,             // getlocal 7
  0x5d, 0x0e,             // findpropstrict 14 HKConfig
  0x66, 0x0e,             // getproperty 14
  0x66, 0x19,             // getproperty 25 NoExistId
  0x0d, 0x04, 0x00, 0x00, // ifnle →119
  0x10, 0x6f, 0x00, 0x00, // jump →230
]);
const TO = Buffer.from([
  0x62, 0x07, 0x5d, 0x0e, 0x66, 0x0e, 0x66, 0x19,
  0x29, 0x29,             // pop ×2（平衡 ifnle 的两个操作数）
  0x10, 0x71, 0x00, 0x00, // jump →230（jump@113，下一条=117）
  0x02, 0x02,
]);
if (FROM.length !== TO.length) { console.error("长度不一致"); process.exit(1); }

if (body.indexOf(FROM) < 0) { console.error("特征未找到（可能已打过补丁）"); process.exit(1); }
if (body.indexOf(FROM, body.indexOf(FROM) + 1) >= 0) { console.error("特征多次出现，需人工确认"); process.exit(1); }

const at = body.indexOf(FROM);
TO.copy(body, at);
console.log(`patched @${at}: HK 槽位全部跳过（返回 0）`);

const comp = zlib.deflateSync(body);
const head = Buffer.from(raw.subarray(0, 8));
head.writeUInt32LE(8 + body.length, 4);
fs.writeFileSync(file + ".prehkhelp", raw);
fs.writeFileSync(file, Buffer.concat([head, comp]));
console.log("written " + file);
