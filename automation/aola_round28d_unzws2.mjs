import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire("file:///C:/Users/z2351/AppData/Local/Temp/aola-lzma/");
const lzma = require("lzma");
const src = "D:/temp/ZCode/aola/client/docs/spike/materialservice.swf.orig";
const raw = fs.readFileSync(src);
console.log("head24:", [...raw.subarray(0, 24)].map(x => x.toString(16).padStart(2, "0")).join(" "));
console.log("u32@4:", raw.readUInt32LE(4), "u32@13:", raw.readUInt32LE(13), "u64@13:", Number(raw.readBigUInt64LE(13)));
try {
  const d = lzma.decompress(raw.subarray(8));
  console.log("decompress(subarray8) ok:", d.length);
  fs.writeFileSync("D:/temp/ZCode/aola/automation/ms_orig_body.bin", Buffer.from(d));
  const head = Buffer.concat([Buffer.from("FWS"), Buffer.from([raw[3]]), Buffer.alloc(4)]);
  head.writeUInt32LE(8 + d.length, 4);
  fs.writeFileSync("D:/temp/ZCode/aola/automation/ms_orig_full.swf", Buffer.concat([head, Buffer.from(d)]));
  console.log("written");
} catch (e) { console.log("fail:", e.message); }
