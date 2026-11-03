// replay_staged.mjs — 分阶段重放：登录 → 神秘包 → 逐条命令，定位 RST 触发点
// 用法：node replay_staged.mjs <capture.bin> <host> <port> <freshSid>
import fs from "node:fs";
import net from "node:net";

const [, , capFile = "docs/spike/tunnel_capture.bin", host = "115.159.104.40", port = "8008", freshSid = ""] = process.argv;
const buf = fs.readFileSync(capFile);
let p = 0;
const packets = [];
while (p + 12 <= buf.length) {
  const dir = buf.readUInt32LE(p);
  const ms = buf.readUInt32LE(p + 4);
  const len = buf.readUInt32LE(p + 8);
  p += 12;
  packets.push({ dir, buf: buf.subarray(p, p + len) });
  p += len;
}
const out = packets.filter(x => x.dir === 1);
// out[0] = 登录包（85B），其后为神秘包 + 命令批
const login = Buffer.from(out[0].buf);
if (freshSid) {
  const sidBytes = Buffer.from(freshSid, "utf8");
  sidBytes.copy(login, login.length - 36);   // 末 36 字节 = UUID
}
const rest = out.slice(1);
console.log(`login ${login.length}B, rest ${rest.length} packets, sid=${freshSid || "(captured)"}`);

const sock = net.connect(Number(port), host, () => console.log("connected @+" + (Date.now() - start)));
sock.on("error", e => console.log("SOCK-ERR", e.message));
sock.on("close", h => console.log("SOCK-CLOSE hadError=" + h));
let got = 0, respCount = 0;
sock.on("data", chunk => {
  got += chunk.length; respCount++;
  console.log(`  S->C #${respCount} ${chunk.length}B @+${Date.now() - start}ms: ` +
    chunk.subarray(0, 56).toString("hex").replace(/(..)/g, "$1 ").trim());
});

const start = Date.now();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

sock.write(login);
console.log(`[phase1] login sent @+${Date.now() - start}ms — waiting 6s`);
await sleep(6000);

// 神秘包 = rest 中第一个（每局同位置的 4f 特征包）
const mystery = rest[0];
console.log(`[phase2] mystery packet ${mystery.buf.length}B: ` +
  mystery.buf.subarray(0, 24).toString("hex").replace(/(..)/g, "$1 "));
sock.write(mystery.buf);
await sleep(4000);

console.log(`[phase3] sending ${rest.length - 1} commands @450ms`);
for (let i = 1; i < rest.length; i++) {
  if (sock.destroyed) { console.log("socket dead, stop at", i); break; }
  sock.write(rest[i].buf);
  await sleep(450);
}
console.log("draining 15s...");
await sleep(15000);
console.log(`total received ${got}B in ${respCount} chunks`);
sock.destroy();
process.exit(0);
