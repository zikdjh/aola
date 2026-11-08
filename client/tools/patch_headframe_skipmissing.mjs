// patch_headframe_skipmissing.mjs — HeadFrameService.initMyHeadFrameData 跳过未配置头像框
// 背景（Round 70c）：账号拥有 materialdata 未配置的头像框 id（如 666）→
//   HeadFrameService.initMyHeadFrameData throw「你拥有了没有配置的头像框...」→
//   异常穿透 SocketClient.dispatch 终止整批 socket 消息 → 排在其后的服务初始化数据
//   全部未处理 → 世界装配冻结在 15/61（InscriptionService 等待永远不会到达的数据）。
// 字节码（materialservice.swf, HeadFrameService.initMyHeadFrameData）:
//   2c a9 14        pushstring "你拥有了没有配置的头像框,请联系集成更新头像框数据!!id:"
//   62 04           getlocal 4
//   a0              add
//   85              coerce_s
//   63 07           setlocal 7
//   5d e1 0c        findpropstrict Error
//   62 07           getlocal 7
//   4a e1 0c 01     constructprop Error 1
//   03              throw
// 补丁: 该 19B 块 → jump → 循环尾（addMyMaterial 之后的计数/条件），剩余 15B nop 填充（等长）
// 用法: node patch_headframe_skipmissing.mjs [materialservice.swf]
import fs from "node:fs";
import zlib from "node:zlib";

const file = process.argv[2] || "D:/temp/ZCode/aola/client/cache/aola.100bt.com/play/material/materialservice.swf";
const raw = fs.readFileSync(file);
if (raw.subarray(0, 3).toString("latin1") !== "CWS") { console.error("不是 CWS"); process.exit(1); }
const body = zlib.inflateSync(raw.subarray(8));

// pushstring 2601（报错文案）
const PAT = Buffer.from([0x2c, 0xa9, 0x14]);
// pushstring 之后到 throw 的完整块（报错构造 + throw）
const FROM = Buffer.from([
  0x62, 0x04, 0xa0, 0x85, 0x63, 0x07,             // getlocal4 / add / coerce_s / setlocal7
  0x5d, 0xe1, 0x0c, 0x62, 0x07, 0x4a, 0xe1, 0x0c, 0x01, 0x03, // findpropstrict Error; constructprop; throw
]);
const PREFIX_LEN = 3;   // pushstring 占 3B，FROM 紧随其后

let at = body.indexOf(Buffer.concat([PAT, FROM]));
if (at < 0) { console.error("未定位到 HeadFrameService 报错块（可能已打过补丁）"); process.exit(1); }

// 循环尾 = 计数/条件序列：d3 d2 66 <u30> 15（getlocal3 / getlocal2 / getproperty / iflt 回循环体）
// 注：abc_dump 的线性反汇编在此处有错位（把 increment_i 读成 decrement_i+throw），
// 以字节序列实况为准 —— 该序列完整解码自洽（coerce UserHeadFrame → getlocal6 → this →
// getlocal6 → callpropvoid → increment → getlocal3 → iflt）。
let tail = -1;
let s = at;
while ((s = body.indexOf(Buffer.from([0xd3, 0xd2, 0x66]), s + 1)) >= 0 && s < at + 600) {
  // getproperty 的 u30 操作数长度可变，iflt(0x15) 出现在其后 1-4 字节内
  for (let k = 3; k <= 6; k++) {
    if (body[s + k] === 0x15) { tail = s; break; }
  }
  if (tail >= 0) break;
}
if (tail < 0) { console.error("未定位到循环条件（d3 d2 66 + iflt）"); process.exit(1); }

const BLOCK = PAT.length + FROM.length;   // 19
const offset = tail - (at + 3);           // s24 相对 jump 下一条
const TO = Buffer.alloc(BLOCK);
TO[0] = 0x10;                              // jump
TO[1] = offset & 0xff;
TO[2] = (offset >> 8) & 0xff;
TO[3] = (offset >> 16) & 0xff;
for (let i = 4; i < BLOCK; i++) TO[i] = 0x02;   // nop 填充
if (offset < 0) { console.error("jump 偏移为负，检查循环尾定位:", offset); process.exit(1); }

TO.copy(body, at);
console.log(`patched @${at}: 未配置头像框 → jump 循环尾 @${tail}（offset ${offset}，块长 ${BLOCK}B）`);

const comp = zlib.deflateSync(body);
const head = Buffer.from(raw.subarray(0, 8));
head.writeUInt32LE(8 + body.length, 4);
fs.writeFileSync(file + ".preheadframe", raw);
fs.writeFileSync(file, Buffer.concat([head, comp]));
console.log("written " + file);
