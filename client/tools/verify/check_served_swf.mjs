// check_served_swf.mjs — 校验网关发出的降采样 SWF 结构合法（位图数/尺寸/header）
import zlib from "node:zlib";

const url = process.argv[2] || "http://127.0.0.1:8700/mirror/aola.100bt.com/play/peticon/movie/type0/petmovie5902/petmovie5902_0.swf";
const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
const sig = buf.toString("ascii", 0, 3);
const declared = buf.readUInt32LE(4);
console.log(`URL: ${url.split("/").slice(-1)[0]}`);
console.log(`签名=${sig} 声明长度=${declared} 实际=${buf.length} ${declared === buf.length ? "✅" : "❌ 不匹配"}`);

// header
const nBits = buf[8] >> 3;
const hdrEnd = 8 + Math.ceil((5 + nBits * 4) / 8) + 4;
const frameRate = buf.readUInt16LE(hdrEnd - 4) / 256;
const frameCount = buf.readUInt16LE(hdrEnd - 2);
console.log(`nBits=${nBits} headerEnd=${hdrEnd} frameRate=${frameRate} frameCount=${frameCount}`);

// tags
let off = hdrEnd;
const counts = {};
let bitmaps = 0, totalPx = 0, totalZ = 0;
const dims = [];
while (off < buf.length - 1) {
  const tagAndLen = buf.readUInt16LE(off);
  const code = tagAndLen >> 6;
  let len = tagAndLen & 0x3F;
  off += 2;
  if (len === 0x3F) { len = buf.readUInt32LE(off); off += 4; }
  if (code === 0) { counts.End = (counts.End || 0) + 1; break; }
  counts[code] = (counts[code] || 0) + 1;
  if (code === 36 && len > 8) {
    const format = buf[off + 2], w = buf.readUInt16LE(off + 3), h = buf.readUInt16LE(off + 5);
    let zStart = off + 7, ctByte = -1;
    if (buf[zStart] !== 0x78 && buf[zStart] !== 0x9C && buf[zStart] !== 0xDA) { ctByte = buf[zStart]; zStart++; }
    if (format === 3) {
      try {
        const raw = zlib.inflateSync(buf.subarray(zStart, off + len));
        const ctSize = (ctByte >= 0 ? ctByte : raw[0]) + 1;
        const need = ctSize * 4 + w * h;
        if (raw.length === need) { bitmaps++; totalPx += w * h; totalZ += len; dims.push(`${w}x${h}`); }
        else console.log(`  ⚠ 位图数据长度异常: raw=${raw.length} 需=${need} (${w}x${h} ct=${ctSize})`);
      } catch (e) { console.log(`  ❌ 位图解压失败: ${e.message}`); }
    }
  }
  off += len;
}
console.log(`tag 统计: ${JSON.stringify(counts)}`);
console.log(`有效位图: ${bitmaps} 个, ${(totalPx/1e6).toFixed(2)}M px, 示例尺寸: ${dims.slice(0,4).join(", ")}`);
console.log(bitmaps > 0 && declared === buf.length ? "✅ SWF 结构合法，可被 Ruffle 正常加载" : "❌ 结构有问题");
