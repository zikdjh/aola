// patch_seq3.mjs — DefenseMsgSeq worker 方法补丁（v3：tag 流级拼接，同步修正 DoABC tag 长度）
// 目标方法: seqLoader.enqueue 调用 + num1-4 拷贝（this.numX = this.seqLoader.numX）
// Ruffle ShaderJob 空壳 → SeqLoader 永不完成 → num 恒 0 → 防御序列失效 → 被踢
// 补丁: ① NOP 掉 enqueue 头部 ② num1-4 直填 PBJ 常量 (2, 653, 471, 1)
// 关键教训: 拼接改变 DoABC 载荷长度后必须重写 tag 头长度，否则 tag 流错位（v2 教训）
// 用法: node patch_seq3.mjs <in.swf> <out.swf>
import fs from "node:fs";
import zlib from "node:zlib";

const [, , inFile, outFile] = process.argv;
const raw = fs.readFileSync(inFile);
let prefix, comp0, swfVer;
if (raw.subarray(8, 11).toString("latin1") === "CWS") {       // 自定义 8B 前缀 + CWS@8
  prefix = raw.subarray(0, 8); comp0 = raw.subarray(16); swfVer = raw[11];
} else if (raw.subarray(0, 3).toString("latin1") === "CWS") { // 裸 CWS
  prefix = Buffer.alloc(0); comp0 = raw.subarray(8); swfVer = raw[3];
} else { console.error("unknown container:", inFile); process.exit(1); }
const body = zlib.inflateSync(comp0);

// ---- 解析 SWF 头（RECT@0）→ tag 区起点 ----
let bit = 0, byte = 0;
const ub = (n) => { let v = 0; while (n > 0) { v = (v << 1) | ((body[byte] >> (7 - (bit % 8))) & 1); bit++; if (bit % 8 === 0) byte++; n--; } return v; };
const nb = ub(5); ub(nb); ub(nb); ub(nb); ub(nb);
if (bit % 8 !== 0) byte++;
byte += 4;
const tagsStart = byte;

// ---- 补丁模式 ----
const HEAD = Buffer.from([0xd0, 0x66, 0x02, 0x5d, 0x01, 0x66, 0x01, 0x66, 0x03, 0xd0, 0x66, 0x04, 0x46, 0x07, 0x02, 0x29]);
const COPIES = [
  { from: Buffer.from([0xd0, 0xd0, 0x66, 0x02, 0x66, 0x08, 0x68, 0x09]), to: Buffer.from([0xd0, 0x24, 0x02, 0x68, 0x09]) },        // num1 = 2
  { from: Buffer.from([0xd0, 0xd0, 0x66, 0x02, 0x66, 0x0a, 0x68, 0x0b]), to: Buffer.from([0xd0, 0x25, 0x8d, 0x05, 0x68, 0x0b]) },  // num2 = 653
  { from: Buffer.from([0xd0, 0xd0, 0x66, 0x02, 0x66, 0x0c, 0x68, 0x0d]), to: Buffer.from([0xd0, 0x25, 0xd7, 0x03, 0x68, 0x0d]) },  // num3 = 471
  { from: Buffer.from([0xd0, 0xd0, 0x66, 0x02, 0x66, 0x0e, 0x68, 0x0f]), to: Buffer.from([0xd0, 0x24, 0x01, 0x68, 0x0f]) },        // num4 = 1
];

// ---- 逐 tag 重建：DoABC 载荷内拼接并修正长度 ----
const parts = [body.subarray(0, tagsStart)];
let off = tagsStart, patched = 0, tags = 0;
while (off < body.length - 1) {
  const c16 = body[off] | (body[off + 1] << 8); off += 2;
  let len = c16 & 0x3f;
  const longForm = len === 0x3f;
  if (longForm) { len = body.readUInt32LE(off); off += 4; }
  const tag = c16 >> 6;
  if (tag === 0) break;                                   // End
  tags++;
  let payload = body.subarray(off, off + len);
  if (tag === 82) {                                       // DoABC
    let p = payload, delta = 0, hit = 0, headPos = -1;
    const PATCHES = [{ label: "enqueue-head", from: HEAD, to: Buffer.alloc(HEAD.length, 0x02) },
                     ...COPIES.map((c, k) => ({ label: "copy#" + k, from: c.from, to: c.to }))];
    for (const { label, from, to } of PATCHES) {
      const pos = p.indexOf(from);
      if (pos < 0 || p.indexOf(from, pos + 1) >= 0) continue;   // 不存在或不唯一 → 跳过
      if (label === "enqueue-head") headPos = pos;
      p = Buffer.concat([p.subarray(0, pos), to, p.subarray(pos + from.length)]);
      delta += to.length - from.length; hit++;
      console.log(`  [patch] ${label} @${pos}: ${from.length}B -> ${to.length}B`);
    }
    // 回写 method_body 的 code_length。HEAD 模式前是方法开头的 `d0 30`
    // (getlocal0 pushscope)，代码区真正起点 = headPos-2，其前紧邻 u30 code_len
    if (headPos >= 0 && delta !== 0) {
      const codeStart = headPos - 2;
      if (p[codeStart] !== 0xd0 || p[codeStart + 1] !== 0x30) throw new Error("unexpected prologue before HEAD");
      let w = 0;
      while (w < codeStart && (p[codeStart - 1 - w] & 0x80)) w++;
      w++;
      const lenStart = codeStart - w;
      let origLen = 0;
      for (let k = 0; k < w; k++) origLen |= (p[lenStart + k] & 0x7f) << (7 * k);
      const newLen = origLen + delta;
      const enc = [];
      let v = newLen;
      do { let b = v & 0x7f; v >>>= 7; if (v) b |= 0x80; enc.push(b); } while (v);
      if (enc.length !== w) throw new Error(`code_len width change ${w}->${enc.length}, unsupported`);
      for (let k = 0; k < w; k++) p[lenStart + k] = enc[k];
      console.log(`  [patch] code_len ${origLen} -> ${newLen} (u30 @${lenStart}, width ${w})`);
    }
    if (hit) { patched += hit; payload = p; }
  }
  const newLen = payload.length;
  if (longForm || newLen >= 0x3f) {
    const h = Buffer.alloc(6);
    h.writeUInt16LE((tag << 6) | 0x3f, 0);
    h.writeUInt32LE(newLen, 2);
    parts.push(h, payload);
  } else {
    const h = Buffer.alloc(2);
    h.writeUInt16LE((tag << 6) | newLen, 0);
    parts.push(h, payload);
  }
  off += len;
}
parts.push(Buffer.from([0, 0]));                          // End tag
const out = Buffer.concat(parts);
console.log(`tags=${tags} patched=${patched} body ${body.length} -> ${out.length}B`);
if (!patched) { console.error("nothing patched:", inFile); process.exit(1); }

// ---- 重组容器 ----
const comp = zlib.deflateSync(out);
const declaredLen = 8 + out.length;                        // FileLength = CWS 头 8B + 载荷（不计自定义前缀）
const res = Buffer.concat([prefix, Buffer.from("CWS"), Buffer.from([swfVer ?? 18]), u32le(declaredLen), comp]);
fs.writeFileSync(outFile, res);
console.log(`patched: ${inFile} -> ${outFile} (${raw.length} -> ${res.length}B)`);

function u32le(v) { const b = Buffer.alloc(4); b.writeUInt32LE(v >>> 0, 0); return b; }
