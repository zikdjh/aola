// 定位 resetDomainIfStale / InspecterErrorWatch 所在模块
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
const root = "D:/temp/ZCode/aola/client/cache/aola.100bt.com/play";
const keys = ["resetDomainIfStale", "tagDomain", "InspectorErrorWatch"];
const rows = [];
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith(".swf")) {
      try {
        const raw = fs.readFileSync(p);
        if (raw.subarray(0, 3).toString("latin1") !== "CWS") continue;
        const body = zlib.inflateSync(raw.subarray(8));
        const s = body.toString("latin1");
        const hit = keys.filter(k => s.includes(k));
        if (hit.length) rows.push({ p: p.replace(root, ""), hit: hit.join("+"), body });
      } catch (e) {}
    }
  }
}
walk(root);
for (const r of rows) {
  console.log(r.p, "|", r.hit, "| body", r.body.length);
  // 保存解压体供反汇编
  const out = "D:/temp/ZCode/aola/automation/" + r.p.replace(/[\\/]/g, "_").replace(".swf", "_body.bin");
  fs.writeFileSync(out, r.body);
  console.log("  saved:", out);
}
