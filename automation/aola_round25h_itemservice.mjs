// 扫描 cache 中 CWS SWF：定位 ItemService / initItemData 所在模块
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
const root = "D:/temp/ZCode/aola/client/cache/aola.100bt.com/play";
const rows = [];
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
        else continue;
        const s = body.toString("latin1");
        const has = (x) => s.includes(x);
        if (has("ItemService") || has("initItemData")) {
          rows.push({ p: p.replace(root, ""), item: has("ItemService"), init: has("initItemData"), n5609: has("5609"), zws: false });
        }
      } catch (e) {}
    }
  }
}
walk(root);
for (const r of rows) console.log(r.p, "| ItemService:", r.item, "| initItemData:", r.init, "| 5609:", r.n5609);
console.log("done", rows.length);
