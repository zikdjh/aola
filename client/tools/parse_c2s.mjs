// parse_c2s.mjs — 解析区服 C2S 命令流。帧: [u32 len][u32 seq][payload(len-4)]，len 不含自身 4B
// 用法: node parse_c2s.mjs <file.bin> [maxMsgs] [--strs]
import fs from "node:fs";

const args = process.argv.slice(2);
const file = args[0];
const maxArg = args.find(a => /^\d+$/.test(a));
const max = Number(maxArg || 0);
const buf = fs.readFileSync(file);
console.log(`file: ${file}  ${buf.length}B`);

let p = 0, idx = 0;
const msgs = [];
while (p + 8 <= buf.length && (!max || idx < max)) {
  const len = buf.readUInt32BE(p);
  if (len < 8 || len > buf.length - p - 4) {
    console.log(`!! framing break @${p}: len=${len} (remaining ${buf.length - p})`);
    break;
  }
  const seq = buf.readUInt32BE(p + 4);
  const body = buf.subarray(p + 8, p + 4 + len);
  const ascii = body.toString("latin1");
  const strs = ascii.match(/[\x20-\x7e]{4,}/g) || [];
  msgs.push({ idx, off: p, len, seq, body, strs });
  p += 4 + len;
  idx++;
}
console.log(`messages: ${msgs.length} (consumed ${p}/${buf.length}B)`);

const show = max ? msgs.slice(0, max) : msgs;
for (const m of show) {
  const head = [...m.body.subarray(0, 28)].map(x => x.toString(16).padStart(2, "0")).join(" ");
  console.log(`#${m.idx} @${m.off} len=${m.len} seq=${m.seq} [${head}] str=[${m.strs.slice(0, 5).join("|").slice(0, 100)}]`);
}
