// patch_pf_methods.mjs — 通用「方法体 → returnvoid」补丁器（等长替换，结构/偏移不动）
// 用法: node patch_pf_methods.mjs <in.swf> <out.swf> <targets.json> [--dry]
// targets.json: [{ "name": "changeSkillBackGround", "len": 349, "hex": "d030572ad6..." }]
import fs from "node:fs";
import zlib from "node:zlib";

const [, , inp, out, targetsPath, flag] = process.argv;
if (!inp || !out || !targetsPath) {
  console.error("用法: node patch_pf_methods.mjs <in.swf> <out.swf> <targets.json> [--dry]");
  process.exit(1);
}
const targets = JSON.parse(fs.readFileSync(targetsPath, "utf8"));

const raw = fs.readFileSync(inp);
const sig = raw.subarray(0, 3).toString("latin1");
if (sig !== "CWS" && sig !== "FWS") { console.error("需要 CWS/FWS，当前 " + sig); process.exit(1); }
const body = sig === "CWS" ? zlib.inflateSync(raw.subarray(8)) : Buffer.from(raw.subarray(8));

// 找 DoABC 段范围
const nbits = body[0] >> 3;
let p = Math.ceil((5 + 4 * nbits) / 8) + 4;
let abcStart = -1, abcEnd = -1;
while (p + 2 <= body.length) {
  const h = body.readUInt16LE(p); p += 2;
  const code = h >> 6; let len = h & 0x3f;
  if (len === 0x3f) { len = body.readUInt32LE(p); p += 4; }
  if (code === 82) {
    const tagStart = p;
    let o = tagStart + 4;
    while (o < tagStart + len && body[o] !== 0) o++;
    abcStart = o + 1; abcEnd = tagStart + len;
  }
  p += len;
  if (code === 0) break;
}
if (abcStart < 0) { console.error("没有 DoABC"); process.exit(2); }

const patched = Buffer.from(body);
let done = 0;
for (const t of targets) {
  const prefix = Buffer.from(t.hex, "hex");
  const at = patched.indexOf(prefix, abcStart);
  if (at < 0 || at + t.len > abcEnd) { console.error("!! 未命中: " + t.name); continue; }
  const second = patched.indexOf(prefix, at + 1);
  if (second >= 0 && second < abcEnd) { console.error("!! 命中多次，跳过: " + t.name); continue; }
  const body0 = Buffer.alloc(t.len, 0x02);
  body0[0] = 0x47;                  // returnvoid
  body0.copy(patched, at);
  console.log("patched " + t.name + " @ body+" + at + " (" + t.len + "B -> returnvoid)");
  done++;
}
if (!done) { console.error("没有任何方法被修改"); process.exit(3); }
if (flag === "--dry") { console.log("dry run"); process.exit(0); }

const head = Buffer.from(raw.subarray(0, 8));
head.write("CWS", 0, "latin1");
head.writeUInt32LE(8 + patched.length, 4);
const z = zlib.deflateSync(patched, { level: 9 });
fs.writeFileSync(out, Buffer.concat([head, z]));
console.log("输出 " + out + ": " + raw.length + " -> " + (8 + z.length) + " B");
