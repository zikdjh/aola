// dump_btn_icons.mjs — 把 SWF 里的 DefineBitsLossless2(fmt5) 位图全部导出为 PNG
// 用途：肉眼定位「系统技能按钮徽章」素材（Round 55/56，瞬耀/王者按钮被抽空）
import fs from "node:fs";
import zlib from "node:zlib";
let lzma = null;
for (const spec of ["./vendor/lzma/index.js", "./node_modules/lzma/index.js"]) {
  try { lzma = (await import(new URL(spec, import.meta.url))).default; break; } catch {}
}
if (!lzma) { console.error("缺少 lzma（vendor/lzma 或 node_modules/lzma）"); process.exit(1); }

function bodyOf(p) {
  const raw = fs.readFileSync(p);
  const sig = raw.subarray(0, 3).toString("latin1");
  if (sig === "ZWS") {
    const cLen = raw.readUInt32LE(8), declared = raw.readUInt32LE(4);
    const hdr = Buffer.alloc(13);
    raw.subarray(12, 17).copy(hdr, 0);
    hdr.writeBigUInt64LE(BigInt(declared), 5);
    return new Promise((res, rej) =>
      lzma.decompress(Buffer.concat([hdr, raw.subarray(17, 17 + cLen)]),
        (o, e) => (e ? rej(e) : res(Buffer.from(o)))));
  }
  return Promise.resolve(sig === "CWS" ? zlib.inflateSync(raw.subarray(8)) : raw.subarray(8));
}

// 最小 PNG 编码（RGBA8）
const CRC_T = [];
for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC_T[n] = c >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crcB = Buffer.alloc(4);
  let c = 0xFFFFFFFF;
  for (const x of td) c = CRC_T[(c ^ x) & 0xFF] ^ (c >>> 8);
  crcB.writeUInt32BE((c ^ 0xFFFFFFFF) >>> 0, 0);
  return Buffer.concat([len, td, crcB]);
}
function png(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const stride = w * 4;
  const raw2 = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) { raw2[y * (stride + 1)] = 0; rgba.copy(raw2, y * (stride + 1) + 1, y * stride, (y + 1) * stride); }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw2, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const OUT = "D:/temp/ZCode/scratch/btn_icons";
fs.mkdirSync(OUT, { recursive: true });
const files = process.argv.slice(2);
let total = 0;
for (const f of files) {
  const body = await bodyOf(f);
  const nbits = body[0] >> 3;
  let pos = Math.ceil((5 + 4 * nbits) / 8) + 4;
  const base = f.split("/").pop().replace(/\.swf$/i, "");
  let n = 0;
  while (pos + 2 <= body.length) {
    const h2 = body.readUInt16LE(pos); pos += 2;
    const code = h2 >> 6; let len = h2 & 0x3f;
    if (len === 0x3f) { len = body.readUInt32LE(pos); pos += 4; }
    const t = body.subarray(pos, pos + len); pos += len;
    if ((code === 20 || code === 36) && t.length >= 7 && t[2] === 5) {
      const id = t.readUInt16LE(0), w = t.readUInt16LE(3), h = t.readUInt16LE(5);
      try {
        const px = zlib.inflateSync(t.subarray(7));
        if (px.length < w * h * 4) { console.log("  ! id" + id + " 像素不足 " + px.length + "<" + w * h * 4); continue; }
        const rgba = Buffer.alloc(w * h * 4);
        for (let i = 0; i < w * h; i++) {
          const A = px[i * 4], R = px[i * 4 + 1], G = px[i * 4 + 2], B = px[i * 4 + 3]; // 预乘 ARGB
          const a = A / 255;
          rgba[i * 4] = Math.min(255, Math.round(R / a));
          rgba[i * 4 + 1] = Math.min(255, Math.round(G / a));
          rgba[i * 4 + 2] = Math.min(255, Math.round(B / a));
          rgba[i * 4 + 3] = A;
        }
        fs.writeFileSync(`${OUT}/${base}_id${id}_${w}x${h}.png`, png(w, h, rgba));
        n++;
      } catch (e) { console.log("  ! id" + id + " 解压失败 " + e.message); }
    } else if ((code === 21 || code === 35 || code === 90) && t.length >= 6) {
      // DefineBitsJPEG2/3/4：tag35 = id(2)+JPEGTables(4B长度)+jpeg(+alpha)；tag21/90 = id(2)+jpeg
      const id = t.readUInt16LE(0);
      let jpeg = null;
      if (code === 35 && t.length >= 6) {
        const jl = t.readUInt32LE(2);
        jpeg = t.subarray(6, 6 + jl);
      } else {
        jpeg = t.subarray(2);
      }
      if (jpeg && jpeg.length > 4 && jpeg[0] === 0xFF && jpeg[1] === 0xD8) {
        fs.writeFileSync(`${OUT}/${base}_id${id}.jpg`, jpeg);
        n++;
      }
    }
    if (code === 0) break;
  }
  console.log(base, "导出位图 PNG ×" + n);
  total += n;
}
console.log("共", total, "张 →", OUT);
