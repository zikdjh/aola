// pbj_decode.mjs — 按 ruffle pixel_bender 语法解码 PBJ 内核
import fs from "node:fs";

const buf = fs.readFileSync(process.argv[2] || "D:/temp/z/ss1/kernel_0.bin");
let p = Number(process.argv[3] || 6);   // 跳过 6 字节前缀（01 00 00 00 00 00）

const TYPES = { 1: "float", 2: "float2", 3: "float3", 4: "float4", 5: "m2x2", 6: "m3x3", 7: "m4x4", 8: "int", 9: "int2", 0xa: "int3", 0xb: "int4", 0xc: "string", 0xd: "bool", 0xe: "bool2", 0xf: "bool3", 0x10: "bool4" };
const OPS = { 0x0: "Nop", 0x1: "Add", 0x2: "Sub", 0x3: "Mul", 0x4: "Rcp", 0x5: "Div", 0x6: "Atan2", 0x7: "Pow", 0x8: "Mod", 0x9: "Min", 0xa: "Max", 0xb: "Step", 0xc: "Sin", 0xd: "Cos", 0xe: "Tan", 0xf: "Asin", 0x10: "Acos", 0x11: "Atan", 0x12: "Exp", 0x13: "Exp2", 0x14: "Log", 0x15: "Log2", 0x16: "Sqrt", 0x17: "RSqrt", 0x18: "Abs", 0x19: "Sign", 0x1a: "Floor", 0x1b: "Ceil", 0x1c: "Fract", 0x1d: "Mov", 0x1e: "FloatToInt", 0x1f: "IntToFloat", 0x20: "MatMatMul", 0x21: "VecMatMul", 0x22: "MatVecMul", 0x23: "Normalize", 0x24: "Length", 0x25: "Distance", 0x26: "DotProduct", 0x27: "CrossProduct", 0x28: "Equal", 0x29: "NotEqual", 0x2a: "LessThan", 0x2b: "LessThanEqual", 0x2c: "LogicalNot", 0x2d: "LogicalAnd", 0x2e: "LogicalOr", 0x2f: "LogicalXor", 0x30: "SampleNearest", 0x31: "SampleLinear", 0x32: "LoadIntOrFloat", 0x33: "Select", 0x34: "If", 0x35: "Else", 0x36: "EndIf", 0x37: "FloatToBool", 0x38: "BoolToFloat", 0x39: "IntToBool", 0x3a: "BoolToInt", 0x3b: "VectorEqual", 0x3c: "VectorNotEqual", 0x3d: "BoolAny", 0x3e: "BoolAll", 0xa0: "Meta1", 0xa1: "Param", 0xa2: "Meta2", 0xa3: "ParamTexture", 0xa4: "Name", 0xa5: "Version" };
const CH = ["r", "g", "b", "a", "m2x2", "m3x3", "m4x4"];

const u8 = () => buf[p++];
const u16 = () => { const v = buf.readUInt16LE(p); p += 2; return v; };
const i32 = () => { const v = buf.readInt32LE(p); p += 4; return v; };
const f32be = () => { const v = buf.readFloatBE(p); p += 4; return v; };
const u24 = () => { const v = buf[p] | (buf[p + 1] << 8) | (buf[p + 2] << 16); p += 3; return v; };
const readString = () => { let s = ""; let b = u8(); while (b !== 0) { s += String.fromCharCode(b); b = u8(); } return s; };
const skip = (n) => { p += n; };

function dstReg(val, mask) {
  const kind = (val & 0x8000) ? "int" : "float";
  const idx = val & 0x7fff;
  // mask>>4 = channel selector (r,g,b,a → 0..3) — ruffle: read_dst_reg(val, mask)
  const chs = [];
  for (let i = 0; i < (mask & 3) + 1; i++) chs.push(CH[(mask >> (6 - i * 2)) & 3]);
  return `${kind}_r${idx}${chs.length ? "." + chs.join("") : ""}`;
}
function srcReg(val, size) {
  const swizzle = val >> 16;
  const chs = [];
  for (let i = 0; i < size; i++) chs.push(CH[(swizzle >> (6 - i * 2)) & 3]);
  const kind = (val & 0x8000) ? "int" : "float";
  const idx = val & 0x7fff;
  return `${kind}_r${idx}${chs.length ? "." + chs.join("") : ""}`;
}
function readValue(t) {
  if (t === 1) return f32be();
  if (t >= 2 && t <= 4) { const a = []; for (let i = 0; i < t; i++) a.push(f32be()); return a; }
  if (t === 8) return buf.readInt16LE(p), p += 2, undefined || buf.readInt16LE(p - 2);
  if (t >= 9 && t <= 0xb) { const n = t - 7; const a = []; for (let i = 0; i < n; i++) { a.push(buf.readInt16LE(p)); p += 2; } return a; }
  if (t === 0xc) return readString();
  if (t >= 0xd && t <= 0x10) { const n = t - 0xc; const a = []; for (let i = 0; i < n; i++) { a.push(buf.readInt16LE(p)); p += 2; } return a; }
  return "?" + t;
}

while (p < buf.length) {
  const op = u8();
  const name = OPS[op];
  if (name === undefined) { console.log("?? opcode 0x" + op.toString(16) + " @" + (p - 1) + " — stop"); break; }
  switch (op) {
    case 0x0: skip(6); console.log("Nop"); break;
    case 0xa0: case 0xa2: { const t = u8(); const k = readString(); const v = readValue(t); console.log(`Meta(${TYPES[t] || t}) ${k} = ${JSON.stringify(v)}`); break; }
    case 0xa1: { const q = u8(); const t = u8(); const reg = u16(); const mask = u8(); const nm = readString(); console.log(`Param q=${q === 2 ? "OUT" : "IN"} type=${TYPES[t] || t} ${dstReg(reg, mask)} "${nm}"`); break; }
    case 0xa3: { const idx = u8(); const ch = u8(); const nm = readString(); console.log(`ParamTexture idx=${idx} ch=${ch} "${nm}"`); break; }
    case 0xa4: { const len = u16(); const s = buf.toString("utf8", p, p + len); p += len; console.log("Name:", s); break; }
    case 0xa5: console.log("Version:", i32()); break;
    case 0x34: skip(3); const srci = u24(); skip(1); console.log(`If ${srcReg(srci, 1)}`); break;
    case 0x35: skip(7); console.log("Else"); break;
    case 0x36: skip(7); console.log("EndIf"); break;
    case 0x32: { const dst = u16(); const mask = u8(); const isInt = (dst & 0x8000) !== 0; if (isInt) { const v = i32(); console.log(`LoadInt ${dstReg(dst, mask >> 4)} = ${v}`); } else { const v = f32be(); console.log(`LoadFloat ${dstReg(dst, mask >> 4)} = ${v}`); } break; }
    case 0x30: case 0x31: { const dst = u16(); const mask = u8(); const src = u24(); const tf = u8(); console.log(`${name} ${dstReg(dst, mask >> 4)} <= ${srcReg(src, 2)} (tf=${tf})`); break; }
    case 0x33: { const dst = u16(); const mask = u8(); const c = u24(); skip(1); const s1 = u24(); skip(1); const s2 = u24(); skip(1); console.log(`Select ${dstReg(dst, mask >> 4)} <= ${srcReg(c, 1)} ? ${srcReg(s1, 1)} : ${srcReg(s2, 1)}`); break; }
    default: { const dst = u16(); const mask = u8(); const size = (mask & 0x3) + 1; const src = u24(); skip(1); console.log(`${name} ${dstReg(dst, mask >> 4)} <= ${srcReg(src, size)}`); }
  }
}
console.log("// consumed", p, "of", buf.length);
