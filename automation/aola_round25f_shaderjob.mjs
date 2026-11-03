// 扫描 cache 中所有 SWF（CWS 可解压），统计包含 ShaderJob 的文件
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const root = "D:/temp/ZCode/aola/client/cache/aola.100bt.com/play";
const hits = [];
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith(".swf")) {
      try {
        const raw = fs.readFileSync(p);
        let body;
        if (raw.subarray(0, 3).toString("latin1") === "CWS") body = zlib.inflateSync(raw.subarray(8));
        else if (raw.subarray(8, 11).toString("latin1") === "CWS") body = zlib.inflateSync(raw.subarray(16));
        else { continue; } // ZWS 跳过
        const s = body.toString("latin1");
        if (s.includes("ShaderJob")) hits.push({ p: p.replace(root, ""), n: (s.match(/ShaderJob/g) || []).length });
      } catch (e) {}
    }
  }
}
walk(root);
console.log("CWS files containing ShaderJob:", hits.length);
for (const h of hits) console.log(h.p, "x" + h.n);
