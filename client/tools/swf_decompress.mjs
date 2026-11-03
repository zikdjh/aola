// swf_decompress.mjs — 把 CWS/FWS/ZWS 统一输出为 FWS（abc_dump.mjs 可读）
// 用法: node swf_decompress.mjs <in.swf> <out.swf>
import fs from "node:fs";
import zlib from "node:zlib";
import lzma from "lzma";

const [, , inp, out] = process.argv;
const b = fs.readFileSync(inp);
const sig = b.subarray(0, 3).toString("latin1");
let body;
if (sig === "FWS") body = b.subarray(8);
else if (sig === "CWS") body = zlib.inflateSync(b.subarray(8));
else if (sig === "ZWS") {
  const cLen = b.readUInt32LE(8);
  const comp = b.subarray(12, 17 + cLen);   // 含 5B LZMA props（.lzma 流头）
  body = await new Promise((res, rej) => {
    lzma.decompress(comp, (out, err) => (err ? rej(err) : res(Buffer.from(out))), null);
  });
} else { console.error("unknown sig " + sig); process.exit(1); }
const head = Buffer.from(b.subarray(0, 8));
head.write("FWS", 0, "latin1");
head.writeUInt32LE(8 + body.length, 4);
fs.writeFileSync(out, Buffer.concat([head, body]));
console.log(`${sig} → FWS body=${body.length} out=${out}`);
