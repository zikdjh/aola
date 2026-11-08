// start_gateway.mjs — 网关版启动器（包装 serve.mjs）：
//   以自动端口启动网关 → 从日志横幅解析实际端口 → 打印游戏地址 → 打开系统默认浏览器。
// 关闭本窗口（或 Ctrl+C）即停止网关。
import { spawn, exec } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const here = path.dirname(fileURLToPath(import.meta.url));
const serveJs = path.join(here, "tools", "serve.mjs");

const proc = spawn(process.execPath, [serveJs, "0"], {
  cwd: here,
  env: { ...process.env, AOLA_DROP_SERVICE: process.env.AOLA_DROP_SERVICE || "HeadFrameService" },
  stdio: ["ignore", "pipe", "pipe"],
});

let opened = false;
const banner = (url) => {
  console.log("");
  console.log("============================================================");
  console.log("   游戏地址: " + url);
  console.log("   已在默认浏览器打开。关闭本窗口即停止网关。");
  console.log("============================================================");
  console.log("");
};

proc.stdout.on("data", (d) => {
  process.stdout.write(d);
  const m = String(d).match(/P0 mirror on http:\/\/127\.0\.0\.1:(\d+)\//);
  if (m && !opened) {
    opened = true;
    const url = `http://127.0.0.1:${m[1]}/game`;
    fs.writeFileSync(path.join(here, "gateway_port.txt"), m[1]);   // 供 重打票据.cmd 读取
    banner(url);
    exec(`start "" "${url}"`, () => {});   // 打开系统默认浏览器
  }
});
proc.stderr.on("data", (d) => process.stderr.write(d));
proc.on("exit", (code) => process.exit(code ?? 0));

const killChild = () => { try { proc.kill(); } catch {} };
process.on("SIGINT", () => { killChild(); process.exit(0); });
process.on("exit", killChild);
