// patch_pf_appear.mjs — 方案 B 第一刀：把 petfightnew.swf 里
//   MCPetContainer.showAppearEffect（m5168）的方法体换成「直接 dispatchGotPet」，
// 即跳过「亚比登场演出」的播放（含 光启 金色光柱 / 白羽全屏 / 星辉登场），但保留角色登场回调。
// 只改 code 字节（长度不变，其余 nop 填充），不动 ABC 结构与偏移。
// 用法: node patch_pf_appear.mjs <in.swf> <out.swf> [--dry]
import fs from "node:fs";
import zlib from "node:zlib";

const [, , inp, out, flag] = process.argv;
if (!inp || !out) { console.error("用法: node patch_pf_appear.mjs <in.swf> <out.swf> [--dry]"); process.exit(1); }

// 目标方法 code 的前 32 字节（由 abc_dump.mjs m showAppearEffect 得到）与总长
const CODE_LEN = 705;
const PREFIX = Buffer.from("d030572ad53065012080096d0365012080f8186d04650120803b6d056501276d", "hex");

// 新方法体：getlocal0; pushscope; getlocal0; getlocal0; getproperty _loacId(3716);
//           callpropvoid dispatchGotPet(3770) argc=1; returnvoid; 其余 nop
const u30 = (v) => { const o = []; do { let b = v & 0x7f; v >>>= 7; if (v) b |= 0x80; o.push(b); } while (v); return o; };
const newCode = Buffer.from([
  0xd0, 0x30,                    // getlocal0; pushscope
  0xd0, 0xd0, 0x66, ...u30(3716),// getlocal0(this); getlocal0; getproperty _loacId
  0x4f, ...u30(3770), 0x01,      // callpropvoid dispatchGotPet argc=1
  0x47,                          // returnvoid
]);
const padded = Buffer.alloc(CODE_LEN, 0x02);   // nop 填充
newCode.copy(padded, 0);

const raw = fs.readFileSync(inp);
const sig = raw.subarray(0, 3).toString("latin1");
if (sig !== "CWS") { console.error("只支持 CWS（当前 " + sig + "）"); process.exit(1); }
const body = zlib.inflateSync(raw.subarray(8));

// 找到 DoABC 标签，在其中的 ABC 段里定位目标 code
const nbits = body[0] >> 3;
let p = Math.ceil((5 + 4 * nbits) / 8) + 4;
let hitOff = -1, abcStart = -1, abcEnd = -1;
while (p + 2 <= body.length) {
  const h = body.readUInt16LE(p); p += 2;
  const code = h >> 6; let len = h & 0x3f;
  if (len === 0x3f) { len = body.readUInt32LE(p); p += 4; }
  if (code === 82) {
    const tagStart = p;
    // DoABC: flags(4) + name(NUL) + abc
    let o = tagStart + 4;
    while (o < tagStart + len && body[o] !== 0) o++;
    abcStart = o + 1;
    abcEnd = tagStart + len;
    let idx = body.indexOf(PREFIX, abcStart);
    if (idx >= 0 && idx + CODE_LEN <= abcEnd) {
      // 唯一性检查
      const second = body.indexOf(PREFIX, idx + 1);
      if (second >= 0 && second < abcEnd) { console.error("!! 前缀命中多次，拒绝补丁"); process.exit(2); }
      hitOff = idx;
    }
  }
  p += len;
  if (code === 0) break;
}
if (hitOff < 0) { console.error("没找到目标方法 code（PREFIX 未命中）"); process.exit(3); }
console.log(`命中 showAppearEffect code @ body+${hitOff}（长 ${CODE_LEN}）`);
console.log("原头部 : " + body.subarray(hitOff, hitOff + 16).toString("hex"));
console.log("新头部 : " + padded.subarray(0, 16).toString("hex"));

if (flag === "--dry") { console.log("dry run，未写文件"); process.exit(0); }

const patchedBody = Buffer.from(body);
padded.copy(patchedBody, hitOff);

const head = Buffer.from(raw.subarray(0, 8));
head.write("CWS", 0, "latin1");
head.writeUInt32LE(8 + patchedBody.length, 4);
const z = zlib.deflateSync(patchedBody, { level: 9 });
fs.writeFileSync(out, Buffer.concat([head, z]));
console.log(`输出 ${out}: ${raw.length} -> ${8 + z.length} B`);
