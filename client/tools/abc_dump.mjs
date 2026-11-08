// abc_dump.mjs — full ABC parser + minimal AVM2 disassembler (login-chain SWFs)
// usage: node abc_dump.mjs <swf_body.bin> [mode] [arg]
//   mode "m" [substring]  : dump disasm of methods whose class::name matches substring
//   mode "refs" <string>  : dump methods whose bytecode pushes that exact string
//   mode "pool"           : dump constant pool strings
//   mode "classes"        : list methods -> owner traits
//   mode "strscan"        : list every method -> set of strings it pushes
import fs from "node:fs";

const FILE = process.argv[2] || "D:/temp/z/loginmod_body.bin";
const MODE = process.argv[3] || "classes";
const ARG = process.argv[4] || "";
const raw = fs.readFileSync(FILE);

// ---- opcode tables (name + operand encoding) ----
const OPMN = {
  0x01: "bkpt", 0x02: "nop", 0x03: "throw", 0x04: "getsuper", 0x05: "setsuper", 0x06: "dxns", 0x07: "dxnslate",
  0x08: "kill", 0x09: "label", 0x0c: "ifnlt", 0x0d: "ifnle", 0x0e: "ifngt", 0x0f: "ifnge", 0x10: "jump",
  0x11: "iftrue", 0x12: "iffalse", 0x13: "ifeq", 0x14: "ifne", 0x15: "iflt", 0x16: "ifle", 0x17: "ifgt",
  0x18: "ifge", 0x19: "ifstricteq", 0x1a: "ifstrictne", 0x1b: "lookupswitch", 0x1c: "pushwith", 0x1d: "popscope",
  0x1e: "nextname", 0x1f: "hasnext", 0x20: "pushnull", 0x21: "pushundefined", 0x23: "nextvalue", 0x24: "pushbyte",
  0x25: "pushshort", 0x26: "pushtrue", 0x27: "pushfalse", 0x28: "pushnan", 0x29: "pop", 0x2a: "dup", 0x2b: "swap",
  0x2c: "pushstring", 0x2d: "pushint", 0x2e: "pushuint", 0x2f: "pushdouble", 0x30: "pushscope", 0x31: "pushnamespace",
  0x32: "hasnext2", 0x40: "newfunction", 0x41: "call", 0x42: "construct", 0x43: "callmethod", 0x44: "callstatic",
  0x45: "callsuper", 0x46: "callproperty", 0x47: "returnvoid", 0x48: "returnvalue", 0x49: "constructsuper",
  0x4a: "constructprop", 0x4b: "callsuperid", 0x4c: "callproplex", 0x4e: "callsupervoid", 0x4f: "callpropvoid",
  0x53: "applytype", 0x55: "newobject", 0x56: "newarray", 0x57: "newactivation", 0x58: "newclass",
  0x59: "getdescendants", 0x5a: "newcatch", 0x5d: "findpropstrict", 0x5e: "findproperty", 0x5f: "finddef",
  0x60: "getlex", 0x61: "setproperty", 0x62: "getlocal", 0x63: "setlocal", 0x64: "getglobalscope", 0x65: "getscopeobject",
  0x66: "getproperty", 0x68: "initproperty", 0x6a: "deleteproperty", 0x6b: "deletepropertylate", 0x6c: "getslot",
  0x6d: "setslot", 0x6e: "getglobalslot", 0x6f: "setglobalslot", 0x70: "convert_s", 0x71: "esc_xelem", 0x72: "esc_xattr",
  0x73: "convert_i", 0x74: "convert_u", 0x75: "convert_d", 0x76: "convert_b", 0x77: "convert_o", 0x78: "checkfilter",
  0x80: "coerce", 0x82: "coerce_a", 0x85: "coerce_s", 0x86: "astype", 0x87: "astypelate",
  0x90: "negate", 0x91: "increment", 0x92: "inclocal", 0x93: "decrement", 0x94: "declocal", 0x95: "typeof",
  0x96: "not", 0x97: "bitnot",
  0xa0: "add", 0xa1: "subtract", 0xa2: "multiply", 0xa3: "divide", 0xa4: "modulo", 0xa5: "lshift", 0xa6: "rshift",
  0xa7: "urshift", 0xa8: "bitand", 0xa9: "bitor", 0xaa: "bitxor", 0xab: "equals", 0xac: "strictequals",
  0xad: "lessthan", 0xae: "lessequals", 0xaf: "greaterthan", 0xb0: "greaterequals", 0xb1: "instanceof",
  0xb2: "istype", 0xb3: "istypelate", 0xb4: "in",
  0xc0: "increment_i", 0xc1: "inclocal_i", 0xc2: "decrement_i", 0xc3: "declocal_i", 0xc4: "negate_i", 0xc5: "add_i",
  0xc6: "subtract_i", 0xc7: "multiply_i",
  0xd0: "getlocal0", 0xd1: "getlocal1", 0xd2: "getlocal2", 0xd3: "getlocal3",
  0xd4: "setlocal0", 0xd5: "setlocal1", 0xd6: "setlocal2", 0xd7: "setlocal3",
  0xef: "debug", 0xf0: "debugline", 0xf1: "debugfile", 0xf2: "bkptline",
};
const OPEN = {
  0x01: "u8", 0x04: "u30", 0x05: "u30", 0x06: "u30", 0x08: "u30",
  0x0c: "s24", 0x0d: "s24", 0x0e: "s24", 0x0f: "s24", 0x10: "s24", 0x11: "s24", 0x12: "s24",
  0x13: "s24", 0x14: "s24", 0x15: "s24", 0x16: "s24", 0x17: "s24", 0x18: "s24", 0x19: "s24",
  0x1a: "s24", 0x1b: "sw", 0x1c: "u30", 0x1e: "u30", 0x1f: "u30",
  0x24: "u8", 0x25: "u30", 0x2c: "u30", 0x2d: "u30", 0x2e: "u30", 0x2f: "u30",
  0x31: "u30", 0x32: "u30u30",
  0x40: "u30", 0x41: "u30", 0x42: "u30", 0x43: "u30u30", 0x44: "u30u30", 0x45: "u30u30",
  0x46: "u30u30", 0x49: "u30", 0x4a: "u30u30", 0x4b: "u30u30", 0x4c: "u30u30",
  0x4e: "u30u30", 0x4f: "u30u30",
  0x53: "u30", 0x55: "u30", 0x56: "u30", 0x58: "u30", 0x59: "u30", 0x5a: "u30",
  0x5d: "u30", 0x5e: "u30", 0x5f: "u30",
  0x60: "u30", 0x61: "u30", 0x62: "u30", 0x63: "u30", 0x65: "u8",
  0x66: "u30", 0x68: "u30", 0x6a: "u30", 0x6b: "u30", 0x6c: "u30", 0x6d: "u30",
  0x6e: "u30", 0x6f: "u30",
  0x80: "u30", 0x86: "u30",
  0x92: "u30", 0x94: "u30",
  0xb2: "u30",
  0xc1: "u30", 0xc3: "u30",
  0xef: "dbg", 0xf0: "u30", 0xf1: "u30", 0xf2: "u30",
};

// ---------- SWF container walk ----------
let bit = 0, byte = 8;
function ub(n) { let v = 0; while (n > 0) { v = (v << 1) | ((raw[byte] >> (7 - (bit % 8))) & 1); bit++; if (bit % 8 === 0) byte++; n--; } return v; }
const nb = ub(5); ub(nb); ub(nb); ub(nb); ub(nb);
if (bit % 8 !== 0) byte++;
byte += 4;
let off = byte;
const doabc = [];
while (off < raw.length - 1) {
  const c16 = raw[off] | (raw[off + 1] << 8); off += 2;
  let len = c16 & 0x3f;
  if (len === 0x3f) { len = raw.readUInt32LE(off); off += 4; }
  const tag = c16 >> 6;
  if (tag === 82) doabc.push(raw.subarray(off, off + len));
  if (tag === 0) break;
  off += len;
}
console.log("[" + FILE + "] DoABC tags:", doabc.length, doabc.map(b => b.length));

for (const [ti, d] of doabc.entries()) dumpABC(d, ti);

function dumpABC(d, ti) {
  let p = 0;
  const u8 = () => d[p++];
  const u30 = () => { let v = 0, s = 0; for (;;) { const b = d[p++]; v |= (b & 0x7f) << s; if (!(b & 0x80)) break; s += 7; } return v >>> 0; };
  p += 4; while (d[p] !== 0) p++; p++;   // flags + abc name
  p += 4;                                // minor/major

  // ---------- cpool ----------
  const ints = [0], uints = [0], doubles = [0], strings = [""];
  let c = u30(); for (let i = 1; i < c; i++) { const v = u30(); ints.push(v & 0x80000000 ? v - 0x100000000 : v); }
  c = u30(); for (let i = 1; i < c; i++) uints.push(u30());
  c = u30(); for (let i = 1; i < c; i++) { doubles.push(d.readDoubleLE(p)); p += 8; }
  c = u30(); for (let i = 1; i < c; i++) { const l = u30(); strings.push(d.toString("utf8", p, p + l)); p += l; }
  const nss = [""];
  c = u30(); for (let i = 1; i < c; i++) { u8(); nss.push(strings[u30()] || "?"); }
  c = u30(); for (let i = 1; i < c; i++) { const n = u30(); for (let k = 0; k < n; k++) u30(); }
  const mnames = [""];
  c = u30();
  for (let i = 1; i < c; i++) {
    const kind = u8();
    let label = "?";
    if (kind === 0x07 || kind === 0x0D) { const ns = u30(); const n = u30(); label = (nss[ns] || "") + "::" + (strings[n] || "?"); }
    else if (kind === 0x0F || kind === 0x10) { const n = u30(); label = strings[n] || "?"; }
    else if (kind === 0x11 || kind === 0x12) { label = "<rtq>"; }
    else if (kind === 0x09 || kind === 0x0E) { const ns = u30(); const n = u30(); label = (nss[ns] || "") + "::" + (strings[n] || "?"); }
    else if (kind === 0x1B || kind === 0x1C) { u30(); label = "<late>"; }
    else if (kind === 0x1D) { const n = u30(); const pc2 = u30(); label = "TN{" + (strings[n] || "?") + "}"; for (let k = 0; k < pc2; k++) u30(); }
    mnames.push(label);
  }
  const mnName = (i) => mnames[i] || "?";

  // ---------- method_info ----------
  const methods = [];
  c = u30();
  for (let i = 0; i < c; i++) {
    const pc = u30(); u30();
    for (let k = 0; k < pc; k++) u30();
    const name = u30();
    const flags = u8();
    if (flags & 0x08) { const oc = u30(); for (let k = 0; k < oc; k++) { u30(); u8(); } }
    if (flags & 0x40) { for (let k = 0; k < pc; k++) u30(); }
    methods.push({ idx: i, name: strings[name] || "" });
  }

  // ---------- metadata ----------
  c = u30();
  for (let i = 0; i < c; i++) { u30(); const n = u30(); for (let k = 0; k < n; k++) { u30(); u30(); } }

  // ---------- traits ----------
  const methodOwners = methods.map(() => []);   // method idx -> ["Cls::name"]
  const constList = []; const varList = [];                          // {owner, label}
  function readTraits(owner) {
    const tc = u30();
    for (let t = 0; t < tc; t++) {
      const nm = u30();
      const kb = u8(); const kind = kb & 0x0f;
      let method = -1;
      let label = mnName(nm);
      if (kind === 0x00 || kind === 0x06) {          // slot / const
        u30(); const tn = u30(); const vi = u30();
        let cv = "";
        if (vi !== 0) {
          const vk = u8();
          // vkind: 1=utf8 3=int 4=uint 5=double 0x0a=false 0x0b=true 0x0c=null
          cv = " = " + (vk === 0x01 ? JSON.stringify(strings[vi] || "?").slice(0, 60)
            : vk === 0x03 ? "int:" + ints[vi] : vk === 0x04 ? "uint:" + uints[vi]
            : vk === 0x05 ? "dbl:" + doubles[vi] : vk === 0x0a ? "false" : vk === 0x0b ? "true"
            : vk === 0x0c ? "null" : "k" + vk.toString(16) + ":" + vi);
        }
        label = (kind === 6 ? "const " : "var ") + label + cv;
        if (kind === 0x06 || cv) constList.push({ owner, label });
        if (kind === 0x00) varList.push({ owner, label: label + cv, tn: mnName(tn) });
      } else if (kind === 0x04) {                    // class
        u30(); u30();
        label = "class " + label;
      } else if (kind === 0x05) {                    // function
        u30(); method = u30();
      } else if (kind === 0x01 || kind === 0x02 || kind === 0x03) { // method/getter/setter
        u30(); method = u30();
      }
      if (kb & 0x40) { const mc = u30(); for (let m = 0; m < mc; m++) u30(); }
      if (method >= 0 && methodOwners[method]) {
        methodOwners[method].push(owner + "::" + label + (kind === 2 ? " [get]" : kind === 3 ? " [set]" : ""));
      }
    }
  }

  // ---------- instances ----------
  const classes = [];
  const iinits = [];
  c = u30();
  const classCount = c;
  for (let i = 0; i < classCount; i++) {
    const name = mnName(u30());
    const sup = mnName(u30());
    const flags = u8();
    if (flags & 0x08) u30();               // protectedNs
    const ic = u30(); for (let k = 0; k < ic; k++) u30();
    const iinit = u30();
    readTraits(name);
    iinits.push({ name, iinit });
    classes.push({ name });
  }
  // ---------- class_info (static) ----------
  for (let i = 0; i < classCount; i++) {
    u30();                                  // cinit
    readTraits((classes[i] ? classes[i].name : "?" + i) + "$");
  }
  // ---------- scripts ----------
  c = u30();
  for (let i = 0; i < c; i++) {
    u30();                                  // init
    readTraits("script#" + i);
  }

  // ---------- bodies ----------
  const bodies = new Map();
  c = u30();
  for (let i = 0; i < c; i++) {
    const m = u30();
    const maxStack = u30(), locals = u30(), isd = u30(), msd = u30();
    const cl = u30();
    const code = d.subarray(p, p + cl); p += cl;
    const ec = u30();
    for (let k = 0; k < ec; k++) { u30(); u30(); u30(); mnName(u30()); mnName(u30()); }
    readTraits("body#" + m);
    // collect pushstring refs (linear scan)
    const strRefs = [];
    { let qq = 0;
      const g30 = () => { let v = 0, s = 0; for (;;) { const bb = code[qq++]; v |= (bb & 0x7f) << s; if (!(bb & 0x80)) break; s += 7; } return v >>> 0; };
      while (qq < code.length) {
        const op = code[qq++];
        const enc = OPEN[op];
        if (op === 0x2c) { strRefs.push(strings[g30()] || "?"); }
        else if (enc === "u8") qq += 1;
        else if (enc === "u30") g30();
        else if (enc === "u30u30") { g30(); g30(); }
        else if (enc === "s24") qq += 3;
        else if (enc === "sw") { qq += 3; const n = g30(); qq += 3 * (n + 1); }
        else if (enc === "dbg") { qq += 2; g30(); qq += 1; g30(); }
      }
    }
    bodies.set(m, { maxStack, locals, code, strRefs });
  }

  console.log(`\n[abc#${ti}] bodies=${bodies.size} strings=${strings.length}`);

  // ================= modes =================
  if (MODE === "classes") {
    for (const [mi, arr] of methodOwners.entries()) {
      if (arr.length) console.log("m" + mi + " " + arr.join(" | "));
    }
  } else if (MODE === "pool") {
    strings.forEach((s, i) => console.log(i + ": " + s.slice(0, 120)));
  } else if (MODE === "m") {
    for (const [mi, arr] of methodOwners.entries()) {
      if (!arr.some(a => a.includes(ARG))) continue;
      const b = bodies.get(mi);
      console.log("\n===== m" + mi + " " + arr.join(" | ") + (b ? "  (locals " + b.locals + ")" : "  (NO BODY)") + " =====");
      // round47：给出 code 的十六进制前缀与总长，便于在 ABC 里定位并原地打补丁
      if (b) console.log("  codeLen=" + b.code.length + " hex=" + b.code.subarray(0, 32).toString("hex"));
      if (b) disasm(b);
    }
  } else if (MODE === "hex") {
    // round47：给字节补丁工具用 —— 输出 "HEX <methodIdx> <codeLen> <前32字节hex>"
    for (const [mi, arr] of methodOwners.entries()) {
      if (!arr.some(a => a.includes(ARG))) continue;
      const b = bodies.get(mi);
      if (!b) continue;
      console.log("HEX " + mi + " " + b.code.length + " " + b.code.subarray(0, 32).toString("hex") + "  " + arr[0]);
    }
  } else if (MODE === "refs") {
    for (const [mi, arr] of methodOwners.entries()) {
      const b = bodies.get(mi);
      if (!b || !b.strRefs.includes(ARG)) continue;
      console.log("\n===== m" + mi + " " + arr.join(" | ") + " =====");
      console.log("  strings: " + JSON.stringify(b.strRefs));
      disasm(b);
    }
  } else if (MODE === "iinit") {
    iinits.filter(x => !ARG || x.name.includes(ARG)).forEach(x => console.log(x.name + " iinit=m" + x.iinit));
  } else if (MODE === "ctor") {
    for (const [mi2, arr] of methodOwners.entries()) {
      const b = bodies.get(mi2);
      if (!b) continue;
      const code = b.code; let qq = 0;
      const g30 = () => { let v = 0, ss = 0; for (;;) { const bb = code[qq++]; v |= (bb & 0x7f) << ss; if (!(bb & 0x80)) break; ss += 7; } return v >>> 0; };
      while (qq < code.length) {
        const op = code[qq++]; const enc = OPEN[op];
        let hit = false;
        if (op === 0x42) { const mni = g30(); const ac = g30(); if (mnName(mni).includes(ARG)) { console.log("m" + mi2 + " " + arr.join(" | ") + "   ctor: " + mnName(mni)); } }
        else if (op === 0x42) { g30(); hit = false; }
        else if (enc === "u8") qq += 1;
        else if (enc === "u30") g30();
        else if (enc === "u30u30") { g30(); g30(); }
        else if (enc === "s24") qq += 3;
        else if (enc === "sw") { qq += 3; const n = g30(); qq += 3 * (n + 1); }
        else if (enc === "dbg") { qq += 2; g30(); qq += 1; g30(); }
        if (hit) { console.log("m" + mi2 + " " + arr.join(" | ")); break; }
      }
    }
  } else if (MODE === "set") {
    for (const [mi2, arr] of methodOwners.entries()) {
      const b = bodies.get(mi2);
      if (!b) continue;
      // scan for setproperty/initproperty with matching multiname
      const code = b.code; let qq = 0;
      const g30 = () => { let v = 0, ss = 0; for (;;) { const bb = code[qq++]; v |= (bb & 0x7f) << ss; if (!(bb & 0x80)) break; ss += 7; } return v >>> 0; };
      while (qq < code.length) {
        const op = code[qq++]; const enc = OPEN[op];
        let hit = false;
        if ((op === 0x61 || op === 0x68)) { const idx = g30(); if (mnName(idx).includes(ARG)) hit = true; }
        else if (enc === "u8") qq += 1;
        else if (enc === "u30") g30();
        else if (enc === "u30u30") { g30(); g30(); }
        else if (enc === "s24") qq += 3;
        else if (enc === "sw") { qq += 3; const n = g30(); qq += 3 * (n + 1); }
        else if (enc === "dbg") { qq += 2; g30(); qq += 1; g30(); }
        if (hit) { console.log("m" + mi2 + " " + arr.join(" | ")); break; }
      }
    }
  } else if (MODE === "mi") {
    const b = bodies.get(Number(ARG));
    console.log("method#" + ARG + " owners: " + (methodOwners[Number(ARG)]||[]).join(" | "));
    if (b) disasm(b); else console.log("NO BODY");
  } else if (MODE === "slots") {
    varList.filter(x => !ARG || x.owner.includes(ARG)).forEach(x => console.log(x.owner + " :: " + x.label + "  :" + x.tn));
  } else if (MODE === "consts") {
    constList.forEach(x => console.log(x.owner + " :: " + x.label));
  } else if (MODE === "strscan") {
    const rows = [];
    for (const [mi, arr] of methodOwners.entries()) {
      const b = bodies.get(mi);
      if (!b) continue;
      rows.push({ m: arr.join(" | ") || ("m" + mi), s: b.strRefs });
    }
    rows.sort((a, b2) => b2.s.length - a.s.length);
    rows.forEach(r => console.log(r.m + "  → " + JSON.stringify(r.s.slice(0, 14))));
  }

  // ================= disassembler =================
  function disasm(b) {
    const code = b.code;
    let q = 0;
    const gu30 = () => { let v = 0, s = 0; for (;;) { const bb = code[q++]; v |= (bb & 0x7f) << s; if (!(bb & 0x80)) break; s += 7; } return v >>> 0; };
    const gs24 = () => { const a = code[q], b2 = code[q + 1], c2 = code[q + 2]; q += 3; const v = a | (b2 << 8) | (c2 << 16); return (v & 0x800000) ? v - 0x1000000 : v; };
    while (q < code.length) {
      const pc = q;
      const op = code[q++];
      const mn = OPMN[op];
      if (mn === undefined) { console.log("  ??op 0x" + op.toString(16) + " @" + pc + " — stop"); return; }
      let operand = "";
      switch (OPEN[op]) {
        case "u8": operand = String(code[q++]); break;
        case "u30": operand = String(gu30()); break;
        case "u30u30": operand = gu30() + " " + gu30(); break;
        case "s24": operand = "→" + (pc + 3 + gs24()); break;
        case "sw": { const def = gs24(); const n = gu30(); let s = "→def" + def; for (let k = 0; k <= n; k++) s += "," + gs24(); operand = s; break; }
        case "dbg": operand = [code[q++], gu30(), code[q++], gu30()].join(" "); break;
        default: operand = "";
      }
      let extra = "";
      switch (op) {
        case 0x2c: extra = JSON.stringify(strings[Number(operand)] || "?").slice(0, 110); break;
        case 0x2d: extra = String(ints[Number(operand)]); break;
        case 0x2e: extra = String(uints[Number(operand)]); break;
        case 0x2f: extra = String(doubles[Number(operand)]); break;
        case 0x60: case 0x61: case 0x66: case 0x68: case 0x6a: case 0x80: case 0x86:
        case 0xb2: case 0x5d: case 0x5e: case 0x5f: case 0x59: case 0x04: case 0x05:
          extra = mnName(Number(operand)); break;
        case 0x46: case 0x4f: case 0x4a: case 0x4c: case 0x45: case 0x4e:
          { const arr = operand.split(" "); extra = mnName(Number(arr[0])) + " argc=" + arr[1]; break; }
        case 0x40: { const ow = methodOwners[Number(operand)]; extra = (ow && ow[0]) || "method#" + operand; break; }
      }
      console.log("  " + String(pc).padStart(4) + " " + mn + (operand ? " " + operand : "") + (extra ? "   ; " + extra : ""));
    }
  }
}

