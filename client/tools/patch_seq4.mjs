// patch_seq4.mjs — DefenseMsgSeq 运行时公式补丁（v4：全等长替换，零结构风险）
// next() 真实公式（两天双会话 + 40 溢出点验证）:
//   next = seq*7 + 102 + hash31(sessionId)%569;  ≥2^31-1 → %1047483647 + 911
// 客户端已自算 _hashSessionId（hash 方法原样保留），只换算术段与 num4：
//   ① onLoaderDeq: enqueue 等待头 → nop（Ruffle ShaderJob 空壳，等待永不完成）
//   ② onLoaderDeq: num4 拷贝 → pushshort 911（溢出分支用）
//   ③ next():      算术段 21B → 常量公式 21B（4 nop 补齐）
// 用法: node patch_seq4.mjs <in.swf> <out.swf>
import fs from "node:fs";
import zlib from "node:zlib";

const [, , inFile, outFile] = process.argv;
const raw = fs.readFileSync(inFile);
let prefix, comp0, swfVer;
if (raw.subarray(8, 11).toString("latin1") === "CWS") { prefix = raw.subarray(0, 8); comp0 = raw.subarray(16); swfVer = raw[11]; }
else if (raw.subarray(0, 3).toString("latin1") === "CWS") { prefix = Buffer.alloc(0); comp0 = raw.subarray(8); swfVer = raw[3]; }
else { console.error("unknown container:", inFile); process.exit(1); }
const body = zlib.inflateSync(comp0);

// ---- 等长替换对 ----
const PATCHES = [
  // onLoaderDeq 头: this.seqLoader.removeEventListener(SeqLoader.OnLoadDeq, this.onLoaderDeq) 等 16B
  { label: "deq-head->nop",
    from: Buffer.from([0xd0, 0x66, 0x02, 0x5d, 0x01, 0x66, 0x01, 0x66, 0x03, 0xd0, 0x66, 0x04, 0x46, 0x07, 0x02, 0x29]),
    to: Buffer.alloc(16, 0x02) },
  // num1 拷贝 → num1=2（已无消费者，保形填充）
  { label: "num1->2",
    from: Buffer.from([0xd0, 0xd0, 0x66, 0x02, 0x66, 0x08, 0x68, 0x09]),
    to: Buffer.from([0xd0, 0x24, 0x02, 0x68, 0x09, 0x02, 0x02, 0x02]) },
  // num2 拷贝 → num2=653（无消费者，保形）
  { label: "num2->653",
    from: Buffer.from([0xd0, 0xd0, 0x66, 0x02, 0x66, 0x0a, 0x68, 0x0b]),
    to: Buffer.from([0xd0, 0x25, 0x8d, 0x05, 0x68, 0x0b, 0x02, 0x02]) },
  // num3 拷贝 → num3=471（无消费者，保形）
  { label: "num3->471",
    from: Buffer.from([0xd0, 0xd0, 0x66, 0x02, 0x66, 0x0c, 0x68, 0x0d]),
    to: Buffer.from([0xd0, 0x25, 0xd7, 0x03, 0x68, 0x0d, 0x02, 0x02]) },
  // num4 拷贝 → num4=911（溢出分支读它！pushshort 911 = 8f 07）
  { label: "num4->911",
    from: Buffer.from([0xd0, 0xd0, 0x66, 0x02, 0x66, 0x0e, 0x68, 0x0f]),
    to: Buffer.from([0xd0, 0x25, 0x8f, 0x07, 0x68, 0x0f, 0x02, 0x02]) },
  // next() 算术段: seq*num1 + (x%num2) + (_hashSessionId%num3)
  //           → seq*7 + 102 + (_hashSessionId%569)，4 nop 补齐 21B
  { label: "next-arith",
    from: Buffer.from([0xd1, 0xd0, 0x66, 0x09, 0xa2, 0xd2, 0xd0, 0x66, 0x0b, 0xa4, 0xa0, 0xd0, 0x66, 0x17, 0xd0, 0x66, 0x0d, 0xa4, 0xa0, 0x75, 0xd7]),
    to: Buffer.from([0xd1, 0x24, 0x07, 0xa2, 0x25, 0x66, 0xa0, 0xd0, 0x66, 0x17, 0x25, 0xb9, 0x04, 0xa4, 0xa0, 0x75, 0xd7, 0x02, 0x02, 0x02, 0x02]) },
  // next() 溢出分支: (t%1047483647) + num4 —— onLoaderDeq 在 Ruffle 永不触发（shader 回调），
  // num4 恒 0 → 直接内联 pushshort 911（真实客户端 num4 实测值，40+ 溢出点验证）
  // getlocal0 getprop num4 add (4B) → pushshort 911 add (4B)
  { label: "overflow-num4->911",
    from: Buffer.from([0xa4, 0xd0, 0x66, 0x0f, 0xa0, 0x73]),
    to: Buffer.from([0xa4, 0x25, 0x8f, 0x07, 0xa0, 0x73]) },
];

let out = body, hits = 0;
for (const { label, from, to } of PATCHES) {
  if (from.length !== to.length) throw new Error("length mismatch: " + label);
  const i = out.indexOf(from);
  if (i < 0) { console.log(`  [skip] ${label}`); continue; }
  if (out.indexOf(from, i + 1) >= 0) { console.log(`  [skip] ${label} (not unique)`); continue; }
  to.copy(out, i);
  hits++;
  console.log(`  [patch] ${label} @${i} (${from.length}B, in-place)`);
}
if (hits < 7) { console.error(`only ${hits}/7 patched — abort`); process.exit(1); }

// ---- 重组（长度不变 → 直接重压缩）----
if (out.length !== body.length) throw new Error("length changed?!");
const comp = zlib.deflateSync(out);
const declaredLen = 8 + out.length;
const res = Buffer.concat([prefix, Buffer.from("CWS"), Buffer.from([swfVer ?? 18]), u32le(declaredLen), comp]);
fs.writeFileSync(outFile, res);
console.log(`patched [${hits}/6]: ${inFile} -> ${outFile} (${raw.length} -> ${res.length}B)`);

function u32le(v) { const b = Buffer.alloc(4); b.writeUInt32LE(v >>> 0, 0); return b; }
