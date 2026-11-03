// tunnel 抓包摘要：方向/大小/时间序列
import fs from "node:fs";
const f = "D:/temp/ZCode/aola/client/docs/spike/tunnel_capture.bin";
if (!fs.existsSync(f)) { console.log("no capture"); process.exit(0); }
const st = fs.statSync(f);
console.log("capture size:", st.size, "mtime:", st.mtime.toISOString());
const buf = fs.readFileSync(f);
let off = 0, recs = [];
while (off + 12 <= buf.length) {
  const dir = buf.readUInt32LE(off);
  const ms = buf.readUInt32LE(off + 4);
  const len = buf.readUInt32LE(off + 8);
  if (off + 12 + len > buf.length) break;
  recs.push({ dir, ms, len, off });
  off += 12 + len;
}
console.log("records:", recs.length, "| C2S:", recs.filter(r => r.dir === 1).length, "| S2C:", recs.filter(r => r.dir === 2).length);
console.log("C2S sizes:", recs.filter(r => r.dir === 1).map(r => r.len).join(","));
console.log("S2C sizes:", recs.filter(r => r.dir === 2).map(r => r.len).slice(0, 40).join(","));
console.log("first 12 records:", recs.slice(0, 12).map(r => `${r.dir === 1 ? "C2S" : "S2C"}:${r.len}`).join(" "));
