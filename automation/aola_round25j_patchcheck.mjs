// 检查 materialservice 的 ABC 里 initItemData 是否已被 no-op（d0 30 47 02...）
import fs from "node:fs";
const b = fs.readFileSync("D:/temp/ZCode/aola/automation/ms_check_body.bin");
const off = 23222, len = 179469;
const abc = b.subarray(off, off + len);
const s = abc.toString("latin1");
console.log("ABC len:", abc.length);
console.log("contains 'initItemData':", s.includes("initItemData"));
console.log("contains '5609':", s.includes("5609"));
console.log("contains '没有':", s.includes("没有"));
// no-op 特征
const pat = Buffer.from([0xd0, 0x30, 0x47, 0x02, 0x02, 0x02]);
const idx = abc.indexOf(pat);
console.log("no-op pattern (d0 30 47 02 02 02) at:", idx);
// 统计 d0 30 47 出现次数
let cnt = 0, i = 0;
const p2 = Buffer.from([0xd0, 0x30, 0x47]);
while ((i = abc.indexOf(p2, i)) >= 0) { cnt++; i++; }
console.log("getlocal0+pushscope+returnvoid occurrences:", cnt);
