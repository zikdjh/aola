// patch_itemservice_skipmissing.mjs — 让 ItemService.initItemData 跳过客户端未定义的物品
// 字节码位置（官方 materialservice ABC）:
//   105: findpropstrict Error; pushstring "没有 "; getlocal5; add; constructprop Error; throw
//   → 改为 jump →141 (hasnext2 循环尾) + nop 填充（等长 14B，栈平衡：null 分支弹出后为空）
// 输入: 已解压的 SWF body（ZWS 解压体或 CWS 解压体）
// 用法: node patch_itemservice_skipmissing.mjs <body.bin> <out.swf>
import fs from "node:fs";
import zlib from "node:zlib";

const [, , inBody, outSwf] = process.argv;
const body = fs.readFileSync(inBody);

const FROM = Buffer.from([0x5d, 0xe1, 0x0c, 0x2c, 0xf8, 0x10, 0x62, 0x05, 0xa0, 0x4a, 0xe1, 0x0c, 0x01, 0x03]);
// jump 目标 = hasnext2（循环尾）。AVM2 s24 偏移相对「下一条指令」：
// jump 位于 105，长度 4 → 下一条 109；hasnext2 位于 141 → offset = 141-109 = 32 = 0x20
const TO = Buffer.from([0x10, 0x20, 0x00, 0x00, 0x02, 0x02, 0x02, 0x02, 0x02, 0x02, 0x02, 0x02, 0x02, 0x02]);

const first = body.indexOf(FROM);
const second = body.indexOf(FROM, first + 1);
if (first < 0) { console.error("补丁特征未找到"); process.exit(1); }
// 两处同构（ItemService.initItemData / PlantItemService.initDatas），用前置指令区分：
// ItemService 用 setlocal8 → 前置 8 字节为 2a 63 08 20 14 (dup/setlocal8/pushnull/ifne)
const PREFIX = Buffer.from([0x2a, 0x63, 0x08, 0x20, 0x14]);
const isItemService = (i) => i >= 8 && body.subarray(i - 8, i - 3).equals(PREFIX);
const hits = [];
let i = -1;
while ((i = body.indexOf(FROM, i + 1)) >= 0 && i < body.length) hits.push(i);
const target = hits.find(isItemService);
if (target === undefined) { console.error("未定位到 ItemService.initItemData，候选:", hits); process.exit(1); }
TO.copy(body, target);
console.log(`patched @${target} (${FROM.length}B): throw → jump(hasnext2) + nop`);

const comp = zlib.deflateSync(body);
const len = 8 + body.length;
const head = Buffer.concat([Buffer.from("CWS"), Buffer.from([18]), Buffer.alloc(4)]);
head.writeUInt32LE(len, 4);
fs.writeFileSync(outSwf, Buffer.concat([head, comp]));
console.log(`written ${outSwf} (${comp.length + 8}B, body ${body.length}B)`);
