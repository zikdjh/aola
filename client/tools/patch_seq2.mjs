// patch_seq2.mjs — DefenseMsgSeq worker 方法补丁（字节拼接式，v2）
// 目标方法（55B）: seqLoader.enqueue 调用 + num1-4 拷贝（this.numX = this.seqLoader.numX）
// Ruffle ShaderJob 空壳 → SeqLoader 永不完成 → 拷贝到的永远是 0 → 防御序列失效 → 被踢
// 补丁: ① NOP 掉 enqueue 头部（18B）② num1-4 直填 PBJ 常量 (2, 653, 471, 1)
// 构造函数保持原样（seqLoader 照常创建，其他代码依赖它）
// 用法: node patch_seq2.mjs <in.swf> <out.swf>
import fs from "node:fs";
import zlib from "node:zlib";

const [, , inFile, outFile] = process.argv;
const raw = fs.readFileSync(inFile);
let prefix, body, swfVer, layout;
if (raw.subarray(8, 11).toString("latin1") === "CWS") {
  prefix = raw.subarray(0, 8); body = zlib.inflateSync(raw.subarray(16));
  swfVer = raw[11]; layout = "8+CWS";
} else if (raw.subarray(0, 3).toString("latin1") === "CWS") {
  prefix = Buffer.alloc(0); body = zlib.inflateSync(raw.subarray(8));
  swfVer = raw[3]; layout = "CWS";
} else { console.error("unknown container:", inFile); process.exit(1); }

// ---- worker 方法的字节模式（socketserver1 常量池布局）----
// 头部: getlocal0 getprop seqLoader findpropstrict SeqLoader getprop SeqLoader
//       getprop mn3 getlocal0 getprop mn4 callproperty mn7,2 pop
const HEAD = Buffer.from([0xd0, 0x66, 0x02, 0x5d, 0x01, 0x66, 0x01, 0x66, 0x03, 0xd0, 0x66, 0x04, 0x46, 0x07, 0x02, 0x29]);
// 拷贝序列: getlocal0 getlocal0 getprop seqLoader getprop mnX initprop numX
const COPIES = [
  { from: Buffer.from([0xd0, 0xd0, 0x66, 0x02, 0x66, 0x08, 0x68, 0x09]), to: Buffer.from([0xd0, 0x24, 0x02, 0x68, 0x09]) },             // num1 = 2
  { from: Buffer.from([0xd0, 0xd0, 0x66, 0x02, 0x66, 0x0a, 0x68, 0x0b]), to: Buffer.from([0xd0, 0x25, 0x8d, 0x05, 0x68, 0x0b]) },       // num2 = 653 (pushshort)
  { from: Buffer.from([0xd0, 0xd0, 0x66, 0x02, 0x66, 0x0c, 0x68, 0x0d]), to: Buffer.from([0xd0, 0x25, 0xd7, 0x03, 0x68, 0x0d]) },       // num3 = 471 (pushshort)
  { from: Buffer.from([0xd0, 0xd0, 0x66, 0x02, 0x66, 0x0e, 0x68, 0x0f]), to: Buffer.from([0xd0, 0x24, 0x01, 0x68, 0x0f]) },             // num4 = 1
];

// ---- 对整个解压 body 做字节级替换（模式在 ABC 代码区内唯一，无位移引用，拼接安全）----
function replaceOnce(buf, from, to, label) {
  const i = buf.indexOf(from);
  if (i < 0) { console.log(`  [skip] ${label}: pattern not found`); return buf; }
  if (buf.indexOf(from, i + 1) >= 0) { console.log(`  [skip] ${label}: pattern not unique`); return buf; }
  const out = Buffer.concat([buf.subarray(0, i), to, buf.subarray(i + from.length)]);
  console.log(`  [patch] ${label}: ${from.length}B -> ${to.length}B @${i}`);
  return out;
}

let out = body;
out = replaceOnce(out, HEAD, Buffer.alloc(HEAD.length, 0x02), "enqueue-head -> nop*16");
for (const c of COPIES) out = replaceOnce(out, c.from, c.to, "copy->const");
if (out === body) { console.error("nothing patched:", inFile); process.exit(1); }

// ---- 重建 SWF：头部 + 压缩 ----
const comp = zlib.deflateSync(out);
const declaredLen = 8 + out.length;
const res = Buffer.concat([prefix, Buffer.from("CWS"), Buffer.from([swfVer ?? 18]), u32le(declaredLen), comp]);
fs.writeFileSync(outFile, res);
console.log(`patched [${layout}]: ${inFile} -> ${outFile} (${raw.length} -> ${res.length}B)`);

function u32le(v) { const b = Buffer.alloc(4); b.writeUInt32LE(v >>> 0, 0); return b; }
