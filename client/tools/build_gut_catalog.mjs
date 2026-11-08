// build_gut_catalog.mjs — 为「按机制命名的特效/背景」预生成「保留类契约、只抽图像」的空壳
// 目的：760B 空壳会让游戏报 resourceReflectError（类找不到），进而卡住某些技能（如年费·祁的追击技能）。
// 产出: client/web/stub/gut/<rel_with_underscore>.gut.swf
// 用法: node build_gut_catalog.mjs
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = "D:/temp/ZCode/aola";
const CACHE = path.join(ROOT, "client/cache/aola.100bt.com/play");
const OUTDIR = path.join(ROOT, "client/web/stub/gut");
const TOOL = path.join(ROOT, "client/tools/gut_swf_visuals.mjs");
const DIRS = ["gqpet", "xinghuipet", "skillbackground", "petfightbackground"];

fs.mkdirSync(OUTDIR, { recursive: true });
let ok = 0, fail = 0;
for (const dir of DIRS) {
  const base = path.join(CACHE, dir);
  if (!fs.existsSync(base)) continue;
  for (const rel of walk(base)) {
    if (!rel.toLowerCase().endsWith(".swf")) continue;
    const inAbs = path.join(base, rel);
    const name = `${dir}_${rel}`.replace(/[\\/]/g, "_").replace(/\.swf$/i, "") + ".gut.swf";
    const outAbs = path.join(OUTDIR, name);
    if (fs.existsSync(outAbs) && fs.statSync(outAbs).mtimeMs >= fs.statSync(inAbs).mtimeMs) { ok++; continue; }
    const r = spawnSync(process.execPath, [TOOL, inAbs, outAbs], { encoding: "utf8" });
    if (r.status === 0) { ok++; console.log("ok   " + name + "  " + fs.statSync(outAbs).size + "B"); }
    else { fail++; console.log("FAIL " + name + "\n" + (r.stdout || "") + (r.stderr || "")); }
  }
}
console.log(`\n完成：成功 ${ok}，失败 ${fail}，输出目录 ${OUTDIR}`);

function walk(base, rel = "") {
  const out = [];
  for (const e of fs.readdirSync(path.join(base, rel), { withFileTypes: true })) {
    const r = rel ? path.join(rel, e.name) : e.name;
    if (e.isDirectory()) out.push(...walk(base, r));
    else out.push(r);
  }
  return out;
}
