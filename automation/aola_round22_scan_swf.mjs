import fs from "node:fs";
import zlib from "node:zlib";

const root = "D:/temp/ZCode/aola/client/cache/aola.100bt.com/play";
const files = process.argv.slice(2);
if (files[0] === "--body") {
  fs.writeFileSync(files[1], uncompressed(files[2]));
  console.log("body written: " + files[1] + " <- " + files[2]);
  process.exit(0);
}
const list = files.length ? files : [
  root + "/user/login.swf",
  root + "/play.swf",
  root + "/versiondata.swf",
  root + "/loader.swf",
];

function uncompressed(path) {
  const raw = fs.readFileSync(path);
  if (raw.subarray(8, 11).toString("latin1") === "CWS") {
    return zlib.inflateSync(raw.subarray(16));
  }
  if (raw.subarray(0, 3).toString("latin1") === "CWS") {
    return zlib.inflateSync(raw.subarray(8));
  }
  if (raw.subarray(8, 11).toString("latin1") === "FWS") return raw.subarray(16);
  if (raw.subarray(0, 3).toString("latin1") === "FWS") return raw;
  throw new Error("not SWF: " + path);
}

const patterns = [
  "playFiles",
  "yunying",
  "loginpetfightnew",
  "petdataservice",
  "common_res_progress",
  "baseservice",
  "isWebLogin",
];

for (const path of list) {
  const body = uncompressed(path);
  console.log("\n=== " + path + " === " + body.length + "B");
  for (const needle of patterns) {
    let pos = 0;
    let count = 0;
    while (count < 5) {
      const at = body.indexOf(needle, pos);
      if (at < 0) break;
      const from = Math.max(0, at - 160);
      const to = Math.min(body.length, at + needle.length + 320);
      const text = body.subarray(from, to).toString("latin1")
        .replace(/[^\x20-\x7e]/g, " ").replace(/\s+/g, " ").trim();
      console.log(`  ${needle} @${at}: ${text}`);
      pos = at + needle.length;
      count++;
    }
    if (count === 0) console.log(`  ${needle}: (none)`);
  }
}
