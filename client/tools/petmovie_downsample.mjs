// petmovie_downsample.mjs — petmovie 分片位图降采样（Round 64）
//
// 背景：背包/精灵详情的大立绘由 peticon/movie/type0/petmovie<ID>/petmovie<ID>_{0,1,2,3}.swf
// 四个分片组成，每个约 1.5-1.7MB，内部 100% 是 DefineBitsLossless2 位图
// （12-13 张 525x475 format=3 调色板位图）。Ruffle 解码一个分片需 3.4-4.9s，
// 4 个分片合计 15s+，这是「点精灵卡片等 1-2 秒」的物理原因。
//
// 做法：把位图等比降采样到 factor（默认 0.5），保持 SWF 结构/类/时间轴完全不变
// （只改 DefineBitsLossless2 的 w/h 与像素数据），所以不会 #1065/#1009。
// 实测：1.62MB → 0.52MB（-68%），Ruffle 加载 4373ms → 1418ms（3.1x）。
//
// 用法：
//   node petmovie_downsample.mjs <in.swf> <out.swf> [factor]
//   node petmovie_downsample.mjs --dir <cache目录> [factor]      # 批量
//   node petmovie_downsample.mjs --scan <cache目录>              # 只统计不改
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import zlib from "node:zlib";

const TAG_END = 0, TAG_DEFINE_BITS_LOSSLESS2 = 36;

/**
 * 在调色板里找最接近 (r,g,b,a) 的颜色索引。
 * 加权距离：人眼对绿最敏感，同时给 alpha 较大权重（透明边缘必须保住）。
 */
function nearestPalette(palette, ctSize, r, g, b, a) {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < ctSize; i++) {
    const p = i * 4;
    const dr = palette[p] - r, dg = palette[p + 1] - g, db = palette[p + 2] - b, da = palette[p + 3] - a;
    // alpha 距离权重高（避免把透明像素平均进实体边缘）
    const d = dr * dr * 0.30 + dg * dg * 0.59 + db * db * 0.11 + da * da * 1.5;
    if (d < bestD) { bestD = d; best = i; if (d === 0) break; }
  }
  return best;
}

/** 解析 SWF 头，返回 tag 起始偏移 */
function headerEnd(buf) {
  if (buf.length < 8) throw new Error("too short");
  const sig = buf.toString("ascii", 0, 3);
  if (sig !== "FWS") throw new Error(`只支持未压缩 FWS，实际 ${sig}（ZWS/CWS 请先解压）`);
  let off = 8;
  const nBits = buf[off] >> 3;
  off += Math.ceil((5 + nBits * 4) / 8) + 4;   // RECT + frameRate + frameCount
  return off;
}

/** 遍历 tag，返回 [{code, start, end, dataStart, len}] */
function parseTags(buf) {
  const tags = [];
  let off = headerEnd(buf);
  while (off < buf.length - 1) {
    const start = off;
    const tagAndLen = buf.readUInt16LE(off);
    const code = tagAndLen >> 6;
    let len = tagAndLen & 0x3F;
    off += 2;
    if (len === 0x3F) {
      if (off + 4 > buf.length) break;
      len = buf.readUInt32LE(off);
      off += 4;
    }
    if (code === TAG_END) { tags.push({ code, start, end: off, dataStart: off, len: 0 }); break; }
    if (off + len > buf.length) break;
    tags.push({ code, start, end: off + len, dataStart: off, len });
    off += len;
  }
  return tags;
}

/**
 * 对单个 SWF buffer 做位图降采样。
 * @returns {{ buf: Buffer, stats: {bitmaps:number, origPx:number, newPx:number, skipped:number} }}
 */
export function downsampleSwf(buf, factor = 0.5) {
  const tags = parseTags(buf);
  const hdrEnd = headerEnd(buf);
  const swfHeader = buf.subarray(8, hdrEnd);   // RECT + frameRate + frameCount —— 必须原样保留
  const stats = { bitmaps: 0, origPx: 0, newPx: 0, skipped: 0 };
  const pieces = [];

  for (const t of tags) {
    if (t.code !== TAG_DEFINE_BITS_LOSSLESS2 || t.len === 0) {
      pieces.push(buf.subarray(t.start, t.end));
      continue;
    }
    const d = buf.subarray(t.dataStart, t.end);
    if (d.length < 8) { pieces.push(buf.subarray(t.start, t.end)); stats.skipped++; continue; }

    const charId = d.readUInt16LE(0);
    const format = d[2];
    const w = d.readUInt16LE(3);
    const h = d.readUInt16LE(5);
    stats.origPx += w * h;

    // 只处理 format=3（8bit 调色板）；format=5（32bit ARGB）结构不同，保守跳过
    if (format !== 3 || w === 0 || h === 0) {
      pieces.push(buf.subarray(t.start, t.end)); stats.skipped++; continue;
    }

    let zdata = d.subarray(7);
    // SWF 规范：format=3 时 zdata 前有 1 字节 colorTableSize（未压缩），其后才是 zlib 流
    let ctSizeByte = -1;
    if (zdata[0] !== 0x78 && zdata[0] !== 0x9C && zdata[0] !== 0xDA) {
      ctSizeByte = zdata[0];
      zdata = zdata.subarray(1);
    }

    let raw;
    try { raw = zlib.inflateSync(zdata); } catch { pieces.push(buf.subarray(t.start, t.end)); stats.skipped++; continue; }

    const ctSize = (ctSizeByte >= 0 ? ctSizeByte : raw[0]) + 1;
    const palBytes = ctSize * 4;
    if (raw.length < palBytes + w * h) { pieces.push(buf.subarray(t.start, t.end)); stats.skipped++; continue; }
    const palette = raw.subarray(0, palBytes);
    const indices = raw.subarray(palBytes);

    const nw = Math.max(1, Math.round(w * factor));
    const nh = Math.max(1, Math.round(h * factor));
    // ⚠️ 调色板位图每行按 4 字节对齐：源读取步长、输出写入步长都必须是 ceil(x/4)*4
    //    （Round 67 崩溃根因：写紧凑行会让 Ruffle decode_define_bits_lossless 越界 panic）
    const sRow = Math.ceil(w / 4) * 4;
    const nRow = Math.ceil(nw / 4) * 4;
    const newIdx = Buffer.alloc(nRow * nh);
    // 盒式平均（box filter）：每个输出像素取其源矩形内所有像素的平均色，
    // 再映射到最近的调色板颜色 —— 比最近邻平滑得多（边缘不会锯齿、细节不会整块丢失）
    for (let y = 0; y < nh; y++) {
      const y0 = Math.floor(y * h / nh), y1 = Math.max(y0 + 1, Math.floor((y + 1) * h / nh));
      for (let x = 0; x < nw; x++) {
        const x0 = Math.floor(x * w / nw), x1 = Math.max(x0 + 1, Math.floor((x + 1) * w / nw));
        let sr = 0, sg = 0, sb = 0, sa = 0, cnt = 0;
        for (let sy = y0; sy < y1; sy++) {
          const row = sy * sRow;
          for (let sx = x0; sx < x1; sx++) {
            const pi = indices[row + sx] * 4;
            const a = palette[pi + 3];
            // 预乘 alpha 做平均，避免透明像素把边缘染黑
            sr += palette[pi] * a; sg += palette[pi + 1] * a; sb += palette[pi + 2] * a;
            sa += a; cnt++;
          }
        }
        newIdx[y * nRow + x] = sa > 0 ? nearestPalette(palette, ctSize, sr / sa, sg / sa, sb / sa, sa / cnt) : 0;
      }
    }

    const newRaw = Buffer.concat([palette, newIdx]);
    const newZ = zlib.deflateSync(newRaw, { level: 6 });
    const prefix = ctSizeByte >= 0 ? Buffer.from([ctSizeByte]) : Buffer.alloc(0);
    const body = Buffer.alloc(7 + prefix.length + newZ.length);
    body.writeUInt16LE(charId, 0);
    body[2] = format;
    body.writeUInt16LE(nw, 3);
    body.writeUInt16LE(nh, 5);
    prefix.copy(body, 7);
    newZ.copy(body, 7 + prefix.length);

    const tagHeader = Buffer.alloc(6);
    tagHeader.writeUInt16LE((TAG_DEFINE_BITS_LOSSLESS2 << 6) | 0x3F, 0);
    tagHeader.writeUInt32LE(body.length, 2);
    pieces.push(Buffer.concat([tagHeader, body]));

    stats.bitmaps++;
    stats.newPx += nw * nh;
  }

  const body = Buffer.concat(pieces);
  const out = Buffer.alloc(8 + swfHeader.length + body.length);
  out.write("FWS", 0, "ascii");
  out[3] = buf[3];
  out.writeUInt32LE(8 + swfHeader.length + body.length, 4);
  swfHeader.copy(out, 8);
  body.copy(out, 8 + swfHeader.length);
  return { buf: out, stats };
}

// ---------------- CLI ----------------
if (process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("petmovie_downsample.mjs")) {
  const args = process.argv.slice(2);
  const scanMode = args[0] === "--scan";
  const dirMode = args[0] === "--dir";

  if (scanMode) {
    const dir = args[1];
    let total = 0, files = 0, px = 0;
    const walk = (d) => {
      for (const e of readdirSync(d)) {
        const p = join(d, e);
        const s = statSync(p);
        if (s.isDirectory()) walk(p);
        else if (e.endsWith(".swf") && /petmovie\d+_\d\.swf$/.test(e)) {
          files++; total += s.size;
          try { const b = readFileSync(p); const tags = parseTags(b);
            for (const t of tags) if (t.code === TAG_DEFINE_BITS_LOSSLESS2) {
              const dd = b.subarray(t.dataStart, t.end);
              if (dd.length >= 7 && dd[2] === 3) px += dd.readUInt16LE(3) * dd.readUInt16LE(5);
            }
          } catch {}
        }
      }
    };
    walk(dir);
    console.log(`petmovie 分片: ${files} 个, 合计 ${(total/1048576).toFixed(1)}MB, 位图像素 ${(px/1e6).toFixed(1)}M`);
    process.exit(0);
  }

  if (dirMode) {
    const dir = args[1];
    const factor = Number(args[2] || 0.5);
    let n = 0, before = 0, after = 0;
    const walk = (d) => {
      for (const e of readdirSync(d)) {
        const p = join(d, e);
        const s = statSync(p);
        if (s.isDirectory()) { walk(p); continue; }
        if (!e.endsWith(".swf") || !/petmovie\d+_\d\.swf$/.test(e)) continue;
        try {
          const b = readFileSync(p);
          const { buf: o, stats } = downsampleSwf(b, factor);
          if (stats.bitmaps === 0) continue;
          writeFileSync(p + ".orig", b);
          writeFileSync(p, o);
          n++; before += b.length; after += o.length;
          if (n % 20 === 0) console.log(`  ${n} 个已处理 …`);
        } catch (err) { console.log(`  跳过 ${basename(p)}: ${err.message}`); }
      }
    };
    walk(dir);
    console.log(`完成: ${n} 个分片, ${(before/1048576).toFixed(1)}MB → ${(after/1048576).toFixed(1)}MB (${((1-after/before)*100).toFixed(0)}% 减少)`);
    process.exit(0);
  }

  const [inp, outp, f] = args;
  if (!inp || !outp) {
    console.log("用法:");
    console.log("  node petmovie_downsample.mjs <in.swf> <out.swf> [factor]");
    console.log("  node petmovie_downsample.mjs --dir <cache目录> [factor]");
    console.log("  node petmovie_downsample.mjs --scan <cache目录>");
    process.exit(1);
  }
  const factor = Number(f || 0.5);
  const b = readFileSync(inp);
  const { buf: o, stats } = downsampleSwf(b, factor);
  mkdirSync(dirname(outp), { recursive: true });
  writeFileSync(outp, o);
  console.log(`${inp}: ${(b.length/1048576).toFixed(2)}MB → ${(o.length/1048576).toFixed(2)}MB`);
  console.log(`  位图 ${stats.bitmaps} 个, 跳过 ${stats.skipped}, 像素 ${(stats.origPx/1e6).toFixed(2)}M → ${(stats.newPx/1e6).toFixed(2)}M`);
}
