// gut_inline.mjs — 网关运行时用的「保留类契约、只抽图像」SWF 处理器
// 与 client/tools/gut_swf_visuals.mjs 同源，但：①支持 ZWS（借 vendor/lzma）②纯函数、可在网关内按需调用
// 用法: import { gutSwfBuffer } from "./gut_inline.mjs"; const out = await gutSwfBuffer(buf);
// Round 60：新增 screenShape 选项 —— 抽空时把「全屏形状」原位替换为指定位图铺满其边界的矩形。
// 用途：skillbackground（年费/专属宠的专属战斗背景）进场时游戏会移除旧背景、换上本文件；
//       纯抽空 = 空层露出白色舞台（白屏）。保留类契约 + 全屏形状画成固定星域图后，
//       换上来的层显示星战空间的背景图 —— 背景固定、技能不卡（类名全在）。
import zlib from "node:zlib";

let lzma = null;
for (const spec of ["./vendor/lzma/index.js", "./node_modules/lzma/index.js"]) {
  try { lzma = (await import(new URL(spec, import.meta.url))).default; break; } catch {}
}

const BITMAP_TAGS = new Set([20, 21, 35, 36, 90]);
const SHAPE_TAGS = new Set([2, 22, 32, 83, 84]);
const CODE_DROP = new Set([9]);   // SetBackgroundColor：抽图时会让图层变成纯色底（白屏），按需丢弃

const TRANSPARENT_1X1 = zlib.deflateSync(Buffer.from([0, 0, 0, 0]));
function blankBitmap(charId) {
  const b = Buffer.alloc(7 + TRANSPARENT_1X1.length);
  b.writeUInt16LE(charId, 0);
  b.writeUInt8(5, 2);            // DefineBitsLossless2, ARGB premultiplied
  b.writeUInt16LE(1, 3);         // BitmapWidth = 实际宽（规范原值；写 0 会让 wgpu panic）
  b.writeUInt16LE(1, 5);         // BitmapHeight = 实际高
  TRANSPARENT_1X1.copy(b, 7);
  return b;
}

// ---------- 位级工具 ----------
function _bitReader(buf, startByte) {
  let byte = startByte, bit = 0;
  return {
    read(n) {
      let v = 0;
      for (let i = 0; i < n; i++) { v = (v << 1) | ((buf[byte] >> (7 - bit)) & 1); if (++bit === 8) { bit = 0; byte++; } }
      return v;
    },
    get byte() { return byte; },
  };
}
function _sb(v, n) { return n === 0 ? 0 : (v & (1 << (n - 1))) ? v - (1 << n) : v; }
function parseRECT(buf, pos) {
  const r = _bitReader(buf, pos);
  const n = r.read(5);
  const xMin = _sb(r.read(n), n), xMax = _sb(r.read(n), n), yMin = _sb(r.read(n), n), yMax = _sb(r.read(n), n);
  return { xMin, xMax, yMin, yMax, next: r.byte };
}
function _nbitsSigned(...vs) {
  let n = 1;
  for (const v of vs) { let k = 1; while (v < -(1 << (k - 1)) || v > (1 << (k - 1)) - 1) k++; if (k > n) n = k; }
  return n;
}
function jpegSize(jpg) {
  let p = 2;
  while (p + 9 < jpg.length) {
    if (jpg[p] !== 0xff) { p++; continue; }
    const m = jpg[p + 1];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      return { h: jpg.readUInt16BE(p + 5), w: jpg.readUInt16BE(p + 7) };
    }
    p += 2 + jpg.readUInt16BE(p + 2);
  }
  return null;
}

// 构造 DefineShape(2)：charId 保持原值，边界=原形状 bounds，内容=位图铺满该矩形的单填充矩形
function buildScreenShape(charId, bounds, imgW, imgH, bitmapId) {
  const W = bounds.xMax - bounds.xMin, H = bounds.yMax - bounds.yMin;
  if (W <= 0 || H <= 0 || imgW <= 0 || imgH <= 0) return null;
  const sx = Math.round((W / (imgW * 20)) * 65536);   // 16.16 定点；位图 1px = 20 twip
  const sy = Math.round((H / (imgH * 20)) * 65536);
  const w = {
    b: [], cur: 0, bit: 0,
    put(v, n) { for (let i = n - 1; i >= 0; i--) { this.cur = (this.cur << 1) | ((v >> i) & 1); if (++this.bit === 8) { this.b.push(this.cur); this.cur = 0; this.bit = 0; } } },
    align() { if (this.bit) { this.b.push((this.cur << (8 - this.bit)) & 0xff); this.cur = 0; this.bit = 0; } },
    buf() { this.align(); return Buffer.from(this.b); },
  };
  const mb = _nbitsSigned(bounds.xMin, bounds.xMax, bounds.yMin, bounds.yMax);
  w.put(mb, 5); w.put(bounds.xMin < 0 ? bounds.xMin + (1 << mb) : bounds.xMin, mb);
  w.put(bounds.xMax < 0 ? bounds.xMax + (1 << mb) : bounds.xMax, mb);
  w.put(bounds.yMin < 0 ? bounds.yMin + (1 << mb) : bounds.yMin, mb);
  w.put(bounds.yMax < 0 ? bounds.yMax + (1 << mb) : bounds.yMax, mb);
  w.put(1, 8);        // FillStyleCount = 1
  w.put(0x41, 8);     // FillStyleType = clipped bitmap (smoothed)
  w.put(bitmapId, 16);
  w.put(1, 1);        // MATRIX HasScale = 1
  const sbn = _nbitsSigned(sx, sy);
  w.put(sbn, 5); w.put(sx < 0 ? sx + (1 << sbn) : sx, sbn); w.put(sy < 0 ? sy + (1 << sbn) : sy, sbn);
  w.put(0, 1);        // HasRotate = 0
  w.put(0, 16); w.put(0, 16);   // TranslateX/Y = 0 (SB[16])
  w.put(0, 8);        // LineStyleCount = 0
  w.put(1, 4);        // NumFillBits = 1
  w.put(0, 4);        // NumLineBits = 0
  // StyleChangeRecord：moveTo(bounds.xMin, bounds.yMin) + FillStyle1=1
  w.put(0, 1);        // TypeFlag = 0（样式变更）
  w.put(0, 1);        // StateNewStyles = 0
  w.put(0, 1);        // StateLineStyle = 0
  w.put(1, 1);        // StateFillStyle1 = 1
  w.put(0, 1);        // StateFillStyle0 = 0
  w.put(1, 1);        // StateMoveTo = 1
  const mvb = _nbitsSigned(bounds.xMin, bounds.yMin);
  w.put(mvb, 5);
  w.put(bounds.xMin < 0 ? bounds.xMin + (1 << mvb) : bounds.xMin, mvb);
  w.put(bounds.yMin < 0 ? bounds.yMin + (1 << mvb) : bounds.yMin, mvb);
  w.put(1, 1);        // FillStyle1 索引 = 1（NumFillBits=1 位）
  // 4 条直边：(0,0)→(W,0)→(W,H)→(0,H)→(0,0)
  const eb = _nbitsSigned(W, H);
  const edge = (dx, dy) => { w.put(1, 1); w.put(1, 1); w.put(eb, 4); w.put(1, 1); w.put(dx < 0 ? dx + (1 << eb) : dx, eb); w.put(dy < 0 ? dy + (1 << eb) : dy, eb); };
  edge(W, 0); edge(0, H); edge(-W, 0); edge(0, -H);
  w.put(0, 6);        // EndShapeRecord
  w.align();
  const shapeBody = w.buf();
  const head = Buffer.alloc(2 + shapeBody.length);
  head.writeUInt16LE(charId, 0);
  shapeBody.copy(head, 2);
  return head;   // DefineShape tag body（含 charId）
}

// ---------- 主流程 ----------
const EMPTY_SHAPE_WITH_STYLE = [0x00, 0x00, 0x00, 0x00];
function blankShape(tagCode, body) {
  const charId = body.readUInt16LE(0);
  const RECT0 = 0x00;
  const head = [charId & 0xff, (charId >> 8) & 0xff, RECT0];
  if (tagCode === 83) return Buffer.from([...head, RECT0, 0x00, ...EMPTY_SHAPE_WITH_STYLE]);
  return Buffer.from([...head, ...EMPTY_SHAPE_WITH_STYLE]);
}
function buildTag(code, body) {
  const head = code << 6;
  if (body.length < 0x3f) {
    const b = Buffer.alloc(2 + body.length);
    b.writeUInt16LE(head | body.length, 0); body.copy(b, 2); return b;
  }
  const b = Buffer.alloc(6 + body.length);
  b.writeUInt16LE(head | 0x3f, 0); b.writeUInt32LE(body.length, 2); body.copy(b, 6); return b;
}
function tagStart(body) {
  const nbits = body[0] >> 3;
  return Math.ceil((5 + 4 * nbits) / 8) + 4;
}

// 解压任意 SWF（FWS/CWS/ZWS）→ tag 流 body。供 gutSwfBuffer 与网关侧资源分析共用。
export async function swfBodyOf(raw) {
  const sig = raw.subarray(0, 3).toString("latin1");
  if (sig === "FWS") return raw.subarray(8);
  if (sig === "CWS") return zlib.inflateSync(raw.subarray(8));
  if (sig === "ZWS") {
    if (!lzma) throw new Error("no-lzma");
    const cLen = raw.readUInt32LE(8), declared = raw.readUInt32LE(4);
    const hdr = Buffer.alloc(13);
    raw.subarray(12, 17).copy(hdr, 0);
    hdr.writeBigUInt64LE(BigInt(declared), 5);
    const alone = Buffer.concat([hdr, raw.subarray(17, 17 + cLen)]);
    return new Promise((res, rej) => lzma.decompress(alone, (o, e) => (e ? rej(e) : res(Buffer.from(o))), null));
  }
  throw new Error("unknown-sig-" + sig);
}

// 返回 { ok: true, buf, ...stats } 或 { ok: false, reason }
export async function gutSwfBuffer(raw, opts = {}) {
  let body;
  try {
    body = await swfBodyOf(raw);
  } catch (e) {
    return { ok: false, reason: "decompress: " + (e && e.message) };
  }

  const hdr8 = raw.subarray(0, 8);
  const version = hdr8[3];
  const start = tagStart(body);
  const prefix = body.subarray(0, start);
  const stage = parseRECT(body, 0);
  const stageArea = (stage.xMax - stage.xMin) * (stage.yMax - stage.yMin);

  // screenShape：{ bitmap: JPEG Buffer } —— 全屏形状替换为该位图铺满原形状边界
  let screenBmpTag = null, imgW = 0, imgH = 0;
  if (opts.screenShape && opts.screenShape.bitmap) {
    const size = jpegSize(opts.screenShape.bitmap);
    if (size && size.w > 0 && size.h > 0) {
      imgW = size.w; imgH = size.h;
      const body2 = Buffer.alloc(2 + opts.screenShape.bitmap.length);
      body2.writeUInt16LE(opts.screenShape.bitmapId || 65000, 0);
      opts.screenShape.bitmap.copy(body2, 2);
      screenBmpTag = buildTag(21, body2);   // DefineBitsJPEG2（JPEG 已含完整 JFIF 头）
    }
  }
  const isScreen = (b) => {
    if (!screenBmpTag || stageArea <= 0) return false;
    const r = parseRECT(b, 2);
    const area = (r.xMax - r.xMin) * (r.yMax - r.yMin);
    return area >= stageArea * 0.6;   // 全屏/近全屏（阈值 60%，容错带边框的背景图）
  };

  const outs = [];
  if (screenBmpTag) outs.push(screenBmpTag);   // 位图定义放最前，保证先于引用它的形状
  let p = start, shapes = 0, bitmaps = 0, copied = 0, bgDropped = 0, bgForced = 0, screenShapes = 0;
  while (p + 2 <= body.length) {
    const h = body.readUInt16LE(p); p += 2;
    const code = h >> 6; let len = h & 0x3f;
    if (len === 0x3f) { len = body.readUInt32LE(p); p += 4; }
    if (p + len > body.length) return { ok: false, reason: "tag-overrun" };
    const tag = body.subarray(p, p + len);
    p += len;
    if (BITMAP_TAGS.has(code)) { outs.push(buildTag(36, blankBitmap(tag.readUInt16LE(0)))); bitmaps++; }
    else if (code === 9) {
      bgDropped++;
      if (opts.forceBackgroundColor != null) {
        const c = opts.forceBackgroundColor;
        const nb = Buffer.from([(c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff]);
        outs.push(buildTag(9, nb));
        bgForced++;
      } else if (!opts.stripBackgroundColor) {
        outs.push(buildTag(code, tag));
      }
    }
    else if (SHAPE_TAGS.has(code)) {
      shapes++;
      if (screenBmpTag && isScreen(tag)) {
        // 全屏形状 → 星域图铺满原边界（charId 保持，类时间轴的放置关系不变）
        const r = parseRECT(tag, 2);
        const body2 = buildScreenShape(tag.readUInt16LE(0), { xMin: r.xMin, xMax: r.xMax, yMin: r.yMin, yMax: r.yMax }, imgW, imgH, opts.screenShape.bitmapId || 65000);
        if (body2) { outs.push(buildTag(2, body2)); screenShapes++; continue; }
      }
      outs.push(buildTag(code, blankShape(code, tag)));
    }
    else { outs.push(buildTag(code, tag)); copied++; }
    if (code === 0) break;
  }
  const newBody = Buffer.concat([prefix, ...outs]);
  const head = Buffer.from(hdr8);
  head.write("CWS", 0, "latin1");
  head.writeUInt8(version, 3);
  head.writeUInt32LE(8 + newBody.length, 4);   // FileLength = 解压后总长
  const z = zlib.deflateSync(newBody, { level: 9 });
  return { ok: true, buf: Buffer.concat([head, z]), shapes, bitmaps, copied, bgDropped, bgForced, screenShapes, stage };
}
