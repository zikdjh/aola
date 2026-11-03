import fs from "node:fs";
import zlib from "node:zlib";

const [,, inFile, outFile] = process.argv;
const raw = fs.readFileSync(inFile);
const sig = raw.subarray(0, 3).toString("latin1");
const uncompLen = raw.readUInt32LE(4);
console.log(`sig=${sig} compressed=${raw.length} uncomp=${uncompLen}`);
let body;
if (sig === "ZWS") {
  // ZWS: LZMA. 5 bytes props at offset 12, 8 bytes size, then data.
  // But some ZWS files use zlib after byte 12 (props=5D 00 00 00 -> raw deflate).
  const props = raw.subarray(12, 17);
  if (props[0] === 0x5d && props[1] === 0 && props[2] === 0 && props[3] === 0) {
    body = zlib.inflateRawSync(raw.subarray(17));
  } else {
    body = zlib.inflateSync(raw.subarray(12));
  }
} else if (sig === "CWS") {
  body = zlib.inflateSync(raw.subarray(8));
} else if (sig === "FWS") {
  body = raw.subarray(8);
} else {
  throw new Error("unknown sig: " + sig);
}
console.log(`decompressed: ${body.length}B (expect ${uncompLen})`);
fs.writeFileSync(outFile, body);
