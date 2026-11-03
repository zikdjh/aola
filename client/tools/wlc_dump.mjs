// wlc_dump.mjs — WebLoginChecker ABC 方法定位/反汇编工具
// 用法: node wlc_dump.mjs <mode> [arg]
//   owners          : 列出所有 body 的归属 trait
//   dis <name>      : 反汇编指定 trait 方法
import fs from "node:fs";

const abc = fs.readFileSync("wlc_abc.bin");
let p = 0;
const u30 = () => { let v = 0, s = 0; for (;;) { const x = abc[p++]; v |= (x & 0x7f) << s; if (!(x & 0x80)) break; s += 7; } return v >>> 0; };
const u8 = () => abc[p++];
p += 4; while (abc[p] !== 0) p++; p++; p += 4;
let ic = u30(); for (let i = 1; i < ic; i++) u30();
let uc = u30(); for (let i = 1; i < uc; i++) u30();
let dc = u30(); p += Math.max(0, dc - 1) * 8;
let sc = u30(); const strs = [''];
for (let i = 1; i < sc; i++) { const l = u30(); strs.push(abc.toString('utf8', p, p + l)); p += l; }
let nsc = u30(); for (let i = 1; i < nsc; i++) { u8(); u30(); }
let nssc = u30(); for (let i = 1; i < nssc; i++) { const n = u30(); for (let k = 0; k < n; k++) u30(); }
const mnames = [''];
let mc = u30();
for (let i = 1; i < mc; i++) {
  const kind = u8();
  if (kind === 0x07 || kind === 0x0D) { u30(); mnames.push(strs[u30()] || '?'); }
  else if (kind === 0x0F || kind === 0x10) { mnames.push(strs[u30()] || '?'); }
  else if (kind === 0x09 || kind === 0x0E) { u30(); mnames.push(strs[u30()] || '?'); }
  else if (kind === 0x1B || kind === 0x1C) { u30(); mnames.push('<late>'); }
  else if (kind === 0x1D) { u30(); const pc = u30(); for (let k = 0; k < pc; k++) u30(); mnames.push('TN{}'); }
  else mnames.push('?');
}
let mcount = u30(); for (let i = 0; i < mcount; i++) { const pc = u30(); u30(); for (let k = 0; k < pc; k++) u30(); u30(); const fl = u8(); if (fl & 0x08) { const oc = u30(); for (let k = 0; k < oc; k++) { u30(); u8(); } } if (fl & 0x40) { for (let k = 0; k < pc; k++) u30(); } }
let mdc = u30(); for (let i = 0; i < mdc; i++) { u30(); const n = u30(); for (let k = 0; k < n; k++) { u30(); u30(); } }
function readTraits() { const tc = u30(); const out = []; for (let t = 0; t < tc; t++) { const nm = mnames[u30()] || '?'; const kb = u8(); const kind = kb & 0x0f; let mid = -1;
  if (kind === 0x00 || kind === 0x06) { u30(); u30(); const vi = u30(); if (vi !== 0) u8(); }
  else if (kind === 0x04) { u30(); u30(); }
  else { u30(); mid = u30(); }
  if (kb & 0x40) { const mc2 = u30(); for (let m = 0; m < mc2; m++) u30(); }
  out.push({ nm, mid }); } return out; }
const cc = u30(); const cls = [];
for (let i = 0; i < cc; i++) { const nm = mnames[u30()] || '?'; u30(); const fl = u8(); if (fl & 0x08) u30(); const ic2 = u30(); for (let k = 0; k < ic2; k++) u30(); const iinit = u30(); const tr = readTraits(); cls.push({ nm, iinit, tr }); }
for (let i = 0; i < cc; i++) { u30(); readTraits(); }
let scc = u30(); for (let i = 0; i < scc; i++) { u30(); readTraits(); }
const bc = u30(); const bodies = {};
for (let i = 0; i < bc; i++) {
  const m = u30(); u30(); u30(); u30(); u30(); const cl = u30(); const codeOff = p; p += cl;
  const ec = u30(); for (let k = 0; k < ec; k++) { u30(); u30(); u30(); u30(); u30(); }
  const tr = readTraits();
  bodies[m] = { codeOff, cl, tr };
}
const wlc = cls.find(c => c.nm.includes('WebLoginChecker'));
const ownerOf = m => (wlc.tr.filter(t => t.mid === m).map(t => t.nm).join(',') || 'static/' + m);

const MODE = process.argv[2] || 'owners';
if (MODE === 'owners') {
  for (const [m, b] of Object.entries(bodies)) {
    console.log('m' + m + ' @' + b.codeOff + ' len=' + b.cl + '  ' + ownerOf(Number(m)));
  }
} else if (MODE === 'dis') {
  const name = process.argv[3];
  const tr = wlc.tr.find(t => t.nm === name);
  const body = bodies[tr.mid];
  const code = abc.subarray(body.codeOff, body.codeOff + body.cl);
  const OPMN = { 0x60: 'getlex', 0x61: 'setproperty', 0x66: 'getproperty', 0x68: 'initproperty', 0x46: 'callproperty', 0x4f: 'callproplex', 0x80: 'coerce', 0x5d: 'findpropstrict', 0x2c: 'pushstring', 0x24: 'pushbyte', 0x25: 'pushshort', 0x30: 'pushscope', 0x47: 'returnvoid', 0x48: 'returnvalue', 0xa0: 'add', 0xab: 'equals', 0x96: 'not', 0x11: 'iffalse', 0x12: 'ifne', 0x13: 'iflt', 0x10: 'jump', 0x09: 'label', 0x29: 'pop', 0x2a: 'dup', 0x73: 'convert_i', 0x75: 'convert_d', 0x76: 'convert_b', 0x1c: 'pushtrue', 0x1b: 'pushfalse', 0x20: 'pushnull', 0x08: 'kill', 0x03: 'throw', 0xd0: 'getlocal0', 0xd1: 'getlocal1', 0xd2: 'getlocal2', 0xd3: 'getlocal3', 0xd4: 'setlocal0', 0xd5: 'setlocal1', 0xd6: 'setlocal2', 0xd7: 'setlocal3', 0x85: 'coerce_a', 0xef: 'debugline', 0xf1: 'getscopeobject', 0xc0: 'convert_s', 0xc2: 'astype' };
  const OP1 = { 0x60: 1, 0x61: 1, 0x66: 1, 0x68: 1, 0x80: 1, 0x5d: 1, 0x2c: 1, 0x24: 1, 0x25: 1, 0x46: 2, 0x4f: 2, 0x11: 3, 0x12: 3, 0x13: 3, 0x10: 3, 0xef: 1, 0xf1: 1, 0x08: 1 };
  console.log('m' + tr.mid + ' len=' + body.cl);
  let q = 0;
  while (q < code.length) {
    const pc = q; const op = code[q++];
    const name = OPMN[op] || ('op' + op.toString(16));
    let operand = '';
    if (OP1[op] === 1) { let v = 0, s = 0; for (;;) { const x = code[q++]; v |= (x & 0x7f) << s; if (!(x & 0x80)) break; s += 7; } operand = String(v >>> 0); if (op === 0x2c || op === 0x60) operand += ' "' + (strs[v >>> 0] || '').slice(0, 30) + '"'; }
    else if (OP1[op] === 2) { let v = 0, s = 0; for (;;) { const x = code[q++]; v |= (x & 0x7f) << s; if (!(x & 0x80)) break; s += 7; } const v2 = v >>> 0; let w = 0, ss = 0; for (;;) { const x = code[q++]; w |= (x & 0x7f) << ss; if (!(x & 0x80)) break; ss += 7; } operand = v2 + ' argc=' + w; }
    else if (OP1[op] === 3) { const a = code[q] | (code[q + 1] << 8) | (code[q + 2] << 16); q += 3; operand = '→' + (pc + 3 + ((a & 0x800000) ? a - 0x1000000 : a)); }
    else if (op >= 0xd0 && op <= 0xd7) { operand = String(op - 0xd0); }
    console.log(String(pc).padStart(5) + ' ' + name + (operand ? ' ' + operand : ''));
  }
}
