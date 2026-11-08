// push_retry_70f.cjs — 后台重试：推送 develop/master/tag + 更新发行包资产（网络恢复后自动完成）
const { execSync } = require("child_process");
const REPO = "D:/temp/ZCode/aola";

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
function run(cmd) {
  return execSync(cmd, { cwd: REPO, stdio: ["ignore", "pipe", "pipe"], timeout: 600000 }).toString();
}

let pushed = false, uploaded = false;
for (let i = 1; i <= 60; i++) {
  try {
    if (!pushed) {
      run("git push origin develop master");
      run("git push -f origin v0.1.0-beta1");
      pushed = true;
      console.log(`[attempt ${i}] push OK`);
    }
    if (!uploaded) {
      run(`gh release upload v0.1.0-beta1 "dist/aola-launcher-pack/AolaStarLauncher-0.1.0-beta1.zip" --clobber --repo zikdjh/aola`);
      uploaded = true;
      console.log(`[attempt ${i}] release asset updated`);
    }
    if (pushed && uploaded) {
      console.log("ALL DONE");
      process.exit(0);
    }
  } catch (e) {
    console.log(`[attempt ${i}] ${new Date().toTimeString().slice(0, 8)} failed: ${String(e.message).split("\n")[0].slice(0, 90)}`);
  }
  sleep(60000);
}
console.log("GAVE UP after 60 attempts");
process.exit(1);
