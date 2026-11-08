// analyze_ms.cjs — 分析最新 materialservice（ZWS）的 initItemData throw 位点
const fs = require("fs");
const LZMA = require("lzma");

function zwsBody(path) {
  const raw = fs.readFileSync(path);
  const sig = raw.subarray(0, 3).toString("latin1");
  if (sig === "CWS") return require("zlib").inflateSync(raw.subarray(8));
  const compLen = raw.readUInt32LE(8);
  const props = raw.subarray(12, 17);
  const data = raw.subarray(17, 17 + compLen);
  const out = LZMA.decompress(Buffer.concat([props, Buffer.alloc(8, 0xff), data]));
  return Buffer.isBuffer(out) ? out : Buffer.from(out);
}

const SWF = process.argv[2] || "../../client/cache/aola.100bt.com/play/material/materialservice~2026110521924920.swf";
const body = zwsBody(SWF);
console.log("解压后 body:", Math.round(body.length / 1024) + "KB");

// 1) 在常量池定位 "没有 " 字符串的 u30 编码（扫描 ABC 的字符串区——直接搜 UTF-8 字节位置不可靠，
//    改为搜代码流里 pushstring <u30> 后紧跟 throw 结构的特征）
// 2) 直接找 throw 结构: 5d xx xx | 62/63 xx | 4a xx xx 01 | 03（findpropstrict Error; constructprop; throw）
//    前面通常有 2c xx（pushstring "没有 "）+ 62 xx（getlocal）+ a0（add）+ 85（coerce_s）+ 63/6d xx（setlocal）
const PAT_START = Buffer.from([0x2c]);   // pushstring
let hits = [];
let i = -1;
// 枚举所有 [2c u30] [62/63 u30] a0 85 [63/6d u30] [5d u30] [62/63 u30] [4a u30 u30] 03 序列
function u30at(buf, p) {
  let v = 0, shift = 0, used = 0;
  for (;;) {
    const b = buf[p + used];
    v |= (b & 0x7f) << shift;
    shift += 7;
    used++;
    if (!(b & 0x80)) break;
    if (used > 5) return null;
  }
  return { v, used };
}
for (let p = 0; p < body.length - 20; p++) {
  if (body[p] !== 0x2c) continue;
  const s1 = u30at(body, p + 1);
  if (!s1) continue;
  let q = p + 1 + s1.used;
  if (body[q] !== 0x62 && body[q] !== 0x63 && body[q] !== 0xd0 && body[q] !== 0xd1) continue;
  const s2 = u30at(body, q + 1);
  if (!s2) continue;
  q = q + 1 + s2.used;
  if (body[q] !== 0xa0) continue;            // add
  q++;
  if (body[q] !== 0x85) continue;            // coerce_s
  q++;
  if (body[q] !== 0x63 && body[q] !== 0x6d) continue;  // setlocal/setlocallate
  const s3 = (body[q] === 0x63) ? u30at(body, q + 1) : { used: 0 };
  if (!s3) continue;
  q = q + 1 + s3.used;
  if (body[q] !== 0x5d) continue;            // findpropstrict Error
  const s4 = u30at(body, q + 1);
  if (!s4) continue;
  q = q + 1 + s4.used;
  if (body[q] !== 0x62 && body[q] !== 0x63) continue;
  const s5 = u30at(body, q + 1);
  if (!s5) continue;
  q = q + 1 + s5.used;
  if (body[q] !== 0x4a) continue;            // constructprop
  const s6 = u30at(body, q + 1);
  if (!s6) continue;
  q = q + 1 + s6.used;
  const s7 = u30at(body, q);
  if (!s7 || s7.v !== 1) continue;           // argc=1
  q = q + s7.used;
  if (body[q] !== 0x03) continue;            // throw
  hits.push({ patStart: p, throwAt: q, blockEnd: q + 1 });
  p = q;
}
console.log("「没有 N」throw 位点数:", hits.length);
for (const h of hits) {
  // 每个位点：throw 之后最近的循环尾特征（hasnext2 32 xx xx / 或 d3d2 66 条件）
  let hn = -1, hnIdx = body.indexOf(Buffer.from([0x32]), h.throwAt);
  if (hnIdx >= 0 && hnIdx < h.throwAt + 80) hn = hnIdx;
  console.log(`  @${h.patStart}..${h.throwAt}（块长 ${h.throwAt + 1 - h.patStart}）→ 其后 60B 内 hasnext2 @${hn}`);
  console.log(`    后 32B: ${body.subarray(h.throwAt + 1, h.throwAt + 33).toString("hex")}`);
}
fs.writeFileSync("ms_latest_body.bin", body);
