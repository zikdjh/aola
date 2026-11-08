// verify_pad_fix.mjs — 严格验证行填充修复：
//   原始文件：raw.length === palBytes + ceil(w/4)*4 * h
//   降采样后：raw.length === palBytes + ceil(nw/4)*4 * nh   ← Ruffle 解码器的硬性期望
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import zlib from "node:zlib";
import { downsampleSwf } from "file:///D:/temp/ZCode/aola/client/tools/petmovie_downsample.mjs";

function inspect(buf) {
  const out = [];
  const nBits = buf[8] >> 3;
  let off = 8 + Math.ceil((5 + nBits * 4) / 8) + 4;
  while (off < buf.length - 1) {
    const tagAndLen = buf.readUInt16LE(off);
    const code = tagAndLen >> 6;
    let len = tagAndLen & 0x3F;
    off += 2;
    if (len === 0x3F) { len = buf.readUInt32LE(off); off += 4; }
    if (code === 0) break;
    if (code === 36 && len > 8) {
      const format = buf[off + 2], w = buf.readUInt16LE(off + 3), h = buf.readUInt16LE(off + 5);
      let zStart = off + 7, ctByte = -1;
      if (buf[zStart] !== 0x78 && buf[zStart] !== 0x9C && buf[zStart] !== 0xDA) { ctByte = buf[zStart]; zStart++; }
      if (format === 3) {
        try {
          const raw = zlib.inflateSync(buf.subarray(zStart, off + len));
          const ctSize = (ctByte >= 0 ? ctByte : raw[0]) + 1;
          out.push({ w, h, ctSize, rawLen: raw.length,
            expect: ctSize * 4 + Math.ceil(w / 4) * 4 * h });
        } catch (e) { out.push({ err: e.message }); }
      }
    }
    off += len;
  }
  return out;
}

const dir = "D:/temp/ZCode/aola/client/cache/aola.100bt.com/play/peticon/movie";
const files = [];
const walk = (d) => { for (const e of readdirSync(d)) { const p = join(d, e);
  if (statSync(p).isDirectory()) walk(p); else if (/petmovie\d+_\d\.swf$/.test(e)) files.push(p); } };
walk(dir);

let origTotal = 0, origBad = 0, dsTotal = 0, dsBad = 0, filesDone = 0, filesFailed = 0;
const badSamples = [];
const LIMIT = Number(process.argv[2] || 40);   // 默认抽查 40 个分片，传 0 = 全部

for (const f of files) {
  if (LIMIT > 0 && filesDone >= LIMIT) break;
  const buf = readFileSync(f);
  // 1) 原始
  for (const b of inspect(buf)) {
    if (b.err) continue;
    origTotal++;
    if (b.rawLen !== b.expect) { origBad++; if (badSamples.length < 6) badSamples.push({ f: f.split(/[\\/]/).slice(-1)[0], kind: "orig", ...b }); }
  }
  // 2) 降采样
  let ds;
  try { ds = downsampleSwf(buf, 0.7).buf; } catch (e) { filesFailed++; continue; }
  for (const b of inspect(ds)) {
    if (b.err) { dsBad++; if (badSamples.length < 6) badSamples.push({ f: f.split(/[\\/]/).slice(-1)[0], kind: "ds-inflate", err: b.err }); continue; }
    dsTotal++;
    if (b.rawLen !== b.expect) { dsBad++; if (badSamples.length < 6) badSamples.push({ f: f.split(/[\\/]/).slice(-1)[0], kind: "ds", ...b }); }
  }
  filesDone++;
}

console.log(`抽查分片: ${filesDone} (降采样失败 ${filesFailed})`);
console.log(`\n原始位图  : ${origTotal} 张, 长度不符 ${origBad}`);
console.log(`降采样位图: ${dsTotal} 张, 长度不符 ${dsBad}`);
if (badSamples.length) { console.log("\n不符样例:"); for (const s of badSamples) console.log("  ", JSON.stringify(s)); }
console.log(`\n结论: ${origBad === 0 && dsBad === 0 ? "✅ 全部满足 Ruffle 的 4 字节行对齐期望，不会再触发 index out of bounds" : "❌ 仍有不符，需继续修"}`);
