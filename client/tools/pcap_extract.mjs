// pcap_extract.mjs — 解析 pcapng，提取到区服端口(8000-8009)的 TCP 流并按方向重组
// 用法: node pcap_extract.mjs <file.pcapng> [outPrefix]
import fs from "node:fs";

const [, , file = "docs/spike/zone_real.pcapng", prefix = "docs/spike/real"] = process.argv;
const buf = fs.readFileSync(file);

// ---- pcapng block walk ----
let p = 0;
const packets = [];
while (p + 12 <= buf.length) {
  const type = buf.readUInt32LE(p);
  const totalLen = buf.readUInt32LE(p + 4);
  if (totalLen < 12 || p + totalLen > buf.length) break;
  if (type === 0x00000006) { // Enhanced Packet Block
    const capLen = buf.readUInt32LE(p + 20);
    const data = buf.subarray(p + 28, p + 28 + capLen);
    packets.push(data);
  }
  p += totalLen;
}
console.log("packets:", packets.length);

// ---- TCP stream reassembly ----
// Ethernet(14) / IPv4 / TCP
const streams = new Map(); // key -> {c2s: Buffer[], s2c: Buffer[], cIsClient}
function parseTcp(raw) {
  if (raw.length < 54) return null;
  if (raw[12] !== 0x08 || raw[13] !== 0x00) return null; // ETH_IPV4
  const ihl = (raw[14] & 0x0f) * 4;
  const proto = raw[14 + 9];
  if (proto !== 6) return null;
  const src = raw.subarray(14 + 12, 14 + 16).join(".");
  const dst = raw.subarray(14 + 16, 14 + 20).join(".");
  const off = 14 + ihl;
  const sport = raw.readUInt16BE(off), dport = raw.readUInt16BE(off + 2);
  const doff = (raw[off + 12] >> 4) * 4;
  const payload = raw.subarray(off + doff);
  const seq = raw.readUInt32BE(off + 4);
  const flags = raw[off + 13];
  return { src, dst, sport, dport, payload, seq, flags };
}

for (const raw of packets) {
  const t = parseTcp(raw);
  if (!t) continue;
  const zonePorts = [8000,8001,8002,8003,8004,8005,8006,8007,8008,8009];
  let key, dir;
  if (zonePorts.includes(t.dport)) { key = `out-${t.src}:${t.sport}-${t.dst}:${t.dport}`; dir = "c2s"; }
  else if (zonePorts.includes(t.sport)) { key = `out-${t.dst}:${t.dport}-${t.src}:${t.sport}`; dir = "s2c"; }
  else continue;
  if (t.payload.length === 0) continue;
  if (!streams.has(key)) streams.set(key, { c2s: [], s2c: [] });
  streams.get(key)[dir].push({ seq: t.seq, buf: t.payload });
}

console.log("zone streams:", streams.size);
for (const [key, st] of streams) {
  const cTotal = st.c2s.reduce((a, b) => a + b.buf.length, 0);
  const sTotal = st.s2c.reduce((a, b) => a + b.buf.length, 0);
  console.log(`\n=== ${key}  C->S ${cTotal}B (${st.c2s.length} seg)  S->C ${sTotal}B (${st.s2c.length} seg) ===`);
  // 按 seq 排序重组
  const reasm = (arr) => {
    arr.sort((a, b) => a.seq - b.seq);
    let out = Buffer.alloc(0), expect = arr.length ? arr[0].seq : 0;
    for (const seg of arr) {
      if (seg.seq === expect) { out = Buffer.concat([out, seg.buf]); expect += seg.buf.length; }
      else if (seg.seq > expect) { out = Buffer.concat([out, Buffer.from(`[GAP+${seg.seq - expect}]`), seg.buf]); expect = seg.seq + seg.buf.length; }
      // overlap ignored
    }
    return out;
  };
  const cData = reasm(st.c2s), sData = reasm(st.s2c);
  fs.writeFileSync(`${prefix}_c2s.bin`, cData);
  fs.writeFileSync(`${prefix}_s2c.bin`, sData);
  console.log("C->S head:", cData.subarray(0, 80).toString("hex").replace(/(..)/g, "$1 "));
  console.log("S->C head:", sData.subarray(0, 80).toString("hex").replace(/(..)/g, "$1 "));
  // 找可读片段
  const frags = (sData.toString("latin1").match(/[\x20-\x7e]{6,}/g) || []).slice(0, 6);
  console.log("S->C readable:", frags.join(" | ").slice(0, 200));
}
