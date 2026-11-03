import fs from "node:fs";

const file = "D:/temp/ZCode/aola/client/docs/spike/tunnel_capture.bin";
const buf = fs.readFileSync(file);
let p = 0;
const records = [];
while (p + 12 <= buf.length) {
  const dir = buf.readUInt32LE(p);
  const ms = buf.readUInt32LE(p + 4);
  const len = buf.readUInt32LE(p + 8);
  p += 12;
  if (p + len > buf.length) break;
  records.push({ dir, ms, payload: buf.subarray(p, p + len) });
  p += len;
}

let sid = null;
for (const rec of records) {
  if (rec.dir !== 1) continue;
  const text = rec.payload.toString("latin1");
  const m = text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
  if (m) { sid = m[0]; break; }
}

function extractStrings(buf) {
  return (buf.toString("latin1").match(/[\x20-\x7e]{4,}/g) || []).slice(0, 8);
}

// C2S: parse framed messages with XOR decryption (from original script)
const c2s = [];
let sawMystery = false;
for (const rec of records) {
  if (rec.dir !== 1) continue;
  let chunk = rec.payload;
  while (chunk.length >= 8) {
    const len = chunk.readUInt32BE(0);
    if (len < 8 || len > chunk.length - 4) break;
    const msg = chunk.subarray(0, 4 + len);
    const seq = msg.readUInt32BE(4);
    if (!sawMystery && len === 0x35 && seq === 0x4f) sawMystery = true;
    const body = msg.subarray(8);
    if (sawMystery && seq !== 0) {
      const key = [(seq >>> 8) & 0xff, seq & 0xff, (seq >>> 24) & 0xff, (seq >>> 16) & 0xff];
      const dec = Buffer.from(body);
      for (let i = 2; i < dec.length; i++) dec[i] ^= key[(i - 2) % 4];
      c2s.push({ seq, len, dec, ms: rec.ms });
    } else {
      c2s.push({ seq, len, dec: Buffer.from(body), ms: rec.ms });
    }
    chunk = chunk.subarray(4 + len);
  }
}

// S2C: just extract readable strings from each record
const s2c = records.filter(r => r.dir === 2).map((r, i) => ({
  i, ms: r.ms, len: r.payload.length, strs: extractStrings(r.payload)
}));

console.log(JSON.stringify({ sid, total: records.length, c2s: c2s.length, s2c: s2c.length }));
console.log("\n=== C2S (client -> server) ===");
for (const [i, m] of c2s.entries()) {
  const strs = extractStrings(m.dec);
  console.log(`C#${i} t=${m.ms} len=${m.len} strs=${strs.join("|")}`);
}
console.log("\n=== S2C (server -> client) ===");
for (const r of s2c.slice(0, 100)) {
  console.log(`S#${r.i} t=${r.ms} len=${r.len} strs=${r.strs.join("|")}`);
}
if (s2c.length > 100) console.log(`... ${s2c.length - 100} more S2C records`);
