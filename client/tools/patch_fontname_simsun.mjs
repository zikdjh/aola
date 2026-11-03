// patch_fontname_simsun.mjs — 把缓存 SWF 里的设备字体名「宋体」(UTF-8, 6B) 换成 "SimSun"(6B)
// 原因：Ruffle 按字体族名匹配，系统字体族名是 SimSun，而 SWF 请求的是中文名「宋体」→
//       匹配失败 → 回退到无 CJK 的默认字体 → 中文渲染为空白。
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const root = "D:/temp/ZCode/aola/client/cache/aola.100bt.com/play";
const FROM = Buffer.from("宋体", "utf8");      // e5 ae 8b e4 bd 93
const TO = Buffer.from("SimSun", "ascii");      // 53 69 6d 53 75 6e
if (FROM.length !== TO.length) throw new Error("长度不等");
let changedFiles = 0, replaced = 0;

function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith(".swf")) {
      const raw = fs.readFileSync(p);
      const s0 = raw.subarray(0, 3).toString("latin1");
      if (s0 !== "CWS") continue;                      // ZWS 暂不处理
      const body = zlib.inflateSync(raw.subarray(8));
      const n = countOcc(body);
      if (!n) continue;
      // 备份原文件（首次）
      const bak = p + ".prefont";
      if (!fs.existsSync(bak)) fs.writeFileSync(bak, raw);
      replaceAll(body);
      const comp = zlib.deflateSync(body);
      const head = Buffer.concat([Buffer.from("CWS"), Buffer.from([raw[3]]), Buffer.alloc(4)]);
      head.writeUInt32LE(8 + body.length, 4);
      fs.writeFileSync(p, Buffer.concat([head, comp]));
      changedFiles++; replaced += n;
      console.log(`  ${p.replace(root, "")}: ${n} 处`);
    }
  }
}
function countOcc(buf) { let i = -1, c = 0; while ((i = buf.indexOf(FROM, i + 1)) >= 0) c++; return c; }
function replaceAll(buf) { let i = -1; while ((i = buf.indexOf(FROM, i + 1)) >= 0) { TO.copy(buf, i); } }

walk(root);
console.log(`files changed: ${changedFiles}, occurrences: ${replaced}`);
