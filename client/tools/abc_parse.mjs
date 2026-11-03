// abc_parse.mjs - minimal ABC constant-pool parser for user/login.swf
// dumps strings with indices, finds target symbols and their pool neighbors.
import fs from "node:fs";

const raw = fs.readFileSync("D:/temp/z/loginmod_body.bin");
// ---- SWF tag walk ----
let bit = 0, byte = 8;
function ub(n) { let v = 0; while (n > 0) { v = (v << 1) | ((raw[byte] >> (7 - (bit % 8))) & 1); bit++; if (bit % 8 === 0) byte++; n--; } return v; }
const nb = ub(5); ub(nb); ub(nb); ub(nb); ub(nb);
if (bit % 8 !== 0) byte++;
byte += 4; // frame rate + count
let off = byte;
let doabc = [];
while (off < raw.length - 1) {
  const code = raw[off] | (raw[off + 1] << 8); off += 2;
  let len = code & 0x3f;
  if (len === 0x3f) { len = raw.readUInt32LE(off); off += 4; }
  const tag = code >> 6;
  if (tag === 82) doabc.push(raw.subarray(off, off + len)); // DoABC
  if (tag === 0) break;
  off += len;
}
console.log("DoABC tags:", doabc.length, doabc.map(b => b.length));

// ---- ABC parse (first DoABC) ----
const d = doabc[0];
let p = 0;
function u8() { return d[p++]; }
function u32() { const v = d.readUInt32LE(p); p += 4; return v; }
function s32skip() { p += 4; }
function u30() {
  let v = 0, shift = 0;
  for (;;) { const b = d[p++]; v |= (b & 0x7f) << shift; if (!(b & 0x80)) break; shift += 7; }
  return v;
}
p += 4; // flags + name flag... DoABC2: u32 flags + null-terminated name
while (d[p] !== 0) p++;
p++;
const minor = d.readUInt16LE(p); p += 2;
const major = d.readUInt16LE(p); p += 2;
console.log("abc version", major, minor);

// ints
let c = u30();
p += (c > 1) ? (c - 1) : 0; // u30 each, first implicit — approximate skip (u30 sizes vary!)
// NOTE: u30 variable length makes blind skip wrong; decode properly:
p -= (c > 1) ? (c - 1) : 0;
for (let i = 1; i < c; i++) u30();
// uints
c = u30(); for (let i = 1; i < c; i++) u30();
// doubles
c = u30(); p += Math.max(0, (c - 1)) * 8;
// strings
const strings = [""];
c = u30();
for (let i = 1; i < c; i++) {
  const len = u30();
  strings.push(d.toString("utf8", p, p + len));
  p += len;
}
console.log("strings:", strings.length);

// namespaces
const nss = [0];
c = u30();
for (let i = 1; i < c; i++) { u8(); nss.push(u30()); }
// ns_sets
const nsets = [0];
c = u30();
for (let i = 1; i < c; i++) { const n = u30(); for (let k = 0; k < n; k++) u30(); }
// multinames
const mnames = [0];
const mnNames = [""];
c = u30();
for (let i = 1; i < c; i++) {
  const kind = u8();
  switch (kind) {
    case 0x07: case 0x0D: { u30(); const n = u30(); mnames.push(n); mnNames.push(strings[n] || ""); break; }
    case 0x0F: case 0x10: case 0x11: case 0x1E: case 0x1F: { const n = u30(); mnames.push(n); mnNames.push(strings[n] || ""); break; }
    case 0x09: case 0x0E: { const n = u30(); mnames.push(n); mnNames.push(strings[n] || ""); break; }
    default: mnames.push(0); mnNames.push("?");
  }
}
console.log("multinames:", mnames.length);

// ---- queries ----
const find = (s) => strings.findIndex(x => x === s);
const targets = ["LOGIN_STATE_KEY", "checkHasLoginCookie", "newLogin.jsp", "_autoLoginInfo", "isWebLogin", "gotoWebLogin", "publicizeStr", "_loginXml"];
for (const t of targets) {
  const i = find(t);
  console.log("\n=== " + t + " @ string[" + i + "] ===");
  if (i > 0) {
    for (let k = Math.max(1, i - 8); k < Math.min(strings.length, i + 9); k++) {
      console.log((k === i ? ">>" : "  ") + k + ": " + strings[k].slice(0, 90));
    }
  }
}
// multinames referencing LOGIN_STATE_KEY
const idx = find("LOGIN_STATE_KEY");
if (idx > 0) {
  const rel = mnames.map((n, i) => ({ n, i })).filter(x => x.n === idx);
  console.log("\nmultinames using LOGIN_STATE_KEY:", rel.map(x => "mn" + x.i + "=" + mnNames[x.i]).join(", ") || "none");
}
