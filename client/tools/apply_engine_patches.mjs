// apply_engine_patches.mjs — 一键（重）打「战斗引擎 petfightnew.swf」的 ABC 补丁
//
// 为什么需要它：cache 里的 petfightnew.swf 一旦被重新下载（版本号变化、清缓存、换机），
// 我们改过的字节就没了；届时要跑一次本脚本重新打上。补丁全部是「等长替换方法体」，
// ABC 结构与偏移不变，所以对同一版本永远幂等。
//
// 当前两个补丁：
//   1) MCPetContainer::showAppearEffect  → 跳过亚比登场演出（含光启金色光柱/白羽全屏），仍回调 dispatchGotPet
//   2) BackGroundViewHandler::changeSkillBackGround → returnvoid，屏蔽专属战斗场景（技能背景/年费背景）加载
//
// 用法: node client/tools/apply_engine_patches.mjs [--dry]
// 备份: 首次运行会把原件存为 petfightnew.swf.orig；恢复原版 = 把 .orig 拷回 petfightnew.swf
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { spawnSync } from "node:child_process";
import os from "node:os";

const ROOT = path.resolve(new URL("../..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const CACHE = path.join(ROOT, "client/cache/aola.100bt.com/play/pet/petfightnew.swf");
const ORIG = CACHE + ".orig";
const TOOLS = path.join(ROOT, "client/tools");
const DRY = process.argv.includes("--dry");

if (!fs.existsSync(ORIG)) {
  if (!fs.existsSync(CACHE)) { console.error("找不到 " + CACHE); process.exit(1); }
  fs.copyFileSync(CACHE, ORIG);
  console.log("已备份原件 -> " + path.basename(ORIG));
}

// 已知的「方法体首字节序列」用于判断是否已打过补丁
const markerReturnVoid = (swf, hexPrefix) => {
  const raw = fs.readFileSync(swf);
  const sig = raw.subarray(0, 3).toString("latin1");
  const body = sig === "CWS" ? zlib.inflateSync(raw.subarray(8)) : raw.subarray(8);
  return body.includes(Buffer.from(hexPrefix, "hex"));
};
const APPEAR_PATCHED = Buffer.from("d030d0d066841d4fba1d0147", "hex");
const BG_PATCHED = Buffer.from("47", "hex");
function isPatched(swf) {
  const raw = fs.readFileSync(swf);
  const sig = raw.subarray(0, 3).toString("latin1");
  const body = sig === "CWS" ? zlib.inflateSync(raw.subarray(8)) : raw.subarray(8);
  return body.includes(APPEAR_PATCHED);
}

const TMPD = fs.mkdtempSync(path.join(os.tmpdir(), "pfpatch-"));
const tmp1 = path.join(TMPD, "stage1.swf");
const tmp2 = path.join(TMPD, "stage2.swf");
const src = isPatched(CACHE) ? ORIG : CACHE;   // 已打过就从原件重来，保证幂等
console.log("源文件: " + path.basename(src) + (DRY ? "（dry run）" : ""));

const r1 = spawnSync(process.execPath, [path.join(TOOLS, "patch_petfightnew_appear.mjs"), src, tmp1], { encoding: "utf8" });
process.stdout.write(r1.stdout || "");
if (r1.status !== 0) { process.stderr.write(r1.stderr || ""); process.exit(2); }

const r2 = spawnSync(process.execPath, [
  path.join(TOOLS, "patch_pf_methods.mjs"), tmp1, tmp2, path.join(TOOLS, "patch_targets_petfightnew.json"),
], { encoding: "utf8" });
process.stdout.write(r2.stdout || "");
if (r2.status !== 0) { process.stderr.write(r2.stderr || ""); process.exit(3); }

if (!DRY) {
  fs.copyFileSync(tmp2, CACHE);
  console.log("已写入 " + CACHE);
  fs.rmSync(TMPD, { recursive: true, force: true });
}
console.log("完成：登场演出已关闭 + 专属战斗场景加载已屏蔽");
