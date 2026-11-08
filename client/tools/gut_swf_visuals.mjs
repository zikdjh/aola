// gut_swf_visuals.mjs —— 生成「画面空壳」资源：保留 SWF 的类定义/子对象/时间轴，
// 只把可见内容抽掉。用途：网关按开关把重型演出 SWF 换发成这个极小版本，
// 让演出不再显示、不再解码大图，但**不破坏类契约**（避免 #1065 找不到类 / #1009 子对象为 null）。
//
// 变换规则（全部保持 character id 不变，仅改定义体）：
//   位图类标签 20/21/35/36/90 → DefineBitsLossless2 1x1 全透明（格式5=ARGB，宽高字段=1）
//   ⚠️ 规范里 Width/Height 是**实际像素数**（不是 -1）：写成 0 会让 Ruffle 注册 0×0 纹理，
//      wgpu 直接 panic "create_texture: Dimension X is zero"（Round 51 实锤，之前一直写错）。
//   矢量形状   2/22/32/83/84   → 同类型空形状（0 填充样式 / 0 线样式 / NumBits=0 / EndShapeRecord）
//   其余标签（FileAttributes/DoABC/SymbolClass/DefineSprite/PlaceObject/文本…）原样保留
//
// 生成的 SWF 输出为 CWS（zlib）。生成后会做一次**结构自检**：逐个标签重新解析，
// 校验形状体恰好被完整消费、位图体长度与数据一致、文件以 End 标签结束且无残余字节。
// （Round 43 教训：空形状漏写 EndShapeRecord → Ruffle 报 "failed to fill whole buffer"，
//   整个 SWF 定义失败、类注册不上 → 战斗卡白屏。必须结构化自检，光比对 ABC/sprite 不够。）
//
// 用法: node gut_swf_visuals.mjs <in.swf> <out.swf>
//   输入支持 FWS / CWS / ZWS（ZWS 需要 client/tools 下已安装 lzma 依赖）
import fs from "node:fs";
import zlib from "node:zlib";
import lzma from "lzma";

const BITMAP_TAGS = new Set([20, 21, 35, 36, 90]);
const SHAPE_TAGS = new Set([2, 22, 32, 83, 84]);

function decompress(b) {
  const sig = b.subarray(0, 3).toString("latin1");
  if (sig === "FWS") return { body: b.subarray(8), sig };
  if (sig === "CWS") return { body: zlib.inflateSync(b.subarray(8)), sig };
  if (sig === "ZWS") {
    const cLen = b.readUInt32LE(8);
    const declared = b.readUInt32LE(4);              // SWF 头里记录的「解压后总长度」
    const hdr = Buffer.alloc(13);
    b.subarray(12, 17).copy(hdr, 0);                 // 5B LZMA 属性 + 8B 长度 = .lzma 独立头
    hdr.writeBigUInt64LE(BigInt(declared), 5);
    return { body: null, sig, alone: Buffer.concat([hdr, b.subarray(17, 17 + cLen)]) };
  }
  throw new Error("未知 SWF 签名: " + sig);
}

// ---- 位级读工具（RECT 用） ----
class BitReader {
  constructor(buf, off) { this.buf = buf; this.pos = off; this.bit = 0; }
  bit1() { const v = (this.buf[this.pos] >> (7 - this.bit)) & 1; if (++this.bit === 8) { this.bit = 0; this.pos++; } return v; }
  ub(n) { let v = 0; for (let i = 0; i < n; i++) v = (v << 1) | this.bit1(); return v; }
  align() { if (this.bit) { this.bit = 0; this.pos++; } }
  rect() { const n = this.ub(5); this.ub(n); this.ub(n); this.ub(n); this.ub(n); this.align(); return this.pos; }
}

// 1x1 全透明位图（ARGB 预乘全 0，zlib 压缩）
const TRANSPARENT_1X1 = zlib.deflateSync(Buffer.from([0, 0, 0, 0]));
function blankBitmap(charId) {
  const b = Buffer.alloc(2 + 1 + 2 + 2 + TRANSPARENT_1X1.length);
  b.writeUInt16LE(charId, 0);
  b.writeUInt8(5, 2);            // 位图格式 5 = ARGB（预乘）
  b.writeUInt16LE(1, 3);         // BitmapWidth  = 实际宽（规范原值，勿写 0）
  b.writeUInt16LE(1, 5);         // BitmapHeight = 实际高
  TRANSPARENT_1X1.copy(b, 7);
  return b;
}

// 空矢量形状：ShapeId + ShapeBounds(RECT,Nbits=0) [+ EdgeBounds+Flags(仅 Shape4)]
//              + SHAPEWITHSTYLE{ FillStyleCount=0, LineStyleCount=0, NumFillBits=NumLineBits=0, EndShapeRecord }
const EMPTY_SHAPE_WITH_STYLE = [0x00, 0x00, 0x00, 0x00];
function blankShape(tagCode, body) {
  const charId = body.readUInt16LE(0);
  const RECT0 = 0x00;                                   // Nbits=0 → 5bit + 补位 = 1 字节
  const head = [charId & 0xff, (charId >> 8) & 0xff, RECT0];
  if (tagCode === 83) {
    // DefineShape4：多了 EdgeBounds 与 Flags 字节（5 位保留 + 3 个使用标志）
    return Buffer.from([...head, RECT0, 0x00, ...EMPTY_SHAPE_WITH_STYLE]);
  }
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

// ---------- 结构自检 ----------
function validateShapeBody(tagCode, body) {
  const r = new BitReader(body, 0);
  r.pos = 2;                        // 跳过 ShapeId
  r.rect();                         // ShapeBounds
  if (tagCode === 83) { r.rect(); r.pos += 1; }   // EdgeBounds + Flags
  const fillCount = r.buf[r.pos]; r.pos += 1;      // 简化：空形状 FillStyleCount=0
  if (fillCount !== 0) return "FillStyleCount 非 0";
  const lineCount = r.buf[r.pos]; r.pos += 1;
  if (lineCount !== 0) return "LineStyleCount 非 0";
  const bits = r.buf[r.pos]; r.pos += 1;
  if (bits !== 0) return "NumFillBits/NumLineBits 非 0";
  const endRec = r.buf[r.pos]; r.pos += 1;
  if (endRec !== 0) return "EndShapeRecord 非 0";
  if (r.pos !== body.length) return `形状体残留 ${body.length - r.pos} 字节`;
  return null;
}

// 解压后的体是「RECT 起」的（不含 8B 文件头），标签流从 rectBytes + FrameRate(2) + FrameCount(2) 开始。
// （旧版写死 8 + rect + 4，只是恰好 batch 里所有 SWF 的 RECT 第 9 字节为 0 才没出错，见 round44 修正。）
function tagStart(body) {
  const nbits = body[0] >> 3;
  return Math.ceil((5 + 4 * nbits) / 8) + 4;
}

// 结构自检：tags 必须能被逐字节完整消费、以 End 结束、无残余。
// opts.shapes / opts.bitmaps（Set 或 null）：只校验「被抽过」的形状/位图，
// 因为选择性抽图会保留大量**未改动的真实形状**（它们的 FillStyleCount 当然非 0）。
function selfCheck(buf, opts = {}) {
  const onlyShapes = opts.shapes || null;      // null = 校验全部（整包抽图模式）
  const onlyBitmaps = opts.bitmaps || null;
  let p = tagStart(buf);
  const problems = [];
  let tags = 0, shapes = 0, bitmaps = 0;
  while (p + 2 <= buf.length) {
    const v = buf.readUInt16LE(p);
    const code = v >> 6;
    let len = v & 0x3f;
    p += 2;
    if (len === 0x3f) { len = buf.readUInt32LE(p); p += 4; }
    if (p + len > buf.length) { problems.push(`标签 ${code} 长度越界`); break; }
    const body = buf.subarray(p, p + len);
    tags++;
    const id = body.length >= 2 ? body.readUInt16LE(0) : -1;
    if (SHAPE_TAGS.has(code) && (!onlyShapes || onlyShapes.has(id))) {
      shapes++;
      const err = validateShapeBody(code, body);
      if (err) problems.push(`标签 ${code} id=${id}: ${err}`);
    } else if (BITMAP_TAGS.has(code) && (!onlyBitmaps || onlyBitmaps.has(id))) {
      bitmaps++;
      // 只校验「空壳形式」：DefineBitsLossless/2 的格式 5 = ARGB 预乘，像素数必须 == 宽×高×4。
      // DefineBitsJPEG2/3/4（21/35/90）是 JPEG 数据，没有这种结构，跳过（保留真实位图时也会走到这里）。
      if (body.length < 7) problems.push(`位图 ${code} 体过短`);
      else if ((code === 20 || code === 36) && body[2] === 5) {
        const w = body.readUInt16LE(3), h = body.readUInt16LE(5);   // 宽高是实际像素数（round51 修正，原误加 1）
        if (!w || !h) problems.push(`位图 ${code} 尺寸为 0（wgpu 会 panic）`);
        const need = w * h * 4;
        let raw = null;
        try { raw = zlib.inflateSync(body.subarray(7)); } catch (e) { problems.push(`位图 ${code} zlib 解压失败`); }
        if (raw && raw.length !== need) problems.push(`位图 ${code} 像素 ${raw.length}B ≠ ${need}B (${w}x${h})`);
      }
    }
    p += len;
    if (code === 0) { if (p !== buf.length) problems.push(`End 后残留 ${buf.length - p} 字节`); break; }
  }
  return { problems, tags, shapes, bitmaps };
}

// ---------- 选择性抽图（round44）：按 SymbolClass 类的依赖闭包只抽「这一族动画」的图像 ----------
// 用途：petfightnew_res.swf 一个包里同时装了普通入场/换宠/死亡/光启入场/星辉入场等
// 550 个 DefineSprite。整包抽图会把普通入场也弄没，所以按类名选目标：
//   --only GQAppearMovie,XinghuiAppearMovie
// 只把这两个类（及其子 sprite）引用到的形状/位图换成空壳，其它一律原样保留。

// 遍历标签流（不复制，仅索引）
function scanTags(body) {
  const start = tagStart(body);
  let p = start;
  const list = [];
  while (p + 2 <= body.length) {
    const h = body.readUInt16LE(p); p += 2;
    const code = h >> 6;
    let len = h & 0x3f;
    if (len === 0x3f) { len = body.readUInt32LE(p); p += 4; }
    if (p + len > body.length) throw new Error(`标签越界 @${p} code=${code}`);
    list.push({ code, body: body.subarray(p, p + len) });
    p += len;
    if (code === 0) break;
  }
  return list;
}

// PlaceObject2/3 里取被放置的 character id（没有则为 null）
function placedCharId(code, b) {
  if (code === 26) {                       // PlaceObject2: Flags(1) Depth(2) [CharId(2) if HasCharacter]
    if (b.length < 5) return null;
    return (b[0] & 0x02) ? b.readUInt16LE(3) : null;
  }
  if (code === 70) {                       // PlaceObject3: Flags1(1) Flags2(1) Depth(2) [ClassName] [CharId]
    if (b.length < 5) return null;
    let o = 4;
    if (b[1] & 0x04) { while (o < b.length && b[o] !== 0) o++; o++; }   // HasClassName
    if (o + 2 > b.length) return null;
    return (b[0] & 0x02) ? b.readUInt16LE(o) : null;
  }
  return null;
}

function analyze(body) {
  const symbols = new Map();      // class 名 -> sprite id
  const spriteRefs = new Map();   // sprite id -> Set(子 id)
  const shapeIds = new Set(), bitmapIds = new Set(), textIds = new Set();
  for (const t of scanTags(body)) {
    if (t.code === 76) {                                   // SymbolClass
      const b = t.body, n = b.readUInt16LE(0);
      let o = 2;
      for (let i = 0; i < n; i++) {
        const id = b.readUInt16LE(o); o += 2;
        let s = "";
        while (o < b.length && b[o] !== 0) s += String.fromCharCode(b[o++]);
        o++;
        symbols.set(s, id);
      }
    } else if (t.code === 39) {                            // DefineSprite
      const b = t.body;
      const id = b.readUInt16LE(0);
      const refs = new Set();
      let q = 4;                                           // SpriteId(2) + FrameCount(2)
      while (q + 2 <= b.length) {
        const h = b.readUInt16LE(q); q += 2;
        const c = h >> 6; let l = h & 0x3f;
        if (l === 0x3f) { l = b.readUInt32LE(q); q += 4; }
        const tb = b.subarray(q, q + l); q += l;
        const cid = placedCharId(c, tb);
        if (cid) refs.add(cid);
        if (c === 0) break;
      }
      spriteRefs.set(id, refs);
    } else if (SHAPE_TAGS.has(t.code)) shapeIds.add(t.body.readUInt16LE(0));
    else if (BITMAP_TAGS.has(t.code)) bitmapIds.add(t.body.readUInt16LE(0));
    else if ([11, 33, 37].includes(t.code)) textIds.add(t.body.readUInt16LE(0));
  }
  return { symbols, spriteRefs, shapeIds, bitmapIds, textIds };
}

// 从若干 root id 出发的依赖闭包
function closureOf(roots, spriteRefs) {
  const seen = new Set();
  const queue = [...roots];
  while (queue.length) {
    const id = queue.shift();
    if (seen.has(id)) continue;
    seen.add(id);
    const refs = spriteRefs.get(id);
    if (refs) for (const r of refs) queue.push(r);
  }
  return seen;
}

const [, , inp, out, ...rest] = process.argv;
if (!inp || !out) {
  console.error("用法: node gut_swf_visuals.mjs <in.swf> <out.swf> [--only 类名子串,...] [--except 类名子串,...]");
  process.exit(1);
}
const onlyIdx = rest.indexOf("--only");
const onlyTokens = onlyIdx >= 0 && rest[onlyIdx + 1]
  ? rest[onlyIdx + 1].split(",").map(s => s.trim().toLowerCase()).filter(Boolean)
  : [];
// --except：保留这些类（及其依赖闭包）的图形，**其它全部抽空**。
// 典型用途：光启/星辉的资源包里 UI 面板必须留着，但同包里那些特效/立绘可以不要。
const exceptIdx = rest.indexOf("--except");
const exceptTokens = exceptIdx >= 0 && rest[exceptIdx + 1]
  ? rest[exceptIdx + 1].split(",").map(s => s.trim().toLowerCase()).filter(Boolean)
  : [];
// --keep-bitmap <id,id,…>：按 character id 保留指定位图不抽。
// 用途：系统技能按钮徽章（瞬耀=xhresource id7 / 王者=gqresource id747）是**游离位图**，
// 不在任何 SymbolClass 类的引用闭包里，--except 够不着（Round 56）。
const keepBmpIdx = rest.indexOf("--keep-bitmap");
const keepBitmapIds = keepBmpIdx >= 0 && rest[keepBmpIdx + 1]
  ? new Set(rest[keepBmpIdx + 1].split(",").map(s => parseInt(s.trim(), 10)).filter(Number.isFinite))
  : new Set();

const raw = fs.readFileSync(inp);
const { body: direct, sig, alone } = decompress(raw);

async function main() {
  let body = direct;
  if (sig === "ZWS") {
    body = await new Promise((res, rej) => lzma.decompress(alone, (o, e) => (e ? rej(e) : res(Buffer.from(o))), null));
  }
  const header = raw.subarray(0, 8);
  const version = header[3];
  const start = tagStart(body);
  const prefix = body.subarray(0, start);       // RECT + FrameRate + FrameCount 原样

  // --only：先算目标闭包，只抽闭包内的形状/位图
  let targetShapes = null, targetBitmaps = null;
  if (onlyTokens.length) {
    const info = analyze(body);
    const matched = [...info.symbols.entries()].filter(([name]) =>
      onlyTokens.some(tok => name.toLowerCase().includes(tok)));
    if (!matched.length) {
      console.error("[gut] --only 没有匹配到任何 SymbolClass 类；可用类名：");
      for (const [name, id] of info.symbols) console.error(`   ${id}  ${name}`);
      process.exit(1);
    }
    const closure = closureOf(matched.map(([, id]) => id), info.spriteRefs);
    targetShapes = new Set([...closure].filter(id => info.shapeIds.has(id)));
    targetBitmaps = new Set([...closure].filter(id => info.bitmapIds.has(id)));
    console.log(`[gut] --only 命中 ${matched.length} 个类：${matched.map(([n]) => n).join(", ")}`);
    console.log(`  闭包 ${closure.size} 个 character → 形状 ${targetShapes.size} / 位图 ${targetBitmaps.size}`);
  }
  // --except：保留这些类闭包内的图形，其余全部抽空
  if (exceptTokens.length) {
    const info = analyze(body);
    const matched = [...info.symbols.entries()].filter(([name]) =>
      exceptTokens.some(tok => name.toLowerCase().includes(tok)));
    if (!matched.length) {
      console.error("[gut] --except 没有匹配到任何 SymbolClass 类；可用类名：");
      for (const [name, id] of info.symbols) console.error(`   ${id}  ${name}`);
      process.exit(1);
    }
    const keep = closureOf(matched.map(([, id]) => id), info.spriteRefs);
    const keepShapes = new Set([...keep].filter(id => info.shapeIds.has(id)));
    const keepBitmaps = new Set([...keep].filter(id => info.bitmapIds.has(id)));
    targetShapes = new Set([...info.shapeIds].filter(id => !keepShapes.has(id)));
    targetBitmaps = new Set([...info.bitmapIds].filter(id => !keepBitmaps.has(id)));
    console.log(`[gut] --except 保留 ${matched.length} 个类：${matched.map(([n]) => n).join(", ")}`);
    console.log(`  保留图形：形状 ${keepShapes.size} / 位图 ${keepBitmaps.size}；` +
      `抽空：形状 ${targetShapes.size} / 位图 ${targetBitmaps.size}`);
  }

  let p = start;
  const outs = [];
  const stat = { bitmap: 0, shape: 0, copied: 0, bytes: 0 };
  const blankedShapes = new Set(), blankedBitmaps = new Set();
  while (p + 2 <= body.length) {
    const v = body.readUInt16LE(p);
    const code = v >> 6;
    let len = v & 0x3f;
    p += 2;
    if (len === 0x3f) { len = body.readUInt32LE(p); p += 4; }
    if (p + len > body.length) throw new Error("标签越界 @ " + p);
    const tag = body.subarray(p, p + len);
    p += len;

    const id = tag.length >= 2 ? tag.readUInt16LE(0) : -1;
    const wantShape = SHAPE_TAGS.has(code) && (!targetShapes || targetShapes.has(id));
    const wantBitmap = BITMAP_TAGS.has(code) && !keepBitmapIds.has(id)
      && (!targetBitmaps || targetBitmaps.has(id));

    if (wantBitmap) {
      outs.push(buildTag(36, blankBitmap(id)));                      // 统一写成 DefineBitsLossless2
      blankedBitmaps.add(id);
      stat.bitmap++; stat.bytes += len;
    } else if (wantShape) {
      outs.push(buildTag(code, blankShape(code, tag)));
      blankedShapes.add(id);
      stat.shape++; stat.bytes += len;
    } else {
      outs.push(buildTag(code, tag));                                // 含文本、ABC、SymbolClass、sprite…
      stat.copied++;
    }
    if (code === 0) break;
  }

  const newBody = Buffer.concat([prefix, ...outs]);
  const head = Buffer.from(header);
  head.write("CWS", 0, "latin1");
  head.writeUInt8(version, 3);
  // SWF 规范：CWS 头里的 FileLength 是**解压后**的整个文件长度（不是压缩后）。
  // 写成压缩长度会被加载器按该长度截断 → "Unexpected EOF when reading tag"（round43 踩过）。
  head.writeUInt32LE(8 + newBody.length, 4);
  const z = zlib.deflateSync(newBody, { level: 9 });
  const outBuf = Buffer.concat([head, z]);

  const check = selfCheck(newBody, targetShapes ? { shapes: blankedShapes, bitmaps: blankedBitmaps } : {});
  console.log(`[gut] ${inp}`);
  console.log(`  输入=${sig} ${raw.length}B 解压=${body.length}B`);
  console.log(`  位图→1x1透明 ${stat.bitmap}；形状→空形状 ${stat.shape}；原样保留 ${stat.copied}`);
  console.log(`  抽掉的可见数据≈${(stat.bytes / 1024).toFixed(1)}KB；输出 CWS ${outBuf.length}B -> ${out}`);
  console.log(`  自检：标签 ${check.tags} 个（校验形状 ${check.shapes} / 位图 ${check.bitmaps}），问题 ${check.problems.length} 项`);
  for (const msg of check.problems.slice(0, 10)) console.log("   !! " + msg);

  fs.writeFileSync(out, outBuf);
  if (check.problems.length) {
    console.error("[gut] 自检未通过，已写出文件但**不可用**");
    process.exit(2);
  }
  console.log("  自检通过 ✅");
}

main().catch(e => { console.error("[gut] 失败:", e && e.message || e); process.exit(1); });
