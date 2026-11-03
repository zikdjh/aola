// patch_petcard3_skipmissing.mjs — 让 PetCard3Service.initDatas 跳过客户端未定义的宠物卡
// 字节码（materialservice.swf, PetCard3Service.initDatas 循环体）:
//   113 getlocal0 / 114 getlocal4 / 116 callproperty getPetCardById
//   120 coerce Material / 122 setlocal8
//   124..144 从 local1 读取 3 个字段写入 local9/10/11
//   145..174 UserPetCard3(material,...) → addMyMaterial
// 问题: getPetCardById 返回 null 时 UserPetCard3/UserMaterial 构造抛 #1009
// 补丁: 120..144 (25B) 改为 setlocal8 / getlocal8 / iffalse →178(hasnext2) + nop×17
// 等长替换，分支偏移不变（iffalse@124 下一条 128，目标 178 → +50）
// 用法: node patch_petcard3_skipmissing.mjs <materialservice.swf>
import fs from "node:fs";
import zlib from "node:zlib";

const file = process.argv[2] || "D:/temp/ZCode/aola/client/cache/aola.100bt.com/play/material/materialservice.swf";
const raw = fs.readFileSync(file);
if (raw.subarray(0, 3).toString("latin1") !== "CWS") { console.error("不是 CWS 容器"); process.exit(1); }
const body = zlib.inflateSync(raw.subarray(8));

const FROM = Buffer.from([
  0x80, 0x30,             // coerce Material(48)
  0x63, 0x08,             // setlocal 8
  0xd1, 0x66, 0x86, 0x17, 0x73, 0x63, 0x09,   // getlocal1 getproperty(2950) convert_i setlocal 9
  0xd1, 0x66, 0x87, 0x17, 0x73, 0x63, 0x0a,   // ... 2951 → local10
  0xd1, 0x66, 0x88, 0x17, 0x73, 0x63, 0x0b,   // ... 2952 → local11
]);
if (FROM.length !== 25) { console.error("特征长度异常 " + FROM.length); process.exit(1); }

const TO = Buffer.from([
  0x63, 0x08,             // setlocal 8
  0x62, 0x08,             // getlocal 8
  0x12, 0x32, 0x00, 0x00, // iffalse → hasnext2(+50)
  ...Array(17).fill(0x02),
]);
if (TO.length !== 25) { console.error("补丁长度异常 " + TO.length); process.exit(1); }

const at = body.indexOf(FROM);
if (at < 0) { console.error("特征未找到（可能已打过补丁）"); process.exit(1); }
if (body.indexOf(FROM, at + 1) >= 0) { console.error("特征出现多次，需要人工确认"); process.exit(1); }

TO.copy(body, at);
console.log(`patched @${at}: 未定义宠物卡 → 跳过（jump hasnext2）`);

const comp = zlib.deflateSync(body);
const head = Buffer.from(raw.subarray(0, 8));
head.writeUInt32LE(8 + body.length, 4);
const out = Buffer.concat([head, comp]);
fs.writeFileSync(file + ".prepc3", raw);
fs.writeFileSync(file, out);
console.log(`written ${file} (${out.length}B, body ${body.length}B)`);
