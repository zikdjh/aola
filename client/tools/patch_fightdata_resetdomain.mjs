// patch_fightdata_resetdomain.mjs — no-op FightData.resetDomainIfStale
// 原因: 该方法调用 InspectorErrorWatch.instance.tagDomain(...)，Ruffle 下报 Error #1069
//       (Property tagDomain not found)，异常从 StartMovie.initSendLoading 抛出 → 战斗无法开始。
//       该方法只做错误归属标记，直接 return false 安全。
// 方法体(42B):
//   getlocal0 pushscope; getlocal0 getproperty _domain; pushnull; ifeq →ret; getlex InspectorErrorWatch;
//   getproperty instance; getlocal0 getproperty _domain; pushstring "fight-stale-gen"; getlocal0
//   getproperty generation; add; callpropvoid tagDomain(2); getlocal0 pushnull setproperty _domain; pushtrue; ret;
//   pushfalse; ret
// 用法: node patch_fightdata_resetdomain.mjs <body.bin> <out.swf>
import fs from "node:fs";
import zlib from "node:zlib";

const [, , inBody, outSwf] = process.argv;
const body = fs.readFileSync(inBody);

// 特征: getlex InspectorErrorWatch(60 be 27) + getproperty instance(66 f7 20)
const NEEDLE = Buffer.from([0x60, 0xbe, 0x27, 0x66, 0xf7, 0x20]);
const hits = [];
let i = -1;
while ((i = body.indexOf(NEEDLE, i + 1)) >= 0) hits.push(i);
if (!hits.length) { console.error("特征未找到"); process.exit(1); }
const STUB = [0xd0, 0x30, 0x27, 0x48];   // getlocal0; pushscope; pushfalse; returnvalue
const CODE_LEN = 42;
let patched = 0;
for (const idx of hits) {
  // 方法头 d0 30 d0 66 位于特征前 11 字节（getlex 前的 ifeq 带 3 字节偏移）
  const codeStart = idx - 11;
  const head = body.subarray(codeStart, codeStart + 4);
  if (!(head[0] === 0xd0 && head[1] === 0x30 && head[2] === 0xd0 && head[3] === 0x66)) {
    console.log(`  [skip] @${idx} 头部不符: ${head.toString("hex")}`);
    continue;
  }
  for (let k = 0; k < CODE_LEN; k++) body[codeStart + k] = k < STUB.length ? STUB[k] : 0x02;
  patched++;
  console.log(`  [patch] resetDomainIfStale-ish @${codeStart} (${CODE_LEN}B → return false)`);
}
if (!patched) { console.error("没有可打补丁的方法"); process.exit(1); }
console.log(`patched ${patched} method(s)`);

const comp = zlib.deflateSync(body);
const len = 8 + body.length;
const headBuf = Buffer.concat([Buffer.from("CWS"), Buffer.from([18]), Buffer.alloc(4)]);
headBuf.writeUInt32LE(len, 4);
fs.writeFileSync(outSwf, Buffer.concat([headBuf, comp]));
console.log(`written ${outSwf} (${comp.length + 8}B)`);
