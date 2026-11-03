// patch_itemservice_oninited.mjs — 修正 round22 的过度补丁
// 背景: 旧补丁把 ItemService.initItemData 整个方法体 no-op，连带删掉了末尾的
//       AbstractMaterialService.onInited() → 服务永不上报完成 → BootLoader 卡在 [2/61]。
// 修正: 方法体改为 getlocal0/pushscope → getlocal0 → callpropvoid onInited() → returnvoid
//       （仍跳过缺失物品的 throw，物品不注册，但初始化链能继续）
// 用法: node patch_itemservice_oninited.mjs <in.swf> <out.swf>
import fs from "node:fs";
import zlib from "node:zlib";

const [, , inFile, outFile] = process.argv;
const raw = fs.readFileSync(inFile);
let body, prefix, ver;
if (raw.subarray(0, 3).toString("latin1") === "CWS") { prefix = Buffer.alloc(0); ver = raw[3]; body = zlib.inflateSync(raw.subarray(8)); }
else if (raw.subarray(8, 11).toString("latin1") === "CWS") { prefix = raw.subarray(0, 8); ver = raw[11]; body = zlib.inflateSync(raw.subarray(16)); }
else { console.error("unsupported container"); process.exit(1); }

// 定位旧补丁体: d0 30 47 (getlocal0 pushscope returnvoid) + 大量 02 (nop)
let start = -1, runLen = 0;
for (let i = 0; i + 3 < body.length; i++) {
  if (body[i] === 0xd0 && body[i + 1] === 0x30 && body[i + 2] === 0x47) {
    let k = i + 3; while (body[k] === 0x02) k++;
    if (k - (i + 3) > 150) { start = i; runLen = k - i; break; }
  }
}
if (start < 0) { console.error("旧 no-op 补丁体未找到"); process.exit(1); }
console.log(`no-op body @${start} len=${runLen}`);

// onInited 的 multiname 索引（materialservice ABC 常量池）：0x8FF = 2303
const MN_ONINITED = 2303;
function u30(v) { const out = []; while (v >= 0x80) { out.push((v & 0x7f) | 0x80); v >>>= 7; } out.push(v); return out; }

const stub = [
  0xd0,                       // getlocal0
  0x30,                       // pushscope
  0xd0,                       // getlocal0
  0x46, ...u30(MN_ONINITED), 0x00,  // callpropvoid onInited (argc=0)
  0x47,                       // returnvoid
];
if (stub.length > runLen) { console.error("stub 太长"); process.exit(1); }
for (let i = 0; i < runLen; i++) body[start + i] = i < stub.length ? stub[i] : 0x02;
console.log(`stub ${stub.length}B -> 总 ${runLen}B`);

const comp = zlib.deflateSync(body);
const len = 8 + body.length;
const res = Buffer.concat([prefix, Buffer.from("CWS"), Buffer.from([ver]), u32le(len), comp]);
fs.writeFileSync(outFile, res);
console.log(`patched: ${inFile} -> ${outFile} (${raw.length} -> ${res.length}B)`);
function u32le(v) { const b = Buffer.alloc(4); b.writeUInt32LE(v >>> 0, 0); return b; }
