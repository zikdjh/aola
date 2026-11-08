// verify_served.mjs — 从网关拉取 petmovie 分片，逐张校验位图长度契约（Ruffle 解码的硬性要求）
import zlib from "node:zlib";

const urls = process.argv.slice(2);
if (!urls.length) {
  console.error("用法: node verify_served.mjs <url1> [url2 ...]");
  process.exit(1);
}

let total = 0, bad = 0, files = 0;
for (const url of urls) {
  const res = await fetch(url);
  const buf = Buffer.from(await res.arrayBuffer());
  files++;
  const name = url.split("/").slice(-1)[0];
  if (buf.toString("ascii", 0, 3) !== "FWS") {
    console.log(`${name}: 非 FWS（${buf.toString("ascii", 0, 3)}），跳过`);
    continue;
  }
  const declared = buf.readUInt32LE(4);
  const nBits = buf[8] >> 3;
  const hdrEnd = 8 + Math.ceil((5 + nBits * 4) / 8) + 4;
  const frameRate = buf.readUInt16LE(hdrEnd - 4) / 256;
  let off = hdrEnd;
  let bm = 0, badHere = 0, dims = [];
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
          const expect = ctSize * 4 + Math.ceil(w / 4) * 4 * h;
          bm++; total++;
          if (raw.length !== expect) { bad++; badHere++; console.log(`  ❌ ${name} 位图 ${w}x${h}: raw=${raw.length} 期望=${expect}`); }
          if (dims.length < 3) dims.push(`${w}x${h}`);
        } catch (e) { bad++; badHere++; total++; console.log(`  ❌ ${name} 解压失败: ${e.message}`); }
      }
    }
    off += len;
  }
  const okLen = declared === buf.length ? "✅" : "❌长度不符";
  console.log(`${name}: ${(buf.length/1024).toFixed(0)}KB ${okLen} frameRate=${frameRate} 位图=${bm} 异常=${badHere} 尺寸=${dims.join(",")}`);
}
console.log(`\n合计 ${files} 个文件 / ${total} 张位图，异常 ${bad} 张`);
console.log(bad === 0 ? "✅ 全部满足 4 字节行对齐，Ruffle 解码不会越界" : "❌ 存在异常");
process.exit(bad === 0 ? 0 : 1);
