// build_gateway_pack.mjs — 组装「网关版」发行目录（与整合包分开发布）
// 组成：网关 serve.mjs + web（game.html/ruffle/fonts/mirror-inject/stub）+ 钉死补丁缓存四件套
//       + lowfx.json + 启动包装器（start_gateway.mjs/启动网关.cmd/重打票据.cmd/说明.txt）
// 用法: node client/tools/build_gateway_pack.mjs
// 产物: dist/aola-gateway/AolaGateway/（随后用 powersell Compress-Archive 打 zip 发资产）
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC_WEB = path.join(ROOT, "client/web");
const SRC_CACHE = path.join(ROOT, "client/cache/aola.100bt.com/play");
const SRC_ED = path.join(ROOT, "client/tools/gateway_edition");
// 组装进独立 staging（旧目录可能被已打开的默认浏览器进程持有句柄，无法删除）
const OUT = path.join(ROOT, "dist/aola-gateway/_stage/AolaGateway");

const cp = (src, dst) => {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
};
const cpr = (src, dst) => {
  fs.cpSync(src, dst, { recursive: true, force: true });
};

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

// 网关本体 + web 运行时
cp(path.join(ROOT, "client/tools/serve.mjs"), path.join(OUT, "tools/serve.mjs"));
cp(path.join(ROOT, "client/tools/gut_inline.mjs"), path.join(OUT, "tools/gut_inline.mjs"));   // serve.mjs 的本地导入
cpr(path.join(SRC_WEB, "ruffle"), path.join(OUT, "web/ruffle"));
cpr(path.join(SRC_WEB, "fonts"), path.join(OUT, "web/fonts"));
cp(path.join(SRC_WEB, "game.html"), path.join(OUT, "web/game.html"));
cp(path.join(SRC_WEB, "mirror-inject.js"), path.join(OUT, "web/mirror-inject.js"));
cpr(path.join(SRC_WEB, "stub"), path.join(OUT, "web/stub"));

// 钉死补丁缓存四件套（fresh 机器直跑必需）
cp(path.join(SRC_CACHE, "loader.swf"), path.join(OUT, "cache/aola.100bt.com/play/loader.swf"));
cp(path.join(SRC_CACHE, "user/login.swf"), path.join(OUT, "cache/aola.100bt.com/play/user/login.swf"));
cp(path.join(SRC_CACHE, "library/socketserver.swf"), path.join(OUT, "cache/aola.100bt.com/play/library/socketserver.swf"));
cp(path.join(SRC_CACHE, "library/socketserver1.swf"), path.join(OUT, "cache/aola.100bt.com/play/library/socketserver1.swf"));

// 运行配置 + 启动包装器
cp(path.join(ROOT, "client/lowfx.json"), path.join(OUT, "lowfx.json"));
cp(path.join(SRC_ED, "start_gateway.mjs"), path.join(OUT, "start_gateway.mjs"));
cp(path.join(SRC_ED, "启动网关.cmd"), path.join(OUT, "启动网关.cmd"));
cp(path.join(SRC_ED, "重打票据.cmd"), path.join(OUT, "重打票据.cmd"));
cp(path.join(SRC_ED, "round15_auto_login.mjs"), path.join(OUT, "round15_auto_login.mjs"));

let files = 0, bytes = 0;
const walk = (d) => { for (const e of fs.readdirSync(d)) { const p = path.join(d, e); const st = fs.statSync(p); if (st.isDirectory()) walk(p); else { files++; bytes += st.size; } } };
walk(OUT);
console.log(`[ok] ${OUT}`);
console.log(`     ${files} 个文件 / ${(bytes / 1048576).toFixed(1)}MB`);
