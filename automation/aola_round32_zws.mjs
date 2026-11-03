// 尝试正确解析 ZWS 布局: [8B header][4B compLen][5B props][data...]
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire("file:///C:/Users/z2351/AppData/Local/Temp/aola-lzma/");
const lzma = require("lzma");

for (const src of ["D:/temp/ZCode/aola/automation/materialservice_orig.swf",
                   "D:/temp/ZCode/aola/client/docs/spike/materialservice.swf.orig"]) {
  const raw = fs.readFileSync(src);
  const total = raw.readUInt32LE(4);
  console.log("\n==", src, "size", raw.length, "declared", total);
  const props = raw.subarray(12, 17);
  console.log("props@12:", [...props].map(x => x.toString(16).padStart(2, "0")).join(" "));
  for (const dataOff of [17, 18, 21, 25, 29]) {
    for (const size of [total - 8, total, 0]) {
      const hdr = Buffer.alloc(13);
      props.copy(hdr, 0);
      hdr.writeBigUInt64LE(BigInt(size), 5);
      try {
        const d = lzma.decompress(Buffer.concat([hdr, raw.subarray(dataOff)]));
        if (d && d.length > 1000) {
          console.log(`  OK dataOff=${dataOff} size=${size} -> ${d.length}`);
          fs.writeFileSync("D:/temp/ZCode/aola/automation/ms_orig_body.bin", Buffer.from(d));
          const head = Buffer.concat([Buffer.from("FWS"), Buffer.from([raw[3]]), Buffer.alloc(4)]);
          head.writeUInt32LE(8 + d.length, 4);
          fs.writeFileSync("D:/temp/ZCode/aola/automation/ms_orig_full.swf", Buffer.concat([head, Buffer.from(d)]));
          process.exit(0);
        }
      } catch (e) {}
    }
  }
}
console.log("all failed");
