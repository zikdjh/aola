// find_swf_class.mjs — 在 cache 里所有 SWF（CWS/FWS/ZWS）中定位某个 ABC 字符串
// 用法: node find_swf_class.mjs <needle>
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import lzma from "lzma";

const [, , needle] = process.argv;
const NEEDLE = Buffer.from(needle, "utf8");
const CACHE = "D:/temp/ZCode/aola/client/cache";
const hits = [];

async function inflateZws(b) {
  const cLen = b.readUInt32LE(8);
  const comp = b.subarray(12, 17 + cLen);
  return await new Promise((res, rej) => {
    lzma.decompress(comp, (out, err) => (err ? rej(err) : res(Buffer.from(out))), null);
  });
}

async function scan(p) {
  try {
    const b = fs.readFileSync(p);
    const sig = b.subarray(0, 3).toString("latin1");
    let body = null;
    if (sig === "FWS") body = b.subarray(8);
    else if (sig === "CWS") body = zlib.inflateSync(b.subarray(8));
    else if (sig === "ZWS") body = await inflateZws(b);
    if (body && body.includes(NEEDLE)) hits.push(p.replace(CACHE, ""));
  } catch (e) { /* 跳过 */ }
}

const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith(".swf")) files.push(p);
  }
})(CACHE);

for (const p of files) await scan(p);
console.log(hits.join("\n") || "not found");
