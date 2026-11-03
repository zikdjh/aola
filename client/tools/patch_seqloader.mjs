// patch_seqloader.mjs — DefenseMsgSeq 构造函数硬编码 num1-4（PBJ 内核解码值）
// Ruffle 的 ShaderJob 是空壳 → SeqLoader 永不完成 → num1-4=0 → 防御序列失效 → 被服务器踢
// 常量来自 kernel_0.bin 的 PBJ 解码：dst = (r=2.0, g=653.0, b=471.0, a=1.0)
// 用法: node patch_seqloader.mjs <in.swf> <out.swf>
import fs from "node:fs";
import zlib from "node:zlib";

const [, , inFile, outFile] = process.argv;
const raw = fs.readFileSync(inFile);
// 两种容器：裸 CWS（body@8）或 8 字节自定义前缀 + CWS（body@16）
let prefix, body;
if (raw.subarray(8, 11).toString("latin1") === "CWS") {
  prefix = raw.subarray(0, 8);           // 自定义前缀 + CWS@8
  body = zlib.inflateSync(raw.subarray(16));
  var swfVer = raw[11];
  var layout = "8+CWS";
} else if (raw.subarray(0, 3).toString("latin1") === "CWS") {
  prefix = Buffer.alloc(0);              // 裸 CWS
  body = zlib.inflateSync(raw.subarray(8));
  var swfVer = raw[3];
  var layout = "CWS";
} else { console.error("unknown container:", inFile, raw.subarray(0, 11).toString("latin1")); process.exit(1); }

// ---- SWF tag 收集 ----
let bit = 0, byte = 8;
function ub(n) { let v = 0; while (n > 0) { v = (v << 1) | ((body[byte] >> (7 - (bit % 8))) & 1); bit++; if (bit % 8 === 0) byte++; n--; } return v; }
const nb = ub(5); ub(nb); ub(nb); ub(nb); ub(nb);
if (bit % 8 !== 0) byte++;
byte += 4;
let off = byte;
const tags = [];   // {tag, payload}
while (off < body.length - 1) {
  const c16 = body[off] | (body[off + 1] << 8); off += 2;
  let len = c16 & 0x3f;
  if (len === 0x3f) { len = body.readUInt32LE(off); off += 4; }
  const tag = c16 >> 6;
  if (tag === 0) break;
  tags.push({ tag, payload: body.subarray(off, off + len) });
  off += len;
}

// ---- 逐 DoABC 尝试补丁 ----
let patchCount = 0;
const newTags = tags.map(({ tag, payload }) => {
  if (tag !== 82) return { tag, payload };
  const out = patchABC(payload);
  if (out) { patchCount++; return { tag, payload: out }; }
  return { tag, payload };
});
if (!patchCount) { console.error("DefenseMsgSeq not found in", inFile); process.exit(1); }

// ---- 重建 SWF body ----
const parts = [body.subarray(0, byte)];   // 头（rect+rate+count）
for (const { tag, payload } of newTags) {
  if (payload.length >= 0x3f) {
    const h = Buffer.alloc(6);
    h.writeUInt16LE((tag << 6) | 0x3f, 0);
    h.writeUInt32LE(payload.length, 2);
    parts.push(h, payload);
  } else {
    const h = Buffer.alloc(2);
    h.writeUInt16LE((tag << 6) | payload.length, 0);
    parts.push(h, payload);
  }
}
parts.push(Buffer.from([0, 0]));          // End tag
const newBody = Buffer.concat(parts);

// ---- 重新压缩 + 容器头 ----
const comp = zlib.deflateSync(newBody);
const declaredLen = (layout === "8+CWS" ? 8 : 8) + newBody.length;
const out = Buffer.concat([prefix, Buffer.from("CWS"), Buffer.from([swfVer ?? 18]), u32le(declaredLen), comp]);
fs.writeFileSync(outFile, out);
console.log(`patched ${patchCount} ABC block(s) [${layout}]: ${inFile} -> ${outFile} (${raw.length} -> ${out.length}B)`);

// ============ ABC 解析 + 补丁 ============
function patchABC(d) {
  let p = 0;
  const u8 = () => d[p++];
  const u30 = () => { let v = 0, s = 0; for (;;) { const b = d[p++]; v |= (b & 0x7f) << s; if (!(b & 0x80)) break; s += 7; } return v >>> 0; };
  const flags = d.readUInt32LE(p); p += 4;
  while (d[p] !== 0) p++; p++;                    // abc name
  p += 4;                                          // minor/major

  // cpool
  let c = u30(); for (let i = 1; i < c; i++) u30();          // ints
  c = u30(); for (let i = 1; i < c; i++) u30();              // uints
  c = u30(); p += Math.max(0, c - 1) * 8;                    // doubles
  const strings = [""];
  c = u30(); for (let i = 1; i < c; i++) { const l = u30(); strings.push(d.toString("utf8", p, p + l)); p += l; }
  c = u30(); for (let i = 1; i < c; i++) { u8(); u30(); }    // ns
  c = u30(); for (let i = 1; i < c; i++) { const n = u30(); for (let k = 0; k < n; k++) u30(); } // ns_set
  const mnames = [""];
  c = u30();
  for (let i = 1; i < c; i++) {
    const kind = u8();
    if (kind === 0x07 || kind === 0x0D) { u30(); const n = u30(); mnames.push(strings[n] || "?"); }
    else if (kind === 0x0F || kind === 0x10) { const n = u30(); mnames.push(strings[n] || "?"); }
    else if (kind === 0x09 || kind === 0x0E) { u30(); const n = u30(); mnames.push(strings[n] || "?"); }
    else if (kind === 0x1B || kind === 0x1C) { u30(); mnames.push("<late>"); }
    else if (kind === 0x1D) { u30(); const pc = u30(); for (let k = 0; k < pc; k++) u30(); mnames.push("TN{}"); }
    else mnames.push("?");
  }

  // method_info
  const mcount = u30();
  for (let i = 0; i < mcount; i++) {
    const pc = u30(); u30();
    for (let k = 0; k < pc; k++) u30();
    u30(); const fl = u8();
    if (fl & 0x08) { const oc = u30(); for (let k = 0; k < oc; k++) { u30(); u8(); } }
    if (fl & 0x40) { for (let k = 0; k < pc; k++) u30(); }
  }
  // metadata
  c = u30();
  for (let i = 0; i < c; i++) { u30(); const n = u30(); for (let k = 0; k < n; k++) { u30(); u30(); } }
  // traits
  function readTraits() {
    const tc = u30();
    for (let t = 0; t < tc; t++) {
      u30(); const kb = u8(); const kind = kb & 0x0f;
      if (kind === 0x00 || kind === 0x06) { u30(); u30(); const vi = u30(); if (vi !== 0) u8(); }
      else if (kind === 0x04) { u30(); u30(); }
      else if (kind === 0x05 || kind === 0x01 || kind === 0x02 || kind === 0x03) { u30(); u30(); }
      if (kb & 0x40) { const mc = u30(); for (let m = 0; m < mc; m++) u30(); }
    }
  }
  // instances（找 DefenseMsgSeq 的 iinit）
  const classCount = u30();
  let target = -1;
  for (let i = 0; i < classCount; i++) {
    const nm = mnames[u30()] || "?";
    u30(); // super
    const fl = u8();
    if (fl & 0x08) u30();
    const ic = u30(); for (let k = 0; k < ic; k++) u30();
    const iinit = u30();
    readTraits();
    if (nm === "DefenseMsgSeq") target = iinit;
  }
  for (let i = 0; i < classCount; i++) { u30(); readTraits(); }   // class_info
  c = u30(); for (let i = 0; i < c; i++) { u30(); readTraits(); } // scripts
  // bodies（定位 target 并拼接）
  const bc = u30();
  for (let i = 0; i < bc; i++) {
    const bodyStart = p;
    const m = u30();
    u30(); const locals = u30(); const isd = u30(); const msd = u30();
    const cl = u30(); p += cl;
    const ec = u30();
    for (let k = 0; k < ec; k++) { u30(); u30(); u30(); u30(); u30(); }
    readTraits();
    const bodyEnd = p;
    if (m === target) {
      // 多名 sanity：9/11/13/15 = num1..4
      for (const [idx, want] of [[9, "num1"], [11, "num2"], [13, "num3"], [15, "num4"]]) {
        if (!mnames[idx] || !mnames[idx].includes(want)) {
          console.error(`  ! multiname check fail: mn${idx}=${mnames[idx]} want ${want}`);
          return null;
        }
      }
      const code = Buffer.from([
        0xd0,             // getlocal0
        0x30,             // pushscope
        0xd0, 0x49, 0x00, // constructsuper 0
        0xd0, 0x24, 0x02, 0x68, 0x09,             // num1 = 2
        0xd0, 0x25, 0x8d, 0x05, 0x68, 0x0b,       // num2 = 653
        0xd0, 0x25, 0xd7, 0x03, 0x68, 0x0d,       // num3 = 471
        0xd0, 0x24, 0x01, 0x68, 0x0f,             // num4 = 1
        0x48,             // returnvoid
      ]);
      const head = Buffer.alloc(0);
      // 重建 entry：method(已读) + 栈/局部/作用域 + 新 code + 0 exc + 0 traits
      // max_stack=3（getlocal0+pushshort 最多 2，留余量）；max_scope_depth 必须 ≥
      // init_scope_depth+1，因为插入的 pushscope 占 1 层——原值若为 0 会 VerifyError #1024
      const entry = Buffer.concat([
        u30bytes(m), u30bytes(3), u30bytes(locals), u30bytes(isd), u30bytes(Math.max(msd, isd + 1)),
        u30bytes(code.length), code,
        u30bytes(0), u30bytes(0),
      ]);
      console.log(`  patched body m${m} (code ${cl} -> ${code.length}B, locals ${locals})`);
      return Buffer.concat([d.subarray(0, bodyStart), entry, d.subarray(bodyEnd)]);
    }
  }
  return null;
}

function u30bytes(v) {
  const out = [];
  do { let b = v & 0x7f; v >>>= 7; if (v) b |= 0x80; out.push(b); } while (v);
  return Buffer.from(out);
}

function u32le(v) {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(v >>> 0, 0);
  return b;
}
