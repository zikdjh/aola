// 定位 HKService / HeadFrameService 所在模块
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
const root = "D:/temp/ZCode/aola/client/cache/aola.100bt.com/play";
const keys = ["HKService", "HeadFrameService"];
const rows = [];
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith(".swf")) {
      try {
        const raw = fs.readFileSync(p);
        let body;
        const s0 = raw.subarray(0, 3).toString("latin1");
        if (s0 === "CWS") body = zlib.inflateSync(raw.subarray(8));
        else continue;
        const s = body.toString("latin1");
        const hit = keys.filter(k => s.includes(k));
        if (hit.length) rows.push({ p: p.replace(root, ""), hit: hit.join("+"), size: body.length });
      } catch (e) {}
    }
  }
}
walk(root);
rows.forEach(r => console.log(r.p, "|", r.hit, "| body", r.size));
console.log("done", rows.length);
