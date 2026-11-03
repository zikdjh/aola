// 查看 no-op 补丁点上下文
import fs from "node:fs";
const b = fs.readFileSync("D:/temp/ZCode/aola/automation/ms_check_body.bin");
const off = 23222, len = 179469;
const abc = b.subarray(off, off + len);
const i = abc.indexOf(Buffer.from([0xd0, 0x30, 0x47, 0x02, 0x02, 0x02]));
function hex(buf, s, n) { return [...buf.subarray(s, s + n)].map(x => x.toString(16).padStart(2, "0")).join(" "); }
console.log("patch at", i, "(relative to ABC)");
console.log("before 24B:", hex(abc, Math.max(0, i - 24), 24));
console.log("at     40B:", hex(abc, i, 40));
// 统计后续 0x02 长度
let k = i + 3; while (abc[k] === 0x02) k++;
console.log("nop run after d0 30 47:", k - (i + 3));
