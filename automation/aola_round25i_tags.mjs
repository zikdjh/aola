// 解析 ms_check_body.bin 的 SWF tag 列表，确认 DoABC 位置
import fs from "node:fs";
const b = fs.readFileSync("D:/temp/ZCode/aola/automation/ms_check_body.bin");
console.log("len", b.length, "sig:", b.subarray(0, 3).toString("latin1"), "ver:", b[3], "declared:", b.readUInt32LE(4));
// 跳过 rect（body 从 rect 开始）
let p = 0;
const nbits = b[p] >> 3;
p += 1 + Math.ceil(nbits * 4 / 8) + 4; // rect字节 + frameRate(2) + frameCount(2)
console.log("tags start:", p);
let tags = [];
for (let i = 0; i < 400 && p + 2 <= b.length; i++) {
  const c16 = b[p] | (b[p + 1] << 8); p += 2;
  let len = c16 & 0x3f;
  if (len === 0x3f) { len = b.readUInt32LE(p); p += 4; }
  const type = c16 >> 6;
  tags.push({ type, len, off: p });
  if (type === 0) break;
  p += len;
}
console.log("tags:", tags.map(t => `${t.type}(${t.len})`).join(" "));
const doabc = tags.filter(t => t.type === 82);
console.log("DoABC:", JSON.stringify(doabc));
