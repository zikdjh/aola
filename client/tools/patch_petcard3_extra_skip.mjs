// patch_petcard3_extra_skip.mjs — PetBattleEffHelper.getPetCard3AddByBriefInfo 跳过 extraEff 子调用
// 背景: getPetCard3SingleExtraEff 内部 getPetCardById().color 为 null 时抛 #1009，
//       导致 PetPackagePanel.initUI 中断（背包打不开）。
// 位置: interfaces.swf ABC, getPetCard3AddByBriefInfo 循环体 code 117..127 (11B)
//   原: findpropstrict getPetCard3SingleExtraEff / getlocal7 / getlocal1.raceId / callproperty argc=2 / convert_i / setlocal9
//   补: pushbyte 0 / convert_i / setlocal 9 + nop×6（等长，栈平衡）
// 用法: node patch_petcard3_extra_skip.mjs <interfaces.swf>
import fs from "node:fs";
import zlib from "node:zlib";

const file = process.argv[2] || "D:/temp/ZCode/aola/client/cache/aola.100bt.com/play/library/interfaces.swf";
const raw = fs.readFileSync(file);
if (raw.subarray(0, 3).toString("latin1") !== "CWS") { console.error("不是 CWS"); process.exit(1); }
const body = zlib.inflateSync(raw.subarray(8));

const FROM = Buffer.from([
  0x5d, 0x69,             // findpropstrict 105 getPetCard3SingleExtraEff
  0x62, 0x07,             // getlocal 7
  0xd1,                   // getlocal1
  0x66, 0x20,             // getproperty 32 raceId
  0x46, 0x69, 0x02,       // callproperty 105 argc=2
  0x73,                   // convert_i
  0x63, 0x09,             // setlocal 9
]);

const TO = Buffer.from([
  0x24, 0x00,             // pushbyte 0
  0x73,                   // convert_i
  0x63, 0x09,             // setlocal 9
  ...Array(8).fill(0x02),
]);

if (FROM.length !== 13 || TO.length !== 13) { console.error(`长度异常 ${FROM.length}/${TO.length}`); process.exit(1); }
const at = body.indexOf(FROM);
if (at < 0) { console.error("特征未找到（可能已打过补丁）"); process.exit(1); }
if (body.indexOf(FROM, at + 1) >= 0) { console.error("特征多次出现，需人工确认"); process.exit(1); }

TO.copy(body, at);
console.log(`patched @${at}: getPetCard3SingleExtraEff → 0`);

const comp = zlib.deflateSync(body);
const head = Buffer.from(raw.subarray(0, 8));
head.writeUInt32LE(8 + body.length, 4);
fs.writeFileSync(file + ".prepc3extra", raw);
fs.writeFileSync(file, Buffer.concat([head, comp]));
console.log("written " + file);
