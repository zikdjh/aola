// check_padding_rule.mjs — 验证 DefineBitsLossless2(format=3) 是否要求「每行 4 字节对齐」
// 若成立：raw.length === palBytes + ceil(w/4)*4 * h
import { readFileSync } from "node:fs";
import zlib from "node:zlib";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function parseBitmaps(buf) {
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
          out.push({ w, h, ctByte, rawLen: raw.length });
        } catch {}
      }
    }
    off += len;
  }
  return out;
}

const dir = "D:/temp/ZCode/aola/client/cache/aola.100bt.com/play/peticon/movie";
const files = [];
const walk = (d) => {
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (/petmovie\d+_\d\.swf$/.test(e)) files.push(p);
  }
};
walk(dir);
console.log(`扫描 ${files.length} 个分片…`);

let checked = 0, unpadOK = 0, padOK = 0, neither = 0;
const samples = [];
for (const f of files) {
  let bmps;
  try { bmps = parseBitmaps(readFileSync(f)); } catch { continue; }
  for (const b of bmps) {
    const palBytes = (b.ctByte >= 0 ? b.ctByte + 1 : 256) * 4;  // 先按 256 色估
    const plain = palBytes + b.w * b.h;
    const paddedRow = Math.ceil(b.w / 4) * 4;
    const padded = palBytes + paddedRow * b.h;
    checked++;
    if (b.rawLen === plain) unpadOK++;
    else if (b.rawLen === padded) padOK++;
    else { neither++; if (samples.length < 5) samples.push({ f: f.split(/[\\/]/).slice(-1)[0], w: b.w, h: b.h, ctByte: b.ctByte, rawLen: b.rawLen, plain, padded }); }
  }
}
console.log(`\n检查位图 ${checked} 张:`);
console.log(`  未填充(plain) 匹配: ${unpadOK}`);
console.log(`  4字节行填充(padded) 匹配: ${padOK}`);
console.log(`  都不匹配: ${neither}`);
if (samples.length) { console.log('\n不匹配样例:'); for (const s of samples) console.log(' ', JSON.stringify(s)); }
console.log(`\n结论: ${padOK > unpadOK * 10 ? '✅ 需要每行 4 字节对齐填充（这就是崩溃根因）' : unpadOK > padOK * 10 ? '❌ 不需要填充，另有原因' : '⚠ 规则不统一，需逐例分析'}`);
