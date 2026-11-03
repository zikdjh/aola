// replay_tunnel.mjs — 把 tunnel_capture.bin 里的 C→S 包按原时序裸重放到区服，
// 观察服务器是否同样在 privileges 后 RST。用法：node replay_tunnel.mjs <capture.bin> <host> <port>
import fs from "node:fs";
import net from "node:net";

const [, , capFile = "docs/spike/tunnel_capture.bin", host = "123.206.106.206", port = "8003"] = process.argv;
const buf = fs.readFileSync(capFile);
let p = 0;
const packets = [];
while (p + 12 <= buf.length) {
  const dir = buf.readUInt32LE(p);
  const ms = buf.readUInt32LE(p + 4);
  const len = buf.readUInt32LE(p + 8);
  p += 12;
  packets.push({ dir, ms, buf: buf.subarray(p, p + len) });
  p += len;
}
const out = packets.filter(x => x.dir === 1);           // C→S
const t0 = out[0]?.ms ?? 0;
console.log(`replay ${out.length} C->S packets to ${host}:${port}`);

const sock = net.connect(Number(port), host, () => console.log("connected"));
sock.on("error", e => console.log("SOCK-ERR", e.message));
sock.on("close", hadErr => console.log("SOCK-CLOSE hadError=" + hadErr));
sock.setNoDelay(true);

let got = 0;
sock.on("data", chunk => {
  got += chunk.length;
  console.log(`S->C ${chunk.length}B @+${Date.now() - start}ms: ` +
    chunk.subarray(0, 60).toString("hex").replace(/(..)/g, "$1 ").trim());
});

const start = Date.now();
let sent = 0;
for (const pk of out) {
  const delay = pk.ms - t0;
  const wait = Math.max(0, delay - (Date.now() - start));
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  sock.write(pk.buf);
  sent++;
  console.log(`C->S ${pk.buf.length}B @+${Date.now() - start}ms sent (${sent}/${out.length})`);
}
console.log("all sent; listening 30s...");
await new Promise(r => setTimeout(r, 30000));
console.log(`total received: ${got}B`);
sock.destroy();
