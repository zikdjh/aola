// 解压 petfightnew.swf（ZWS/CWS）并定位 resetDomainIfStale
import fs from "node:fs";
import zlib from "node:zlib";
import { createRequire } from "node:module";
const require = createRequire("file:///D:/temp/ZCode/aola/client/tools/");
const lzma = require("lzma");

const src = "D:/temp/ZCode/aola/client/cache/aola.100bt.com/play/pet/petfightnew.swf";
const raw = fs.readFileSync(src);
const sig = raw.subarray(0, 3).toString("latin1");
console.log("sig:", sig, "size:", raw.length, "declared:", raw.readUInt32LE(4));
let body;
if (sig === "CWS") body = zlib.inflateSync(raw.subarray(8));
else if (sig === "ZWS") {
  const props = raw.subarray(12, 17);
  const hdr = Buffer.alloc(13);
  props.copy(hdr, 0);
  hdr.writeBigUInt64LE(BigInt(raw.readUInt32LE(4) - 8), 5);
  body = Buffer.from(lzma.decompress(Buffer.concat([hdr, raw.subarray(17)])));
}
console.log("body:", body.length);
const s = body.toString("latin1");
for (const k of ["resetDomainIfStale", "FightData", "tagDomain"]) console.log(k, s.includes(k));
fs.writeFileSync("D:/temp/ZCode/aola/automation/petfightnew_body.bin", body);
console.log("saved body");
