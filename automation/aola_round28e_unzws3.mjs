import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire("file:///C:/Users/z2351/AppData/Local/Temp/aola-lzma/");
const lzma = require("lzma");

const src = "D:/temp/ZCode/aola/client/docs/spike/materialservice.swf.orig";
const raw = fs.readFileSync(src);
const totalUncompressed = raw.readUInt32LE(4);
console.log("declared total:", totalUncompressed);

for (const dataOff of [16, 17, 18, 19, 20, 21, 22, 23, 24]) {
  for (const bodyLen of [totalUncompressed - 8, totalUncompressed]) {
    const props = raw.subarray(8, 13);
    const hdr = Buffer.alloc(13);
    props.copy(hdr, 0);
    hdr.writeBigUInt64LE(BigInt(bodyLen), 5);
    const payload = Buffer.concat([hdr, raw.subarray(dataOff)]);
    try {
      const d = lzma.decompress(payload);
      if (d && d.length > 1000) {
        console.log(`SUCCESS dataOff=${dataOff} len=${bodyLen} -> ${d.length}`);
        fs.writeFileSync("D:/temp/ZCode/aola/automation/ms_orig_body.bin", Buffer.from(d));
        const head = Buffer.concat([Buffer.from("FWS"), Buffer.from([raw[3]]), Buffer.alloc(4)]);
        head.writeUInt32LE(8 + d.length, 4);
        fs.writeFileSync("D:/temp/ZCode/aola/automation/ms_orig_full.swf", Buffer.concat([head, Buffer.from(d)]));
        process.exit(0);
      }
    } catch (e) { /* try next */ }
  }
}
console.log("no variant worked");
