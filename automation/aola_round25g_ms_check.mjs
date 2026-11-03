// 解压 materialservice.swf 供 abc_dump 检查 ItemService.initItemData 是否已 no-op
import fs from "node:fs";
import zlib from "node:zlib";
const src = "D:/temp/ZCode/aola/client/cache/aola.100bt.com/play/material/materialservice.swf";
const raw = fs.readFileSync(src);
const head = raw.subarray(0, 3).toString("latin1");
const head2 = raw.subarray(8, 11).toString("latin1");
console.log("header:", head, "| at8:", head2, "| size:", raw.length);
let body;
if (head === "CWS") body = zlib.inflateSync(raw.subarray(8));
else if (head2 === "CWS") body = zlib.inflateSync(raw.subarray(16));
else { console.log("not CWS (maybe ZWS)"); process.exit(0); }
fs.writeFileSync("D:/temp/ZCode/aola/automation/ms_check_body.bin", body);
console.log("decompressed:", body.length);
const s = body.toString("latin1");
console.log("has 5609 string:", s.includes("5609"));
