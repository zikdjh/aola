// patch_noop_inititemdata.mjs — 把 ItemService.initItemData 置为 no-op
// 原因: 服务器物品列表(14_2)含物品 5609，客户端物品定义表查不到 → throw "没有 5609"
//       → dispatch 链炸断 → 世界装配停摆在 2/61。
//       no-op 后 14_2 处理完成不抛错，装配继续（代价: 背包物品不注册，战斗验证不受影响）。
// 前置: ms_body.bin = materialservice.swf 解压体（LZMA 已解）
// 输出: ms_body_patched.bin（再手动以 CWS 容器回填 cache）
import fs from "node:fs";

const b = fs.readFileSync("ms_body.bin");
let p = 0;
const u30 = () => { let v = 0, s = 0; for (;;) { const x = b[p++]; v |= (x & 0x7f) << s; if (!(x & 0x80)) break; s += 7; } return v >>> 0; };
const u8 = () => b[p++];

// ---- 定位 DoABC payload ----
let off = 11, doOff = -1, doLen = 0;
while (off < b.length - 1) {
  const c16 = b[off] | (b[off + 1] << 8); off += 2;
  let len = c16 & 0x3f;
  if (len === 0x3f) { len = b.readUInt32LE(off); off += 4; }
  const tag = c16 >> 6;
  if (tag === 0) break;
  if (tag === 82 && doOff < 0) { doOff = off; doLen = len; }
  off += len;
}
console.log("DoABC @", doOff, "len", doLen);

// ---- ABC 头 + cpool ----
p = doOff + 4;                       // flags
while (b[p] !== 0) p++; p++;         // name
p += 4;                              // minor/major
let ic = u30(); for (let i = 1; i < ic; i++) u30();
let uc = u30(); for (let i = 1; i < uc; i++) u30();
let dc = u30(); p += Math.max(0, dc - 1) * 8;
let sc = u30(); const strs = [""];
for (let i = 1; i < sc; i++) { const l = u30(); strs.push(b.toString("utf8", p, p + l)); p += l; }
let nsc = u30(); for (let i = 1; i < nsc; i++) { u8(); u30(); }
let nssc = u30(); for (let i = 1; i < nssc; i++) { const n = u30(); for (let k = 0; k < n; k++) u30(); }
const mnames = [""];
let mc = u30();
for (let i = 1; i < mc; i++) {
  const kind = u8();
  if (kind === 0x07 || kind === 0x0D) { u30(); mnames.push(strs[u30()] || "?"); }
  else if (kind === 0x0F || kind === 0x10) { mnames.push(strs[u30()] || "?"); }
  else if (kind === 0x09 || kind === 0x0E) { u30(); mnames.push(strs[u30()] || "?"); }
  else if (kind === 0x1B || kind === 0x1C) { u30(); mnames.push("<late>"); }
  else if (kind === 0x1D) { u30(); const pc = u30(); for (let k = 0; k < pc; k++) u30(); mnames.push("TN{}"); }
  else mnames.push("?");
}
// ---- method_info（记录位置） ----
const mcount = u30();
const miOffsets = [];
for (let i = 0; i < mcount; i++) {
  const start = p;
  const pc = u30(); u30();
  for (let k = 0; k < pc; k++) u30();
  u30(); const fl = u8();
  if (fl & 0x08) { const oc = u30(); for (let k = 0; k < oc; k++) { u30(); u8(); } }
  if (fl & 0x40) { for (let k = 0; k < pc; k++) u30(); }
  miOffsets.push(start);
}
// metadata
let mdc = u30();
for (let i = 0; i < mdc; i++) { u30(); const n = u30(); for (let k = 0; k < n; k++) { u30(); u30(); } }
// traits
function readTraits() {
  const tc = u30();
  let out = [];
  for (let t = 0; t < tc; t++) {
    const nm = mnames[u30()] || "?";
    const kb = u8(); const kind = kb & 0x0f;
    if (kind === 0x00 || kind === 0x06) { u30(); u30(); const vi = u30(); if (vi !== 0) u8(); }
    else if (kind === 0x04) { u30(); u30(); }
    else if (kind === 0x05 || kind === 0x01 || kind === 0x02 || kind === 0x03) { u30(); u30(); }
    if (kb & 0x40) { const mc2 = u30(); for (let m = 0; m < mc2; m++) u30(); }
    out.push(nm);
  }
  return out;
}
// instances → 找 ItemService 的 iinit + traits
const classCount = u30();
let initItemMethod = -1;
for (let i = 0; i < classCount; i++) {
  const nm = mnames[u30()] || "?";
  u30(); // super
  const fl = u8();
  if (fl & 0x08) u30();
  const ic2 = u30(); for (let k = 0; k < ic2; k++) u30();
  const iinit = u30();
  const traits = readTraits();
  if (nm.includes("ItemService") || nm.includes("itemservice")) {
    console.log("class:", nm, "iinit:", iinit, "traits:", traits.join(","));
    const t = traits.find(x => x === "initItemData");
    if (t) {
      // traits 顺序对应 method index 未知——从 method_info 名字反查不行（mi 无名），
      // 改从 class_info 的 cinit/方法表拿不到名字 → 用脚本扫描法：所有 body 反查
    }
  }
}
for (let i = 0; i < classCount; i++) { u30(); readTraits(); }
let scc = u30(); for (let i = 0; i < scc; i++) { u30(); readTraits(); }
// ---- method_bodies ----
const bc = u30();
let target = -1, targetOff = -1, targetCodeLen = 0;
for (let i = 0; i < bc; i++) {
  const entryStart = p;
  const m = u30();
  u30(); u30(); u30(); u30();          // max_stack, local_count, isd, msd
  const cl = u30();
  const codeOff = p;
  p += cl;
  const ec = u30();
  for (let k = 0; k < ec; k++) { u30(); u30(); u30(); u30(); u30(); }
  const t = readTraits();
  // initItemData 的特征: code 里 pushstring "没有 " 且本 body 不长
  if (target < 0 && cl > 20 && cl < 4000) {
    const code = b.subarray(codeOff, codeOff + cl);
    // 查找 pushstring(0x2c) 后跟 u30(2433)
    const needle = Buffer.from([0x2c, 0x81, 0x13]);   // u30(2433) = 81 13
    if (code.indexOf(needle) >= 0) {
      target = m; targetOff = codeOff; targetCodeLen = cl;
      console.log("candidate body m" + m + " code@" + codeOff + " len=" + cl + " traits:" + t.join(","));
    }
  }
}
if (target < 0) { console.error("initItemData body not found"); process.exit(1); }

// ---- 打补丁: 整个 code → getlocal0 pushscope returnvoid + nops（等长）----
const patch = Buffer.alloc(targetCodeLen, 0x02);
patch[0] = 0xd0; patch[1] = 0x30; patch[2] = 0x47;
patch.copy(b, targetOff);
fs.writeFileSync("ms_body_patched.bin", b);
console.log("PATCHED: initItemData (m" + target + ") code @" + targetOff + " len " + targetCodeLen + " → no-op");
