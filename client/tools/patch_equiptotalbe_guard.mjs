// patch_equiptotalbe_guard.mjs — PetBattleEffHelper.getEquipTotalBE 空值保护
// 背景: 账号里有 materialdata 未定义的宠物卡 id → getPetCardById 返回 null，
//       getEquipTotalBE 直接取 petCard.color 抛 #1009，导致 PetPackagePanel.initUI 中断。
// 位置: interfaces.swf ABC, m25 PetBattleEffHelper.getEquipTotalBE, code 31..62
// 原逻辑: PetCard3Eff[petCard.color][petCard.level] + getEquipAbilityBE(info) → 返回
// 补丁:   若 petCard == null → pushbyte 0 / returnvalue；否则原逻辑不变（等长 32B）
// 用法: node patch_equiptotalbe_guard.mjs <interfaces.swf>
import fs from "node:fs";
import zlib from "node:zlib";

const file = process.argv[2] || "D:/temp/ZCode/aola/client/cache/aola.100bt.com/play/library/interfaces.swf";
const raw = fs.readFileSync(file);
if (raw.subarray(0, 3).toString("latin1") !== "CWS") { console.error("不是 CWS"); process.exit(1); }
const body = zlib.inflateSync(raw.subarray(8));

const FROM = Buffer.from([
  0x5d, 0x09,             // findpropstrict 9 (PetCard3Eff)
  0x66, 0x09,             // getproperty 9
  0xd3,                   // getlocal3 (petCard)
  0x66, 0x4f,             // getproperty 79 (color)
  0x66, 0x1a,             // getpropertylate 26
  0xd3,                   // getlocal3
  0x66, 0x18,             // getproperty 24 (level)
  0x66, 0x1a,             // getpropertylate 26
  0x73,                   // convert_i
  0x63, 0x04,             // setlocal 4
  0x62, 0x04,             // getlocal 4
  0x5d, 0x70,             // findpropstrict 112 getEquipAbilityBE
  0xd1,                   // getlocal1
  0x46, 0x70, 0x01,       // callproperty 112 argc=1
  0xa0,                   // add
  0x73,                   // convert_i
  0x63, 0x05,             // setlocal 5
  0x62, 0x05,             // getlocal 5
  0x48,                   // returnvalue
]);

const TO = Buffer.from([
  0xd3,                   // getlocal3
  0x12, 0x18, 0x00, 0x00, // iffalse → L_null(+24, 下一条=36, L_null=60)
  0x5d, 0x09,             // findpropstrict 9
  0x66, 0x09,             // getproperty 9
  0xd3,                   // getlocal3
  0x66, 0x4f,             // getproperty 79 color
  0x66, 0x1a,             // getpropertylate
  0xd3,                   // getlocal3
  0x66, 0x18,             // getproperty 24 level
  0x66, 0x1a,             // getpropertylate
  0x73,                   // convert_i
  0x5d, 0x70,             // findpropstrict getEquipAbilityBE
  0xd1,                   // getlocal1
  0x46, 0x70, 0x01,       // callproperty argc=1
  0xa0,                   // add
  0x73,                   // convert_i
  0x48,                   // returnvalue
  0x24, 0x00,             // L_null: pushbyte 0
  0x48,                   // returnvalue
]);

if (FROM.length !== 32 || TO.length !== 32) { console.error(`长度异常 ${FROM.length}/${TO.length}`); process.exit(1); }
const at = body.indexOf(FROM);
if (at < 0) { console.error("特征未找到（可能已打过补丁）"); process.exit(1); }
if (body.indexOf(FROM, at + 1) >= 0) { console.error("特征多次出现，需人工确认"); process.exit(1); }

TO.copy(body, at);
console.log(`patched @${at}: petCard==null → return 0`);

const comp = zlib.deflateSync(body);
const head = Buffer.from(raw.subarray(0, 8));
head.writeUInt32LE(8 + body.length, 4);
fs.writeFileSync(file + ".preetb", raw);
fs.writeFileSync(file, Buffer.concat([head, comp]));
console.log("written " + file);
