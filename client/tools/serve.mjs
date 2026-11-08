// serve.mjs - P0 镜像代理服务器（Node ESM，无外部依赖）
// 路由：
//   /game                    -> web/game.html
//   /ruffle/<file>           -> web/ruffle/<file>（静态）
//   /mirror/<host>/<path>    -> cache/<host>/<path>，未命中则回源 https://<host>/<path> 并落盘
//   /status                  -> 计数器 JSON
// 特性：剥离 ~<版本> 缓存击穿后缀；统一 CORS 头；并发回源去重。
import http from "node:http";
import crypto from "node:crypto";
import net from "node:net";
import { createReadStream, existsSync, statSync, mkdirSync, writeFileSync, appendFileSync, rmSync, readFileSync, readdirSync } from "node:fs";
import { extname, resolve, sep, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
// 运行时「保留类契约」空壳处理（Round 48/49）
import { gutSwfBuffer, swfBodyOf } from "./gut_inline.mjs";
import { spawnSync } from "node:child_process";
import zlib from "node:zlib";

// ==================== WebSocket <-> TCP 隧道（Ruffle socketProxy 用） ====================
// Ruffle 在 SWF 调 flash.net.Socket.connect(host, port) 且 socketProxy 匹配时，
// 会连 proxyUrl 并在 WebSocket 二进制帧上原样透传 TCP 字节流。
const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

function wsEncodeFrame(opcode, payload) {
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  header[0] = 0x80 | opcode;               // FIN + opcode
  return Buffer.concat([header, payload]);
}

// ============ DefenseMsgSeq 隧道侧加密 ============
// 客户端 SeqLoader 空壳（Ruffle ShaderJob 缺口）→ num 恒 0 → seq 恒 0、方法名明文 → 服务器 RST。
// 真实客户端公式（对两天完整会话逐字节验证，含 40+ 溢出点）：
//   next = 7*seq + 102 + hash31(sessionId) % 569；若 ≥ 2^31-1 → % 1047483647 + 911
//   种子 79（神秘包）；XOR 密钥 = [b1,b0,b3,b2]（seq 四字节 16 位半字交换序），payload[2..]
function dsHash31(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h;
}
function dsNext(s, h) {
  let t = 7 * s + 102 + (((h % 569) + 569) % 569);
  if (t >= 2147483647) t = (t % 1047483647) + 911;
  return t >>> 0;
}
const DS_DEBUG = process.env.AOLA_DS_DEBUG === "1" || process.env.AOLA_DS_DEBUG === "true";

function makeDsProcessor(tcp, label, tap) {
  const st = { buf: Buffer.alloc(0), sawMystery: false, counter: 0, h: 0 };
  return function processC2S(chunk) {
    st.buf = Buffer.concat([st.buf, chunk]);
    while (true) {
      if (st.buf.length < 8) break;
      const len = st.buf.readUInt32BE(0);
      if (len < 8 || len > 0x100000) {          // 非消息帧（策略请求等）→ 整段透传
        tcp.write(st.buf); st.buf = Buffer.alloc(0); break;
      }
      if (st.buf.length < 4 + len) break;       // 半包等待
      const msg = Buffer.from(st.buf.subarray(0, 4 + len));
      st.buf = st.buf.subarray(4 + len);
      const seq = msg.readUInt32BE(4);
      if (!st.sawMystery) {
        // 登录包：顺带提取 sid；神秘包 (len=0x35, seq=0x4f)：置种子
        if (seq === 0 && !st.h) {
          const m = msg.toString("latin1").match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
          if (m) { st.h = dsHash31(m[0]); if (DS_DEBUG) console.log(`[ds ${label}] sid=${m[0]} hash=${st.h}`); }
        }
        if (len === 0x35 && seq === 0x4f) {
          st.sawMystery = true; st.counter = 79;
          if (DS_DEBUG) console.log(`[ds ${label}] mystery seed=79`);
        }
        tap("C->S", msg);
        tcp.write(msg);
        continue;
      }
      if (seq !== 0) { tap("C->S", msg); tcp.write(msg); continue; }   // 已有 seq → 透传
      st.counter = dsNext(st.counter, st.h);
      msg.writeUInt32BE(st.counter, 4);
      const kb = [(st.counter >>> 8) & 0xff, st.counter & 0xff, (st.counter >>> 24) & 0xff, (st.counter >>> 16) & 0xff];
      for (let i = 10; i < msg.length; i++) msg[i] ^= kb[(i - 10) % 4];
      if (DS_DEBUG) console.log(`[ds ${label}] seq=${st.counter} key=${kb.map(x => x.toString(16).padStart(2, "0")).join(" ")}`);
      tap("C->S", msg);
      tcp.write(msg);
    }
  };
}

function setupWsTunnel(req, socket, head) {
  const key = req.headers["sec-websocket-key"];
  if (!key) { socket.destroy(); return; }
  const accept = crypto.createHash("sha1").update(key + WS_GUID).digest("base64");
  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
    "Upgrade: websocket\r\n" +
    "Connection: Upgrade\r\n" +
    `Sec-WebSocket-Accept: ${accept}\r\n\r\n`);
  if (head && head.length) { /* 客户端不会带扩展数据 */ }

  const m = req.url.match(/^\/ws2tcp\/([^/]+)\/(\d+)$/);
  if (!m) { socket.destroy(); return; }
  const host = decodeURIComponent(m[1]);
  const port = Number(m[2]);
  console.log(`[ws${new Date().toISOString().slice(11, 23)}] tunnel open -> ${host}:${port}`);
  // 字节级诊断开关（P0-2b 协议调试）：AOLA_TUNNEL_DEBUG=1 时双向 hexdump + 全量抓包落盘
  const tcapPath = join(root, "docs", "spike", "tunnel_capture.bin");
  try { rmSync(tcapPath, { force: true }); } catch (e) {}
  const tdbg = process.env.AOLA_TUNNEL_DEBUG === "1" || process.env.AOLA_TUNNEL_DEBUG === "true";
  const tap = (dir, buf) => {
    if (!tdbg) return;
    console.log(`[ws${new Date().toISOString().slice(11, 23)}] ${dir} ${buf.length}B: ` +
      buf.subarray(0, 96).toString("hex").replace(/(..)/g, "$1 ").trim());
    // 全量二进制抓包（重放用）：[u32 dir(1=C->S,2=S->C)][u32 ms][u32 len][payload]
    try {
      const rec = Buffer.alloc(12);
      rec.writeUInt32LE(dir === "C->S" ? 1 : 2, 0);
      rec.writeUInt32LE(Date.now() % 0xffffffff, 4);
      rec.writeUInt32LE(buf.length, 8);
      appendFileSync(tcapPath, Buffer.concat([rec, buf]));
    } catch (e) {}
  };

  const tcp = net.connect(port, host, () => console.log(`[ws  ] tcp connected ${host}:${port}`));
  const processC2S = makeDsProcessor(tcp, `${host}:${port}`, tap);
  tcp.on("error", (e) => {
    console.log(`[ws  ] tcp error ${host}:${port} ${e.message}`);
    try { socket.end(wsEncodeFrame(0x8, Buffer.alloc(0))); } catch (e2) {}
  });

  let wsBuf = Buffer.alloc(0);
  socket.on("data", (chunk) => {
    wsBuf = Buffer.concat([wsBuf, chunk]);
    while (true) {
      if (wsBuf.length < 2) return;
      const b0 = wsBuf[0], b1 = wsBuf[1];
      const opcode = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f, off = 2;
      if (len === 126) { if (wsBuf.length < 4) return; len = wsBuf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (wsBuf.length < 10) return; len = Number(wsBuf.readBigUInt64BE(2)); off = 10; }
      const maskLen = masked ? 4 : 0;
      if (wsBuf.length < off + maskLen + len) return;
      const mask = masked ? wsBuf.subarray(off, off + 4) : null;
      const payload = Buffer.from(wsBuf.subarray(off + maskLen, off + maskLen + len));
      if (mask) { for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4]; }
      wsBuf = wsBuf.subarray(off + maskLen + len);
      if (opcode === 0x1 || opcode === 0x2) {       // 文本/二进制 → TCP
        processC2S(payload);                        // DefenseMsgSeq 隧道侧加密（明文进，密文出）
      } else if (opcode === 0x8) {                  // close
        if (tdbg) console.log(`[ws  ] ws close (len=${len})`);
        try { socket.end(wsEncodeFrame(0x8, Buffer.alloc(0))); } catch (e2) {}
        try { tcp.end(); } catch (e) {}
      } else if (opcode === 0x9) {                  // ping → pong
        try { socket.write(wsEncodeFrame(0xA, payload)); } catch (e) {}
      }
    }
  });
  socket.on("close", () => { try { tcp.destroy(); } catch (e) {} });
  socket.on("error", () => { try { tcp.destroy(); } catch (e) {} });

  tcp.on("data", (chunk) => {
    tap("S->C", chunk);
    try { socket.write(wsEncodeFrame(0x2, chunk)); } catch (e) {}
  });
  tcp.on("close", () => {
    try { socket.end(wsEncodeFrame(0x8, Buffer.alloc(0))); } catch (e) {}
  });
}

const root = fileURLToPath(new URL("..", import.meta.url));
const webDir = join(root, "web");
const cacheDir = join(root, "cache");
const port = Number(process.argv[2] || 8700);
mkdirSync(cacheDir, { recursive: true });

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".wasm": "application/wasm",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".xml": "application/xml",
  ".txt": "text/plain",
  ".swf": "application/x-shockwave-flash",
  ".zip": "application/zip",
};

const stats = { requests: 0, mirrorHits: 0, mirrorFetch: 0, misses: 0,
  // 低配开关命中统计（round44）：便于「这次战斗到底有没有换壳」一眼确认，
  // 不用翻整屏网关日志。GET /status 直接返回。
  stubs: { effect: 0, bg: 0, appearBundle: 0, startmv: 0, extra: 0, battlefx: 0 }, stubLog: [],
  // 最近 120 个 SWF 请求（路径 + 实际发出体积 + 是否换壳）：用来在没有截图的情况下，
  // 从「这一场战斗到底加载了哪些资源」反推某个特效来自哪个 SWF。
  recentSwf: [] };
function noteSwf(urlPath, size, stub) {
  stats.recentSwf.push({ p: String(urlPath).split("?")[0], size, stub: !!stub });
  if (stats.recentSwf.length > 120) stats.recentSwf.shift();
}
function noteStub(kind, urlPath) {
  stats.stubs[kind] = (stats.stubs[kind] || 0) + 1;
  stats.stubLog.push({ kind, path: String(urlPath).split("?")[0], t: new Date().toTimeString().slice(0, 8) });
  if (stats.stubLog.length > 60) stats.stubLog.shift();
}
const inflight = new Map(); // 并发回源去重: key -> Promise<{status, body, ct}>
// 上游 Cookie 罐（host -> Map(name -> Set-Cookie 原文)）——浏览器拒收官方 Domain 的
// Set-Cookie（.100bt.com 跨域），导致验证码/登录各落在不同匿名上游会话。
// 门面在 node 侧维持会话，验证码与登录共享同一 JSESSIONID。
const upstreamJars = new Map();
function jarFor(host) {
  if (!upstreamJars.has(host)) upstreamJars.set(host, new Map());
  return upstreamJars.get(host);
}
function jarHeader(host) {
  const jar = upstreamJars.get(host);
  if (!jar || !jar.size) return null;
  return [...jar.entries()].map(([k, v]) => k + "=" + v).join("; ");
}

// ============ 登录验证码桥 ============
// SWF 的登录 POST 若命中腾讯 WAF 滑块验证，响应是 TCaptcha 挑战页。
// SWF 无法执行它 → 由 facade 暂存挑战参数，game.html 轮询领取并在顶层窗口
// 完成滑块 → POST /WafCaptcha → 浏览器重放原登录请求（Cookie 一致）→ 成功。
const captchaState = {
  pending: null,   // { appId, seqid, payload, ts }
  done: 0
};
const loginCmds = [];   // 待下发给 game.html 的登录指令（Cookie 注入等）

// 导入已完成的登录 Cookie（由外部登录流程 POST 进来）
// body: [{"name":"game_auth_sid","value":"..."}, ...]
function importLoginCookies(bodyText) {
  try {
    const arr = JSON.parse(bodyText);
    if (Array.isArray(arr) && arr.length) {
      for (const c of arr) {
        // 服务器 Set-Cookie 下发的组合 Cookie 是全量百分号编码（gameId%3D2%2C...）。
        // SWF 按字面 , / = 切分解析，编码形态解析不出 token，会把整串当 token 发
        // newLogin → invalid。这里解码为字面分隔符格式（保留字面奥拉星——
        // checkHasLoginCookie 校验官方格式；转发上游时 mirror() 会逐对百分号编码兜底 WAF）。
        if (c.name === "game_auth_sid" && /%3D/i.test(c.value) && c.value.indexOf(",") < 0) {
          c.value = decodeURIComponent(c.value);
          console.log("[login] game_auth_sid normalized (server-encoded -> literal format)");
        }
      }
      loginCmds.push({ cmd: "setCookies", cookies: arr });
      return { ok: true, count: arr.length };
    }
  } catch (e) {}
  return { ok: false };
}

// 剥离缓存击穿后缀: foo~261031.swf -> foo.swf
function cacheKey(p) {
  return p.replace(/~\d+(?=\.[a-zA-Z0-9]+$)/, "");
}

function localPathFor(host, urlPath) {
  // Round 70：本地缓存文件名**保留版本后缀**（foo~261107.swf 原样落盘）。
  // 官方每周五更新会给同名资源换新版本号（start.xml 的 <f n v> 表），旧逻辑剥掉后缀
  // 会让新版本 URL 永远命中旧字节 —— 整个内容树冻结在首次拉取态（落后 N 个版本）。
  // 版本变 → 文件名变 → 必然 cache miss → 重新拉取。上游请求仍走剥后缀的 cacheKey
  // （官方服务器弱校验、忽略版本后缀，已实测 start.swf 与 start~2107300001.swf 字节一致）。
  // Round 70d：**补丁站点例外** —— 世界装配阶段请求的是版本化 URL
  // （socketserver1~2026052196362970.swf / socketserver~20150702.swf），按版本落盘会从
  // 上游拉到未打补丁的字节 → 服务器握手即 RST（进不去世界）。补丁是钉死版本的本地字节，
  // 这些站点的任何版本号请求一律折叠到同一份本地补丁文件（PATCH_PROTECTED，见下方声明）。
  const q = urlPath.split("?")[0];
  const stripped = cacheKey(q);
  const rel = decodeURIComponent(stripped).replace(/^\/+/, "");
  const key = PATCH_PROTECTED.has(rel) ? stripped : q;
  const r2 = decodeURIComponent(key).replace(/^\/+/, "");
  if (!r2 || r2.includes("..")) return null;
  if (!/\.[a-zA-Z0-9]+$/.test(r2)) return null;   // 必须带文件名（防目录/空路径）
  return join(cacheDir, host, r2.replace(/:/g, "_")); // Windows 文件名不允许冒号
}

// Round 70：版本清单/引导文件「网络优先」白名单（按剥后缀后的相对路径匹配）。
// start.xml 是**增量版本清单**（根节点 <v>=数据版本，<f n v> 表=本轮变更的资源版本号），
// 它新了游戏才会去请求新版本模块 URL（配合 localPathFor 按版本落盘，每周五的更新自动流入）。
// 其余是启动期小配置。⚠️ loader.swf 刻意不在名单：缓存里是我们注入过 CJK 设备字体的
// 补丁版（71016B ≠ 上游 69938B），回源会覆盖掉字体补丁。
const FRESH_PATHS_RE =
  /^(?:play\/)?(?:start\.xml|config\.xml|iconfig\.xml|sceneitem\.xml|sceneres\.xml|difference\.xml|versiondata\.swf|start\.swf|loader_res\.swf)$/i;

// Round 70b：裸名请求的 TTL 回源校验。
// 官方客户端模型 = 裸 URL + 服务器弱校验返回当前版（11-08 包实机日志：几十个模块全是
// 无版本后缀的裸名 GET）。带 ~v 的请求已由「按版本落盘」保证新鲜，但裸名请求会被
// cache-first 钉死在旧字节 —— 补一层：缓存文件 mtime 超过 TTL 就本请求网络优先
// （失败回退缓存），且每个网关进程对同一文件只回源一次（会话内后续仍走缓存）。
const CACHE_TTL_MS = Math.max(0, Number(process.env.AOLA_CACHE_TTL_HOURS ?? 6)) * 3600 * 1000;
const revalidMemo = new Set();   // 本次网关生命周期内已 TTL 回源过的 relKey

// Round 70e：**字节钉死名单**收敛为「上游不再更新 + 本地必须带补丁」的四个文件。
// materialservice / interfaces / materialdata / petfightnew 全部**解除钉死**：
// 官方最新组合（管家同款字节）本身自洽 —— Round 23-24 时代的 skip 补丁针对的是
// 旧客户端/旧数据的错配，最新客户端 + 最新 materialdata 下账号数据全部有定义。
// 且这些文件已随版本更新（materialdata/interfaces/petfightnew 都在本周 delta 里），
// 旧钉死字节反而是错配源（ToteValueSeason #1065 / 旧战斗引擎）。
// ⚠️ 前提：上游请求保留版本号（见 remotePath 注释），版本化 URL 才能拿到真当前版。
const PATCH_PROTECTED = new Set([
  "play/loader.swf",                 // CJK 设备字体注入版（71016B ≠ 上游 69938B；上游数周未变）
  "play/user/login.swf",             // 登录模块补丁（上游未变）
  "play/library/socketserver.swf",   // patch_seq4（上游 5 月后未变，补丁是否仍必需未验证——保守保留）
  "play/library/socketserver1.swf",  // patch_seq4
]);

// 文本资产网关改写：官方域名引用 -> 绝对同源 facade（SWF 自己就会发出可代理的请求）。
// 必须用绝对 URL：loader 内的 getDomain/域名比较逻辑对根相对路径会静默失败。
const ORIGIN = `http://127.0.0.1:${port}`;
function transformText(buf, host, kind, options = {}) {
  let s = buf.toString("utf8");
  const before = s;
  // difference.xml 的 isWebLogin=true 会让 login 模块选 playFiles1（缺 yunying 运营模块）
  // → 世界装配的活动链停摆（2/61 卡死）。AOLA_LOCAL_FLOW=1 时翻转为 false 走本地清单
  // （与启动器一致，但需要 LocalStore 里已有账号，Cookie 登录路径会失效）。
  if (!options.keepWebLogin) {
    s = s.replace(/<isWebLogin>true<\/isWebLogin>/i, "<isWebLogin>false</isWebLogin>");
  }
  // AOLA_SOCKET_DEBUG=1：打开 config.xml <socket><debug>，让 socketserver 打印带标签的收发/分发明细
  // （默认关闭，仅在排查世界装配卡点时开启；高频 trace 会拖慢页面）
  if (options.socketDebug) {
    s = s.replace(/(<socket>\s*<debug>)false(<\/debug>)/i, "$1true$2");
  }
  // AOLA_DROP_SERVICE=ItemService,XXX：从 config.xml <service> 列表摘除指定服务，
  // 用于判定「世界装配卡在第 N 项」到底是哪个服务 init 未完成。
  if (options.dropServices && options.dropServices.length) {
    s = s.replace(/<service>([\s\S]*?)<\/service>/i, (all, inner) => {
      const names = inner.split(",").map(x => x.trim()).filter(Boolean)
        .filter(n => !options.dropServices.includes(n));
      return "<service>" + names.join(",") + "</service>";
    });
    console.log(`[rw  ] dropped services: ${options.dropServices.join(",")}`);
  }
  s = s.replace(/(https?:)?\/\/([a-z0-9.-]+\.100bt\.com)(:\d+)?/gi, ORIGIN + "/mirror/$2");
  s = s.replace(/(https?:)?\/\/([a-z0-9.-]+\.a0bi\.com)(:\d+)?/gi, ORIGIN + "/mirror/$2");
  s = s.replace(/(https?:)?\/\/183\.61\.254\.215(:\d+)?/gi, ORIGIN + "/mirror/183.61.254.215_8050");
  if (host && (kind === "html" || kind === "css")) {
    // 根相对改写只对 HTML/CSS 生效——对 JS 源码做此类替换会破坏代码
    const mHost = ORIGIN + "/mirror/" + host;
    if (kind === "html") {
      s = s.replace(/\s(src|href|action|poster)=(["'])\/(?!\/|mirror\/)([^"']*)\2/gi,
        ` $1=$2` + mHost + `/$3$2`);
      s = s.replace(/(location(?:\.href)?\s*=\s*["'])\/(?!\/|mirror\/)([^"']*)(["'])/gi,
        `$1` + mHost + `/$2$3`);
      // 中和 document.domain（facade 源下会抛 SecurityError，破坏登录页初始化）
      s = s.replace(/document\.domain\s*=\s*["'][^"']+["']\s*;?/g, "/*document.domain neutralized*/");
    }
    if (kind === "css") {
      s = s.replace(/url\(\s*(["']?)\/(?!\/|mirror\/)([^)'"]+)\)/gi,
        `url($1` + mHost + `/$2)`);
    }
  }
  return before === s ? null : Buffer.from(s, "utf8");
}

const TEXT_TYPES = /xml|html|text\/plain|javascript/i;

// ============ 特效替换开关（round35 归因 / round40 低配特效模式） ============
// 命中规则（大小写不敏感）的 GET 资源改发最小真实特效 SWF（缓存里的 effect0.swf，760B ZWS）：
// 特效不显示，但加载/播放/完成生命周期完整，战斗逻辑与资源链不受影响。
//
// 通用开关 AOLA_EFFECT_STUB —— 逗号分隔的匹配项：
//   普通项 = urlPath 子串匹配；"re:" 前缀 = 正则匹配（用于“同时含 A 与 B”这类条件）
//   例：AOLA_EFFECT_STUB="fightasyncres/effect,crieffect_normal,revert"
//
// 命名开关（=1 启用；可组合，与 AOLA_EFFECT_STUB 合并生效）：
//   AOLA_NO_ENTER_EFFECT=1    入场/登场特效（光启+星辉：*appearmv / *appeareffect / *appearbg）
//   AOLA_NO_BUFF_EFFECT=1     光启 buff/机制特效（gqpet/<机制>/effect/*、backgroundup/*）
//   AOLA_NO_XINGHUI_EFFECT=1  星辉机制特效（xinghuipet/<机制>/{effect,movie,status}/*）
//   AOLA_NO_PET_EFFECT=1      上面三个全开（光启+星辉的入场与 buff/机制特效）
// 说明：规则特意避开 UI 资源（gqpet/skill/*、xinghuipet/skill|soul/*），否则会打坏技能列表面板。
// 资源规律（取自 petfightnew.swf 的路径构造）：光启 = gqpet/<机制>/effect/<名>effect_<亚比id>.swf，
// 入场类资源名含 appear（如 gqpet/armorburst/effect/armorburstappeareffect.swf、
// xinghuipet/shenling/effect/xinghuishenlingappearmv）。
// ============ 低配开关的「运行时配置」：client/lowfx.json（Round 45） ============
// 目的：把原来只能靠环境变量/启动器选的开关，变成游戏页上的按钮，用户随时勾选。
// 规则：lowfx.json 里出现的键**覆盖**环境变量；没出现的键仍按环境变量（启动器）走。
// 文件改动秒级生效（按 mtime 缓存），但客户端已经加载过的 SWF 会被 Ruffle 缓存，
// 所以页面上的「应用」按钮会顺带 location.reload()。
const FX_FILE = join(root, "lowfx.json");
// Round 46：按「特效类型」拆开，一个类型一个开关（页面按钮一一对应）
//   enterGq    光启进场特效（gqpet 的 *appear* 特效 URL + 登场包里的 GQAppearMovie）
//   enterXh    星辉进场特效（xinghuipet 的 *appear* 特效 URL + 登场包里的 XinghuiAppearMovie）
//   （旧键 enterScope/fxEnterUrls 仍兼容：仅当文件里没写新键时参与推导，见 normalizeFlags）
//   startmv     战斗开场「亚比登场」演出：off / 1 / skip
//   buffGq      光启机制/buff（gqpet/<机制>/effect/、backgroundup/）
//   buffXh      星辉机制（xinghuipet/<机制>/{effect,movie,status}/）
//   fxEffect    战斗内通用技能特效（fightasyncres/effect/effect<ID>）
//   fxCrit      暴击特写（fightasyncres/crieffect_normal*）
//   petBackground 专属战斗背景：off / 1 / common（common=换成通用背景）
//   bgSkill     专属技能背景（skillbackground/）
//   bgLoading   战斗页面加载动画（fightasyncres/waitbgmovie）
//   bgSwapMovie 背景切换特效（backgroundmovie/）
//   resPkg      光启/星辉资源包抽图（gqresource/xhresource）
const FX_BOOL_KEYS = ["enterGq", "enterXh", "fxEnterUrls", "buffGq", "buffXh", "fxEffect", "fxCrit", "bgSkill", "bgLoading", "bgSwapMovie", "resPkg", "gutBundles"];
const FX_ENUM_KEYS = ["enterScope", "petBackground", "startmv"];
const FX_KEYS = [...FX_BOOL_KEYS, ...FX_ENUM_KEYS];
const FX_LOCKED_KEYS = ["revert", "killbig"];   // 回调型资源，永远不换壳（页面里显示为「锁定」）
let fxCache = { mtimeMs: -1, cfg: {} };
function readFxFile() {
  try {
    const st = statSync(FX_FILE);
    if (st.mtimeMs === fxCache.mtimeMs) return fxCache.cfg;
    const raw = JSON.parse(readFileSync(FX_FILE, "utf8"));
    const cfg = {};
    for (const k of FX_KEYS) if (k in raw) cfg[k] = raw[k];
    // 兼容 Round 45 的旧键（用户可能还留着旧文件）
    if (!("enterScope" in cfg) && ("enterEffect" in raw)) cfg.enterScope = raw.enterEffect ? (raw.appearMv === false ? "off" : "all") : "off";
    if (!("fxEnterUrls" in cfg) && ("enterEffect" in raw)) cfg.fxEnterUrls = !!raw.enterEffect;
    if (!("buffGq" in cfg) && ("buffEffect" in raw)) cfg.buffGq = !!raw.buffEffect;
    if (!("buffXh" in cfg) && ("xinghuiEffect" in raw)) cfg.buffXh = !!raw.xinghuiEffect;
    if (!("fxEffect" in cfg) && ("battleFx" in raw)) cfg.fxEffect = !!raw.battleFx;
    if (!("fxCrit" in cfg) && ("battleFx" in raw)) cfg.fxCrit = !!raw.battleFx;
    if (!("bgSkill" in cfg) && ("petBackground" in raw)) cfg.bgSkill = !!raw.petBackground && raw.petBackground !== "off";
    if (!("bgLoading" in cfg) && ("bgAnim" in raw)) cfg.bgLoading = !!raw.bgAnim;
    if (!("bgSwapMovie" in cfg) && ("bgAnim" in raw)) cfg.bgSwapMovie = !!raw.bgAnim;
    fxCache = { mtimeMs: st.mtimeMs, cfg };
    console.log(`[lowfx] 载入 lowfx.json: ${JSON.stringify(cfg)}`);
    return cfg;
  } catch (e) {
    if (e && e.code === "ENOENT") {
      if (fxCache.mtimeMs !== -1) { fxCache = { mtimeMs: -1, cfg: {} }; console.log("[lowfx] lowfx.json 已删除，回退到环境变量"); }
      return fxCache.cfg;
    }
    // JSON 损坏时保留上一次可用配置，避免页面按钮写坏文件导致行为跳变
    console.warn(`[lowfx] lowfx.json 解析失败（保留旧配置）：${e && e.message}`);
    return fxCache.cfg;
  }
}
function writeFxFile(cfg) {
  writeFileSync(FX_FILE, JSON.stringify(cfg, null, 2) + "\n", "utf8");
  fxCache = { mtimeMs: statSync(FX_FILE).mtimeMs, cfg };
}
const onEnv = (v) => ["1", "true", "yes"].includes(String(v || "").trim().toLowerCase());
// 环境变量 → 新粒度的默认值（启动器不需要改，仍可用）
function envFlags() {
  const all = onEnv(process.env.AOLA_NO_PET_EFFECT);
  const enterEnv = onEnv(process.env.AOLA_NO_ENTER_EFFECT) || all;
  const appearMvOff = ["0", "false", "off"].includes(String(process.env.AOLA_NO_APPEAR_MV || "").trim().toLowerCase());
  const bgRaw = String(process.env.AOLA_NO_PET_BACKGROUND || "").trim().toLowerCase();
  const smvRaw = String(process.env.AOLA_NO_STARTMV || "").trim().toLowerCase();
  const battleFx = onEnv(process.env.AOLA_NO_BATTLE_FX);
  const bgAnim = onEnv(process.env.AOLA_NO_BG_ANIM);
  return {
    enterScope: enterEnv ? (appearMvOff ? "off" : "all") : "off",
    fxEnterUrls: enterEnv,
    // 新键只在环境变量显式要求时写入；否则留空，让 normalizeFlags 从文件旧键推导
    ...(enterEnv ? { enterGq: true, enterXh: true } : {}),
    startmv: ["1", "skip"].includes(smvRaw) ? smvRaw : "",
    buffGq: onEnv(process.env.AOLA_NO_BUFF_EFFECT) || all,
    buffXh: onEnv(process.env.AOLA_NO_XINGHUI_EFFECT) || all,
    fxEffect: battleFx,
    fxCrit: battleFx,
    petBackground: ["1", "common"].includes(bgRaw) ? bgRaw : "",
    bgSkill: ["1", "common"].includes(bgRaw),
    bgLoading: bgAnim,
    bgSwapMovie: bgAnim,
    resPkg: onEnv(process.env.AOLA_NO_RES_PKG),
    gutBundles: onEnv(process.env.AOLA_GUT_BUNDLES),
  };
}
function normalizeFlags(raw) {
  const out = { ...raw };
  // Round 59：进场特效拆成光启/星辉两个独立开关（enterGq/enterXh，同时管 URL appear 特效与登场包）。
  // 旧键 enterScope/fxEnterUrls 只在未显式写新键时参与推导（兼容旧 lowfx.json / 环境变量 / 旧版迁移字段）。
  if (!("enterGq" in out) || !("enterXh" in out)) {
    const legacyEnter = out.enterScope === "gq" || out.enterScope === "all" || !!out.fxEnterUrls;
    if (!("enterGq" in out)) out.enterGq = legacyEnter;
    if (!("enterXh" in out)) out.enterXh = legacyEnter;
  }
  out.enterScope = ["off", "gq", "all"].includes(out.enterScope) ? out.enterScope : (out.enterScope ? "all" : "off");
  out.petBackground = ["1", "common"].includes(out.petBackground) ? out.petBackground : "";
  out.startmv = ["1", "skip"].includes(out.startmv) ? out.startmv : "";
  for (const k of FX_BOOL_KEYS) out[k] = !!out[k];
  return out;
}
function fxFlags() {
  return normalizeFlags({ ...envFlags(), ...(readFxFile() || {}) });
}
function buildStubRules(flags) {
  const list = [...(process.env.AOLA_EFFECT_STUB || "").split(",")];
  // Round 59：appear 特效按光启/星辉分流（由 enterGq/enterXh 独立控制）；
  // buffGq/buffXh 的机制目录规则用负向前瞻排除 *appear*，避免与进场开关打架。
  if (flags.enterGq) list.push("re:/gqpet/.+appear");
  if (flags.enterXh) list.push("re:/xinghuipet/.+appear");
  if (flags.buffGq) list.push("re:/gqpet/[^/]+/effect/(?!.*appear)", "re:/gqpet/[^/]+/backgroundup/");
  if (flags.buffXh) list.push("re:/xinghuipet/[^/]+/(effect|movie|status)/(?!.*appear)");
  return list.map(s => s.trim()).filter(Boolean).map(s => s.toLowerCase().startsWith("re:")
    ? { re: new RegExp(s.slice(3), "i") }
    : { sub: s.toLowerCase() });
}
let rulesCache = { key: "", flags: null, rules: [] };
function currentRules() {
  const flags = fxFlags();
  const key = JSON.stringify(flags) + "|" + (process.env.AOLA_EFFECT_STUB || "");
  if (key !== rulesCache.key) {
    rulesCache = { key, flags, rules: buildStubRules(flags) };
    console.log(`[lowfx] 生效开关: ${JSON.stringify(flags)}`);
  }
  return rulesCache;
}
// 匹配判定：原始 urlPath 与 cacheKey() 归一化路径（抹掉「名字~版本号」）都要比——
// 游戏把缓存击穿后缀插在扩展名之前，归一化后自定义规则里写全名也能命中。
const isStubbedEffect = (u, rules) => {
  const p0 = String(u), p1 = cacheKey(p0);
  return rules.some(p => (p.re ? p.re.test(p0) || p.re.test(p1)
    : p0.toLowerCase().includes(p.sub) || p1.toLowerCase().includes(p.sub)));
};
// 替换体：优先用缓存里现成的最小真实特效 effect0.swf（760B ZWS，加载/播放/完成生命周期与真特效一致；缺失时退回最小 FWS）。
const stubSwfBuf = (() => {
  try {
    const real = join(cacheDir, "aola.100bt.com", "play", "pet", "fightasyncres", "effect", "effect0.swf");
    if (existsSync(real) && statSync(real).isFile()) return readFileSync(real);
  } catch {}
  // 最小合法 SWF：FWS v6 / 400x400 舞台 / 24fps / 0 帧 / 仅 End tag（Loader 可正常 load+addChild）
  const bits = [];
  const push = (v, n) => { for (let i = n - 1; i >= 0; i--) bits.push((v >> i) & 1); };
  push(15, 5); push(0, 15); push(400, 15); push(0, 15); push(400, 15);   // RECT
  while (bits.length % 8) bits.push(0);
  const rect = Buffer.alloc(bits.length / 8);
  bits.forEach((b, i) => { if (b) rect[i >> 3] |= (0x80 >> (i & 7)); });
  const body = Buffer.concat([rect, Buffer.from([0, 24, 0, 0, 0, 0])]);  // 帧率24 + 帧数0 + End
  const out = Buffer.alloc(8 + body.length);
  out.write("FWS", 0); out.writeUInt8(6, 3); out.writeUInt32LE(out.length, 4);
  body.copy(out, 8);
  return out;
})();
 
// ============ 专属战斗背景 / 背景加载动画开关（round41/42，round44 拆分回退） ============
// 背景族资源：
//   1) 专属战斗背景 petfightbackground/<名字>（starshinecity、thinktoweroffire、hexagrampalace…），
//      服务端按精灵/场景下发；通用基础背景是 petfightbackground/common.swf（503KB）。
//   2) 专属技能背景 skillbackground/*（年费/专属，322–694KB）。
//   3) 背景加载/等待动画 pet/fightasyncres/waitbgmovie/movie.swf（83KB）—— 「战斗页面的加载动画」。
//   4) 背景切换特效 backgroundmovie/backgroundmovie（BackGroundEffectMovie 使用）。
//
// round44 回退：用户要求**保留战斗页面的加载动画**，所以把 3)/4) 从 AOLA_NO_PET_BACKGROUND 里摘出，
// 本开关只负责 1)/2)（专属战斗场景 + 专属技能背景）。3)/4) 需要时单独用 AOLA_NO_BG_ANIM=1。
//
// AOLA_NO_PET_BACKGROUND=1      → 专属背景 + 专属技能背景换发 760B 空壳
// AOLA_NO_PET_BACKGROUND=common → 专属背景换发 common.swf；专属技能背景仍空壳
// AOLA_NO_BG_ANIM=1             → 再把 waitbgmovie（加载动画）/ backgroundmovie（切换特效）换空壳
// 不设置 = 完全关闭（原样回源）
// 注意：这些 SWF 内隐含类名（如 mmo.petfight.StarShineCity），替换后 getDefinitionByName 可能报 #1065；
// 特效类同款处理已在 Round 35 验收（战斗可继续），观感仍需实战确认。
let commonBgCache;
function commonBgBuf() {                                       // 通用背景替换体（=common 时用）
   if (commonBgCache !== undefined) return commonBgCache;
   try {
     const p = join(cacheDir, "aola.100bt.com", "play", "petfightbackground", "common.swf");
     if (existsSync(p) && statSync(p).isFile()) { commonBgCache = readFileSync(p); return commonBgCache; }
   } catch {}
   console.warn("[stub] petfightbackground/common.swf 缺失 → 专属背景改用 760B 空壳");
   commonBgCache = null;
   return commonBgCache;
}
// Round 60：星域背景主图 —— 从 common.swf 提取最大的 JPEG（星战空间战斗背景，960×560 星域+行星）。
// skillbackground 抽空时把全屏形状原位替换成它：专属宠进场换上来的背景层显示固定星域图，
// 而不是空层露出白色舞台（Round 60 白屏修复）。类契约保留，祁的技能不受影响。
let screenBitmapJpeg = null;
try {
  const p = join(cacheDir, "aola.100bt.com", "play", "petfightbackground", "common.swf");
  if (existsSync(p)) {
    const body = await swfBodyOf(readFileSync(p));
    let tp = Math.ceil((5 + 4 * (body[0] >> 3)) / 8) + 4, best = null;
    while (tp + 2 <= body.length) {
      const h = body.readUInt16LE(tp); tp += 2;
      const code = h >> 6; let len = h & 0x3f;
      if (len === 0x3f) { len = body.readUInt32LE(tp); tp += 4; }
      const t = body.subarray(tp, tp + len); tp += len;
      let j = null, id = 0;
      if (code === 21 && t.length > 4) { id = t.readUInt16LE(0); j = t.subarray(2); }
      else if ((code === 35 || code === 90) && t.length > 8) {
        id = t.readUInt16LE(0);
        const jl = t.readUInt32LE(2);
        j = t.subarray(6, 6 + jl);   // JPEG3/4：跳过 alpha 偏移字段，取纯 JFIF
      }
      if (j && j.length > 4 && j[0] === 0xff && j[1] === 0xd8) { if (!best || j.length > best.j.length) best = { id, j }; }
      if (code === 0) break;
    }
    if (best) { screenBitmapJpeg = best.j; console.log(`[stub] 星域背景主图: common id${best.id} ${best.j.length}B（skillbackground 抽空铺底用）`); }
  }
} catch (e) {
  console.warn("[stub] 星域背景主图提取失败（skillbackground 将退回纯抽空）: " + (e && e.message));
}
// ============ Round 64：petmovie 分片位图降采样（背包切宠卡顿的真正解药） ============
// 归因（Round 64 CDP Tracing + 受控实验）：精灵大立绘 = peticon/movie/type0/petmovie<ID>/
// petmovie<ID>_{0,1,2,3}.swf 四片，每片 1.5-1.7MB，内部 **100% 是 DefineBitsLossless2 位图**
// （12-13 张 525x475 format=3 调色板位图）。Ruffle 解码一片要 3.4-4.9s，四片合计 15s+。
// 这就是「点精灵卡片后大图要等 1-2 秒」的物理原因（不是网络、不是脚本、不是 GPU 填充率）。
// 做法：位图等比降采样到 PETMOVIE_SCALE（默认 0.5），SWF 结构/类/时间轴完全不变。
// 实测：1.62MB→0.52MB（-68%），四片 15348ms→5069ms（3.0x）。
// 开关：默认开启；AOLA_NO_PETMOVIE_DOWNSAMPLE=1 关闭；AOLA_PETMOVIE_SCALE 调比例（默认 0.7）
// ⚠️ Round 67 修过一次崩溃：曾漏做「调色板位图行 4 字节对齐」的写出，
//   导致 Ruffle `panicked at render/src/utils.rs:339 index out of bounds` in
//   decode_define_bits_lossless（触发点 PetMovie5999_0）。修好后：
//   · 源读取步长用 ceil(w/4)*4、输出写出步长用 ceil(nw/4)*4（零填充）
//   · 并对每个位图做长度自检，不符则整文件放弃降采样、原样放行
//   · 全量 176 分片 / 2217 张位图逐张验证长度严格匹配
const PETMOVIE_RE = /\/peticon\/movie\/type0\/petmovie(\d+)\/petmovie\1_([0-3])(?:~\d+)?\.swf/i;
const PETMOVIE_SCALE = (() => {
  const v = Number(process.env.AOLA_PETMOVIE_SCALE || 0.7);
  return Number.isFinite(v) && v > 0.1 && v <= 1 ? v : 0.7;
})();
const PETMOVIE_DS_ON = process.env.AOLA_NO_PETMOVIE_DOWNSAMPLE !== "1" && PETMOVIE_SCALE < 1;
const petmovieCache = new Map();   // key = cacheKey → 降采样后的 Buffer（带 LRU 上限）
const PETMOVIE_CACHE_MAX = 120;    // ~120 × 0.5MB ≈ 60MB 上限

// 内联实现（零依赖）：解析 FWS 的 DefineBitsLossless2，位图盒式平均降采样后重新 zlib 压缩
function nearestPalette(palette, ctSize, r, g, b, a) {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < ctSize; i++) {
    const p = i * 4;
    const dr = palette[p] - r, dg = palette[p + 1] - g, db = palette[p + 2] - b, da = palette[p + 3] - a;
    const dd = dr * dr * 0.30 + dg * dg * 0.59 + db * db * 0.11 + da * da * 1.5;
    if (dd < bestD) { bestD = dd; best = i; if (dd === 0) break; }
  }
  return best;
}
function pmDownsampleSwf(buf, factor) {
  if (buf.length < 8 || buf.toString("ascii", 0, 3) !== "FWS") return null;
  const nBits = buf[8] >> 3;
  const hdrEnd = 8 + Math.ceil((5 + nBits * 4) / 8) + 4;
  const swfHeader = buf.subarray(8, hdrEnd);   // RECT + frameRate + frameCount —— 必须原样保留
  let off = hdrEnd;
  const pieces = [];
  let nBitmaps = 0, origPx = 0, newPx = 0, changed = false;
  while (off < buf.length - 1) {
    const start = off;
    const tagAndLen = buf.readUInt16LE(off);
    const code = tagAndLen >> 6;
    let len = tagAndLen & 0x3F;
    off += 2;
    if (len === 0x3F) { if (off + 4 > buf.length) break; len = buf.readUInt32LE(off); off += 4; }
    if (code === 0) { pieces.push(buf.subarray(start, off)); break; }
    if (off + len > buf.length) break;
    const end = off + len;
    if (code !== 36 || len < 8) { pieces.push(buf.subarray(start, end)); off = end; continue; }
    const d = buf.subarray(off, end);
    const charId = d.readUInt16LE(0), format = d[2], w = d.readUInt16LE(3), h = d.readUInt16LE(5);
    origPx += w * h;
    if (format !== 3 || w === 0 || h === 0) { pieces.push(buf.subarray(start, end)); off = end; continue; }
    let zdata = d.subarray(7);
    let ctSizeByte = -1;
    if (zdata[0] !== 0x78 && zdata[0] !== 0x9C && zdata[0] !== 0xDA) { ctSizeByte = zdata[0]; zdata = zdata.subarray(1); }
    let raw;
    try { raw = zlib.inflateSync(zdata); } catch { pieces.push(buf.subarray(start, end)); off = end; continue; }
    const ctSize = (ctSizeByte >= 0 ? ctSizeByte : raw[0]) + 1;
    const palBytes = ctSize * 4;
    // ⚠️ 自检护栏（Round 67）：源数据长度必须**严格等于**「调色板 + 4 字节对齐行 × 高」。
    // 只要有一个位图对不上，就放弃整个文件的降采样、原样放行 ——
    // 宁可慢一点，也不能给 Ruffle 喂会越界 panic 的数据（render/src/utils.rs:339）。
    const sRow = Math.ceil(w / 4) * 4;
    if (raw.length !== palBytes + sRow * h) return null;
    const palette = raw.subarray(0, palBytes), indices = raw.subarray(palBytes);
    const nw = Math.max(1, Math.round(w * factor)), nh = Math.max(1, Math.round(h * factor));
    const nRow = Math.ceil(nw / 4) * 4;
    const newIdx = Buffer.alloc(nRow * nh);
    for (let y = 0; y < nh; y++) {
      const y0 = Math.floor(y * h / nh), y1 = Math.max(y0 + 1, Math.floor((y + 1) * h / nh));
      for (let x = 0; x < nw; x++) {
        const x0 = Math.floor(x * w / nw), x1 = Math.max(x0 + 1, Math.floor((x + 1) * w / nw));
        let sr = 0, sg = 0, sb = 0, sa = 0, cnt = 0;
        for (let sy = y0; sy < y1; sy++) {
          const row = sy * sRow;
          for (let sx = x0; sx < x1; sx++) {
            const pi = indices[row + sx] * 4;
            const a = palette[pi + 3];
            sr += palette[pi] * a; sg += palette[pi + 1] * a; sb += palette[pi + 2] * a;
            sa += a; cnt++;
          }
        }
        newIdx[y * nRow + x] = sa > 0 ? nearestPalette(palette, ctSize, sr / sa, sg / sa, sb / sa, sa / cnt) : 0;
      }
    }
    const newZ = zlib.deflateSync(Buffer.concat([palette, newIdx]), { level: 6 });
    const prefix = ctSizeByte >= 0 ? Buffer.from([ctSizeByte]) : Buffer.alloc(0);
    const body = Buffer.alloc(7 + prefix.length + newZ.length);
    body.writeUInt16LE(charId, 0); body[2] = format;
    body.writeUInt16LE(nw, 3); body.writeUInt16LE(nh, 5);
    prefix.copy(body, 7); newZ.copy(body, 7 + prefix.length);
    const th = Buffer.alloc(6);
    th.writeUInt16LE((36 << 6) | 0x3F, 0); th.writeUInt32LE(body.length, 2);
    pieces.push(Buffer.concat([th, body]));
    nBitmaps++; newPx += nw * nh; changed = true;
    off = end;
  }
  if (!changed) return null;
  const bodyBuf = Buffer.concat(pieces);
  const out = Buffer.alloc(8 + swfHeader.length + bodyBuf.length);
  out.write("FWS", 0, "ascii"); out[3] = buf[3];
  out.writeUInt32LE(8 + swfHeader.length + bodyBuf.length, 4);
  swfHeader.copy(out, 8);
  bodyBuf.copy(out, 8 + swfHeader.length);
  return { buf: out, nBitmaps, origPx, newPx };
}

// ============ 机制特效/背景的「gut 目录」（Round 48） ============
// 起因：gqpet 机制特效、skillbackground 这类 SWF 里有游戏按类名取的符号
// （如 mmo.gqpet.wanyuzhichao.effect.Pet6000Stand_2）；换 760B 空壳会报
// resourceReflectError，进而让「年费·祁」的追击技能卡住。
// 做法：预生成「保留类契约、只抽图像」的空壳（client/web/stub/gut/），命中就换发它；
// 没有对应空壳时**保持原样**（宁可留着特效，也不能缺类卡死）。
const GUT_DIR = join(webDir, "stub", "gut");
const gutMap = new Map();
try {
  for (const f of readdirSync(GUT_DIR)) {
    if (!f.endsWith(".gut.swf")) continue;
    gutMap.set(f.slice(0, -".gut.swf".length), readFileSync(join(GUT_DIR, f)));
  }
  if (gutMap.size) console.log("[gut] 载入 " + gutMap.size + " 个空壳");
} catch {}
const inlineGutCache = new Map();   // 现场 gut 结果缓存（key = cacheKey）
const gutKeyOf = (u) => cacheKey(String(u)).replace(/^\/play\//, "").replace(/\.swf$/i, "").replace(/\//g, "_");
const gutFor = (u) => gutMap.get(gutKeyOf(u)) || null;
function familyStubWanted(u, flags) {
  const p1 = cacheKey(String(u));
  if (/\/gqpet\//i.test(p1)) return flags.buffGq && !/\/gqpet\/(skill|soul)\//i.test(p1);
  if (/\/xinghuipet\//i.test(p1)) return flags.buffXh && !/\/xinghuipet\/(skill|soul)\//i.test(p1);
  // 大招特写「图像分片」（alleffect/allgqkillbig<id>_n、xinghuikillbig<id>/..._n）：
  // 纯位图切片（无 DoABC/SymbolClass），是光启/星辉 buff 金环的真正来源（Round 53 归因）。
  // Round 44d 只锁死了 760B 换壳（缺类卡死）；gut 抽图保留加载/回调生命周期，安全。
  if (/\/gqkillbigmovie\/alleffect\//i.test(p1)) return flags.buffGq;
  if (/\/xinghuikillbigmovie\/xinghuikillbig\d+\//i.test(p1)) return flags.buffXh;
  // 专属技能背景：抽图必须同时去掉 SetBackgroundColor，否则整层变纯色（白）
  if (/\/skillbackground\//i.test(p1)) return flags.bgSkill ? "bg" : false;
  return false;
}

// 运行时判定（Round 45/46）：flags 来自 lowfx.json / 环境变量；四类背景各自独立开关
function matchBgSwap(u, flags) {
   if (flags.petBackground && /\/petfightbackground\/(?!common)/i.test(u))
     return { body: commonBgBuf() };   // 一律换通用星域背景（抽空/760B 都会白屏或缺类）
   // skillbackground（年费/专属技能背景）：抽空会露出白底、760B 会缺类卡技能，故保持原样
   if (flags.bgLoading && /\/fightasyncres\/waitbgmovie\//i.test(u)) return { body: null };
   if (flags.bgSwapMovie && /\/backgroundmovie\//i.test(u)) return { body: null };
   return null;
}

// ============ 亚比登场/开场演出开关（round43） ============
// pet/petfightnew_startmv.swf（ZWS 1.30MB）就是战斗开场那段「亚比登场」演出：
// 主战斗模块 petfightnew.swf 内有专用方法 playStartMv()，加载本文件后用
// getDefinitionByName("mmo.petfightnew.movie.StartMovie") 取符号类
// （该类 extends MovieClip，实例引用子对象 mcMyPlayer/mcVsPlayer/spPlayer，
//  构造函数里 addFrameScript(25, stop)）。
// 因此**不能**换 760B 空壳：类名消失会抛 #1065，子对象为 null 会抛 #1009。
// 这里改发 client/web/stub/petfightnew_startmv.gut.swf ——
// 由 client/tools/gut_swf_visuals.mjs 生成：ABC / SymbolClass / 132 个 DefineSprite
// 与「每个 sprite 的帧数序列」逐字节（逐个）保持原样，只把 47 个位图换成 1x1
// 全透明、119 个矢量形状换成空形状、7 个文本清掉初始内容（1.51MB → 16.6KB）。
// 效果：演出照样播完、画面是空的——既不破坏类契约，也不再解码/绘制大图。
//
// AOLA_NO_STARTMV=1     → 换发空壳资源（默认：安全）
// AOLA_NO_STARTMV=skip  → 换发 760B effect0.swf（更彻底，但有 #1065/#1009 风险，仅作对照）
// 不设置 = 关闭（原样回源）
// Round 45：模式改由 fxFlags().startmv 决定（lowfx.json 可覆盖环境变量）。
// 关键坑（round43 实测两次踩）：游戏请求资源时把缓存击穿后缀插在**扩展名之前**——
// petfightnew_startmv~261029175809261.swf，而日志打印走 cacheKey() 会把它抹掉（显示成 .swf），
// 于是「正则结尾锚定 .swf」永远匹配不上、请求直接落磁盘缓存。规则必须容忍 (?:~\d+)。
const STARTMV_RE = /\/pet\/petfightnew_startmv(?:~\d+)?\.swf/i;
const startmvGutBuf = (() => {
   try {
     const p = join(webDir, "stub", "petfightnew_startmv.gut.swf");
     if (existsSync(p) && statSync(p).isFile()) return readFileSync(p);
   } catch {}
   console.warn("[stub] web/stub/petfightnew_startmv.gut.swf 缺失 → 用 client/tools/gut_swf_visuals.mjs 生成；本次回退 760B 空壳");
   return null;
})();

// ============ 光启/星辉「入场动画」资源包（round44） ============
// 归因（一手证据）：`pet/petfightnew_res.swf`（ZWS 2.10MB）是**战斗入场/换宠/死亡动作包**，
// 18 个 SymbolClass 全是动画类，其中两个正是用户说的入场：
//   mmo.petfightnew.GQAppearMovie      ← 光启精灵入场
//   mmo.petfightnew.XinghuiAppearMovie ← 星辉精灵入场
// 它们**不按 URL 单独加载**（网关日志里从来没有 gqpet/xinghuipet 的 appear 请求），
// 而是随本包一次性加载、按类名取符号 —— 所以以前「按 URL 换特效」的做法对它们完全无效。
// 做法：gut_swf_visuals.mjs --only 只抽这两个类的依赖闭包（形状/位图换空壳），
//       普通入场/换宠/死亡等其它动画原样保留；类与精灵时间轴不变 → 不会 #1065/#1009。
// 重新生成：
//   cd client/tools && node gut_swf_visuals.mjs ../cache/aola.100bt.com/play/pet/petfightnew_res.swf \
//     ../web/stub/petfightnew_res.gut.swf --only GQAppearMovie,XinghuiAppearMovie
//
// 开关（Round 45 起运行时判定）：fxFlags().enterEffect && fxFlags().appearMv
//   —— 前者是「入场特效总开关」，后者允许在总开关打开时单独保留入场动画包（按钮里可分别勾选）。
// 只匹配 res 本体（排除 petfightnew_res1 / petfightnew_gqresource / petfightnew_xhresource）
const APPEAR_BUNDLE_RE = /\/pet\/petfightnew_res(?:~\d+)?\.swf/i;
// 两份空壳（round46）+ 单侧空壳（round59）：
//   gut.gq   = 抽 GQAppearMovie+XinghuiAppearMovie 两个类（双侧都关时用）
//   gqonly   = 只抽 GQAppearMovie；xhonly = 只抽 XinghuiAppearMovie（只关一侧时用）
function loadStub(name) {
  try {
    const p = join(webDir, "stub", name);
    if (existsSync(p) && statSync(p).isFile()) return readFileSync(p);
  } catch {}
  return null;
}
const appearGqBuf = loadStub("petfightnew_res.gut.gq.swf");
const appearGqOnlyBuf = loadStub("petfightnew_res.gut.gqonly.swf");
const appearXhOnlyBuf = loadStub("petfightnew_res.gut.xhonly.swf");
if (!appearGqBuf) console.warn("[stub] web/stub/petfightnew_res.gut.gq.swf 缺失 → 入场包不会被替换（用 gut_swf_visuals.mjs --only GQAppearMovie,XinghuiAppearMovie 生成）");
else if (!appearGqOnlyBuf || !appearXhOnlyBuf) console.warn("[stub] web/stub/petfightnew_res.gut.{gqonly,xhonly}.swf 缺失 → 单侧进场开关会退回双侧空壳（--only GQAppearMovie / XinghuiAppearMovie 生成）");

// ============ 调试用：运行时可调屏蔽清单（round44） ============
// 文件 <root>/lowfx.extra：每行一个匹配项（子串；"re:" 前缀=正则；# 注释）。
// 改文件 ≤1s 生效、**不用重启网关**，用于快速二分「这个特效到底是哪个 SWF 画的」。
const EXTRA_FILE = join(root, "lowfx.extra");
let extraState = { mtimeMs: -1, rules: [] };
function extraRules() {
  try {
    const st = statSync(EXTRA_FILE);
    if (st.mtimeMs !== extraState.mtimeMs) {
      const lines = readFileSync(EXTRA_FILE, "utf8").split(/\r?\n/).map(s => s.trim())
        .filter(s => s && !s.startsWith("#"));
      extraState = {
        mtimeMs: st.mtimeMs,
        rules: lines.map(s => s.toLowerCase().startsWith("re:")
          ? { re: new RegExp(s.slice(3), "i") }
          : { sub: s.toLowerCase() }),
      };
      console.log(`[stub] lowfx.extra 载入 ${lines.length} 条规则`);
    }
  } catch {
    if (extraState.mtimeMs !== -1) { extraState = { mtimeMs: -1, rules: [] }; console.log("[stub] lowfx.extra 已移除"); }
  }
  return extraState.rules;
}
function isExtraStub(u) {
  const rs = extraRules();
  if (!rs.length) return false;
  const p0 = String(u), p1 = cacheKey(p0);
  return rs.some(r => r.re
    ? (r.re.test(p0) || r.re.test(p1))
    : (p0.toLowerCase().includes(r.sub) || p1.toLowerCase().includes(r.sub)));
}

// ============ 战斗内「异步特效」整族屏蔽（round44b） ============
// 实测结论：光启的「金色入场光爆」和「抗性护盾 buff 特效」并不在 gqpet/xinghuipet 的按机制资源里，
// 而是来自 `pet/fightasyncres/**` 这族通用特效（effect<ID> / crieffect_normal / xinghuikillbig…），
// 所以单靠 ENTER/BUFF 的 URL 规则删不掉它们。
// AOLA_NO_BATTLE_FX=1 → 该族一律换发 760B 空壳；例外：
//   * fightasyncres/waitbgmovie  —— 战斗页面的「加载动画」，用户要求保留
//   * fightasyncres/xinghuispiritskillbuttonmovie —— 星辉技能按钮的 UI 动画，不属于特效
// 用正则字面量（不是字符串）避免 `re:` 前缀那条链路的双层转义坑。
// Round 46：拆成两个开关 —— fxEffect（通用技能特效 effect<ID>）/ fxCrit（暴击特写 crieffect_normal）
const FX_EFFECT_RE = /\/fightasyncres\/effect\//i;
const FX_CRIT_RE = /\/fightasyncres\/crieffect_normal/i;
const BATTLE_FX_KEEP_RE = /\/fightasyncres\/(waitbgmovie|xinghuispiritskillbuttonmovie)\//i;
// ⚠️ 这些 SWF 是「按类名取符号 + 等 onMovieEnd/COMPLETE 回调」的：换成 760B 空壳后类不存在，
// 回调永远不来 → 战斗在「选择技能后」卡死（round44d 实测：revertpp/reverthp/skillwindword/killbig
// 被换壳后客户端停止发请求、界面停在「对方选择技能中，请等待…」）。这类一律不换壳。
const NEVER_STUB_RE = /\/(revertppmovie|reverthpmovie|xinghuikillbigmovie|gqkillbigmovie)\/|\/petfightnew_skillwindword/i;
const isNeverStub = (u) => NEVER_STUB_RE.test(String(u));
function isBattleFxStub(u, flags) {
  const s = String(u);
  if (BATTLE_FX_KEEP_RE.test(s)) return false;
  if (flags.fxEffect && FX_EFFECT_RE.test(s)) return true;
  if (flags.fxCrit && FX_CRIT_RE.test(s)) return true;
  return false;
}

// 光启/星辉的「资源包」：整包换 760B 会丢掉 UI 面板类，所以改用 gut 出来的「只留 UI 面板图形」版本
//   petfightnew_gqresource.gut.swf  : 保留 GQMingYunBoYiChoosePanel / GQ_ExtBigSkillMc / GQXianJingJiMc 的图形（1.36MB→176KB）
//   petfightnew_xhresource.gut.swf  : 保留 XinghuiTongLingSummonPanel 的图形（450KB→10.6KB）
// 重新生成：
//   node gut_swf_visuals.mjs ../cache/.../petfightnew_gqresource.swf ../web/stub/petfightnew_gqresource.gut.swf \
//     --except GQMingYunBoYiChoosePanel,GQ_ExtBigSkillMc,GQXianJingJiMc
const GQ_RES_RE = /\/pet\/petfightnew_gqresource(?:~\d+)?\.swf/i;
const XH_RES_RE = /\/pet\/petfightnew_xhresource(?:~\d+)?\.swf/i;
function readStubIfAny(name) {
  try {
    const p = join(webDir, "stub", name);
    if (existsSync(p) && statSync(p).isFile()) return readFileSync(p);
  } catch {}
  return null;
}
const gqResBuf = readStubIfAny("petfightnew_gqresource.gut.swf");
const xhResBuf = readStubIfAny("petfightnew_xhresource.gut.swf");

// ============ 方案 A：其它「整包抽图」候选（Round 47） ============
// 光启的登场/机制演出在 res、gqresource、startmv、fightasyncres 全部换壳后仍然出现，
// 说明它可能落在下面这些包里（同样是「按类名取符号」的包，只能抽图不能换 760B）。
// AOLA_GUT_BUNDLES=1 / lowfx.json 的 gutBundles 打开时，命中即换发对应空壳。
const GUT_BUNDLES = [
  { re: /\/pet\/petfightnew_skillwindword(?:~\d+)?\.swf/i, file: "petfightnew_skillwindword.gut.swf" },
  // res1 不再抽：仅 65KB 无收益，且其内含 FaZhenBtn / 系统图标等 UI 素材，抽了会缺技能按钮（Round 55）
].map(e => ({ re: e.re, buf: readStubIfAny(e.file), name: e.file }));

// ============ Round 63：petmovie 后台预取（背包切宠加速） ============
// 亚比管理面板/背包里点一只没看过的新宠，游戏要现拉 4 片 petmovie（每片 1.2-1.5MB，上游首拉 3s+），
// 这就是「切换卡顿」的最大成分。网格/详情页会先批量加载 peticon<id> —— 见到图标就在后台把
// petmovie<id>_0..3 拉进磁盘缓存（fire-and-forget：去重 + 限并发 2 + 已缓存跳过 + 队列上限），
// 用户点到时已命中缓存。世界进场时加载的 6 只队伍宠图标也会触发，队伍面板切宠同样受益。
const PM_PREFETCH = { seen: new Set(), queue: [], active: 0, MAX_ACTIVE: 2, MAX_QUEUE: 24 };
const PM_PART_RE = /\/peticon\/movie\/type0\/petmovie(\d+)\/petmovie\1_([0-3])(?:~\d+)?\.swf/i;
const PETICON_RE = /\/peticon(?:\/petfighticon\/)?peticon(\d+)(?:~\d+)?\.swf/i;
function pmSchedule(host, petId, parts) {
  for (const n of parts) {
    const urlPath = `/play/peticon/movie/type0/petmovie${petId}/petmovie${petId}_${n}.swf`;
    const key = urlPath.toLowerCase();
    if (PM_PREFETCH.seen.has(key)) continue;
    PM_PREFETCH.seen.add(key);
    PM_PREFETCH.queue.push({ host, urlPath });
  }
  if (PM_PREFETCH.queue.length > PM_PREFETCH.MAX_QUEUE) PM_PREFETCH.queue.splice(0, PM_PREFETCH.queue.length - PM_PREFETCH.MAX_QUEUE);
  pmDrain();
}
function pmDrain() {
  while (PM_PREFETCH.active < PM_PREFETCH.MAX_ACTIVE && PM_PREFETCH.queue.length) {
    const job = PM_PREFETCH.queue.shift();
    const lp = localPathFor(job.host, job.urlPath);
    if (lp && existsSync(lp)) continue;   // 已在磁盘缓存
    PM_PREFETCH.active++;
    const selfUrl = `http://127.0.0.1:${port}/mirror/${job.host}${job.urlPath}`;
    fetch(selfUrl, { headers: { "user-agent": "aola-prefetch/1" } })
      .then((r) => { console.log(`[prefetch] ${job.urlPath.split("/").pop()} -> ${r.status}`); return r.arrayBuffer().catch(() => {}); })
      .catch(() => {})
      .finally(() => { PM_PREFETCH.active--; pmDrain(); });
  }
}

async function mirror(host, urlPath, req) {
  const method = (req && req.method || "GET").toUpperCase();
  const { flags, rules } = currentRules();
  // petmovie 预取调度（仅主站 GET；详见上方 Round 63 说明）
  if (method === "GET" && host === "aola.100bt.com") {
    const pm = urlPath.match(PM_PART_RE);
    if (pm) pmSchedule(host, pm[1], [0, 1, 2, 3].filter((n) => n !== Number(pm[2])));
    else {
      const ic = urlPath.match(PETICON_RE);
      if (ic) pmSchedule(host, ic[1], [0, 1, 2, 3]);
    }
  }
  // Round 64：petmovie 分片降采样（背包/精灵详情大立绘加速，详见上方 PETMOVIE_RE 说明）
  // URL 带 ?nodown=1 可单次跳过（对照实验 / 临时回退用）
  if (PETMOVIE_DS_ON && method === "GET" && host === "aola.100bt.com" && PETMOVIE_RE.test(urlPath) && !/[?&]nodown=1/.test(String(req && req.url || ""))) {
    const ck = urlPath.split("?")[0];   // Round 70：键带版本后缀 —— 新版本位图重新降采样，不复用旧 LRU
    let ds = petmovieCache.get(ck);
    if (!ds) {
      const cacheHost = host.replace(/:/g, "_");
      const lp = localPathFor(cacheHost, urlPath);
      if (lp && existsSync(lp)) {
        try {
          const r = pmDownsampleSwf(readFileSync(lp), PETMOVIE_SCALE);
          if (r) {
            ds = r.buf;
            petmovieCache.set(ck, ds);
            if (petmovieCache.size > PETMOVIE_CACHE_MAX) {
              petmovieCache.delete(petmovieCache.keys().next().value);   // 淘汰最旧
            }
            console.log(`[petmovie] ${urlPath.split("/").pop()} 降采样 x${PETMOVIE_SCALE}: ` +
              `${r.nBitmaps} 位图, 像素 ${(r.origPx/1e6).toFixed(2)}M→${(r.newPx/1e6).toFixed(2)}M`);
          }
        } catch (e) { console.log("[petmovie] 降采样失败 " + urlPath.split("/").pop() + ": " + e.message); }
      }
    }
    if (ds) { stats.mirrorHits++; noteStub("petmovie", urlPath); return { status: 200, body: ds, ct: "application/x-shockwave-flash" }; }
  }
  // 机制特效/背景：有 gut 空壳就换发；没有就保持原样（避免缺类导致技能卡死）
  const famWanted = method === "GET" && familyStubWanted(urlPath, flags);
  // skillbackground 必须走「现场抽图 + 去掉 SetBackgroundColor」，预生成空壳里还留着底色
  const famGut = (famWanted && famWanted !== "bg") ? gutFor(urlPath) : null;
  if (famGut) {
    stats.mirrorHits++;
    noteStub("effect", urlPath);
    console.log("[stub] " + host + urlPath.split("?")[0] + " -> gutted (family)");
    return { status: 200, body: famGut, ct: "application/x-shockwave-flash" };
  }
  const wantBg = famWanted === "bg";
  if (famWanted && !famGut) {
    // 没有预生成空壳：读缓存文件现场 gut（保留类契约），失败就原样放行
    const cacheHost = host.replace(/:/g, "_");
    const lp = localPathFor(cacheHost, urlPath);
    if (lp && existsSync(lp)) {
      const key = cacheKey(urlPath);
      const ck = urlPath.split("?")[0] + (wantBg ? "|nobgc" : "");   // Round 70：键带版本 —— 新版本现场重 gut
      let cached = inlineGutCache.get(ck);
      if (!cached) {
        try {
          const src = readFileSync(lp);
          const r = await gutSwfBuffer(src, { stripBackgroundColor: wantBg, forceBackgroundColor: wantBg ? 0x101a2e : null, screenShape: wantBg && screenBitmapJpeg ? { bitmap: screenBitmapJpeg, bitmapId: 65000 } : null });
          if (r.ok && r.bgDropped) console.log("[gut] 去掉 SetBackgroundColor x" + r.bgDropped + "  " + key);
          if (r.ok && r.screenShapes) console.log("[gut] 全屏形状→星域图 x" + r.screenShapes + "  " + key);
          cached = r.ok ? r.buf : null;
          if (cached) {
            console.log("[gut] 现场抽图 " + key + " -> " + cached.length + "B (形状 " + r.shapes + " / 位图 " + r.bitmaps + ")");
          } else {
            console.warn("[gut] 现场抽图失败 " + key + " : " + r.reason + "（原样放行）");
          }
        } catch (e) {
          console.warn("[gut] 现场抽图异常 " + key + " : " + (e && e.message));
        }
        inlineGutCache.set(ck, cached);
      }
      if (cached) {
        stats.mirrorHits++;
        noteStub("effect", urlPath);
        return { status: 200, body: cached, ct: "application/x-shockwave-flash" };
      }
    }
  }
  const skipFamily = famWanted && !famGut;
  if (method === "GET" && flags.gutBundles) {
    const hit = GUT_BUNDLES.find(e => e.buf && e.re.test(urlPath));
    if (hit) {
      stats.mirrorHits++;
      noteStub("battlefx", urlPath);
      console.log(`[stub] ${host}${urlPath.split("?")[0]} -> gutted bundle (${hit.name})`);
      return { status: 200, body: hit.buf, ct: "application/x-shockwave-flash" };
    }
  }
  if (method === "GET" && flags.resPkg) {
    if (gqResBuf && GQ_RES_RE.test(urlPath)) {
      stats.mirrorHits++;
      noteStub("battlefx", urlPath);
      console.log(`[stub] ${host}${urlPath.split("?")[0]} -> gutted gqresource`);
      return { status: 200, body: gqResBuf, ct: "application/x-shockwave-flash" };
    }
    if (xhResBuf && XH_RES_RE.test(urlPath)) {
      stats.mirrorHits++;
      noteStub("battlefx", urlPath);
      console.log(`[stub] ${host}${urlPath.split("?")[0]} -> gutted xhresource`);
      return { status: 200, body: xhResBuf, ct: "application/x-shockwave-flash" };
    }
  }
  if (method === "GET" && !isNeverStub(urlPath) && isBattleFxStub(urlPath, flags)) {
    stats.mirrorHits++;
    noteStub("battlefx", urlPath);
    console.log(`[stub] ${host}${urlPath.split("?")[0]} -> stub swf (battle-fx)`);
    return { status: 200, body: stubSwfBuf, ct: "application/x-shockwave-flash" };
  }
  if (method === "GET" && isExtraStub(urlPath)) {
    stats.mirrorHits++;
    noteStub("extra", urlPath);
    console.log(`[stub] ${host}${urlPath.split("?")[0]} -> stub swf (extra)`);
    return { status: 200, body: stubSwfBuf, ct: "application/x-shockwave-flash" };
  }
  // 光启/星辉入场动画包（round44/46；round59 拆分为光启/星辉两个独立开关）：
  // 它的 URL 不含 effect/appear 字样，但整包里就有入场动画类，必须整包换发空壳。
  // 按开关组合四选一：双关=抽两个 Appear 类；单关=只抽对应类；全开=不替换（原样直发）。
  if (method === "GET" && (flags.enterGq || flags.enterXh) && APPEAR_BUNDLE_RE.test(urlPath)) {
    const both = flags.enterGq && flags.enterXh;
    const buf = both ? appearGqBuf : flags.enterGq ? (appearGqOnlyBuf || appearGqBuf) : (appearXhOnlyBuf || appearGqBuf);
    if (buf) {
      stats.mirrorHits++;
      noteStub("appearBundle", urlPath);
      console.log(`[stub] ${host}${urlPath.split("?")[0]} -> gutted appear bundle (${both ? "gq+xh" : flags.enterGq ? "gq" : "xh"})`);
      return { status: 200, body: buf, ct: "application/x-shockwave-flash" };
    }
  }
  // 特效替换：在缓存/回源之前拦截（归因测量要求每次请求都命中替换，与缓存状态无关）
  if (method === "GET" && !skipFamily && !isNeverStub(urlPath) && rules.length && isStubbedEffect(urlPath, rules)) {
    stats.mirrorHits++;
    noteStub("effect", urlPath);
    console.log(`[stub] ${host}${urlPath.split("?")[0]} -> stub swf`);
    return { status: 200, body: stubSwfBuf, ct: "application/x-shockwave-flash" };
  }
   // 背景类替换（在特效替换之后判断）：专属战斗背景 / 背景加载等待动画 / 背景切换特效，
   // 由 lowfx.json 的 petBackground / bgSkill / bgLoading / bgSwapMovie 分别决定；命中则按条目决定替换体（通用背景或 760B 空壳）
   const bgHit = (method === "GET" && !skipFamily) ? matchBgSwap(urlPath, flags) : null;
   if (bgHit) {
     const body = bgHit.body || stubSwfBuf;
     stats.mirrorHits++;
     noteStub("bg", urlPath);
     console.log(`[stub] ${host}${urlPath.split("?")[0]} -> ${bgHit.body ? "common bg" : "stub swf"}`);
     return { status: 200, body, ct: "application/x-shockwave-flash" };
   }
   // 亚比登场/开场演出（round43）：见上方 AOLA_NO_STARTMV 说明
   if (method === "GET" && flags.startmv && STARTMV_RE.test(urlPath)) {
     const body = (flags.startmv === "skip" ? null : startmvGutBuf) || stubSwfBuf;
     stats.mirrorHits++;
     noteStub("startmv", urlPath);
     // 故意打印未剥查询串的 urlPath —— 便于确认游戏实际带的版本参数（round43 踩过带查询串漏匹配）
     console.log(`[stub] ${host}${urlPath} -> ${flags.startmv === "skip" ? "stub swf" : (startmvGutBuf ? "gutted startmv" : "stub swf")}`);
     return { status: 200, body, ct: "application/x-shockwave-flash" };
   }
  const cacheHost = host.replace(/:/g, "_");   // Windows 目录名不允许冒号
  // Round 70c：静态资产的 **POST 也走缓存** —— 登录后的世界装配阶段用 POST 拉库文件，
  // 之前 POST 直传会把 PATCH_PROTECTED 的补丁版（socketserver/materialservice/login 等）
  // 全部绕过，游戏拿到未打补丁的字节。业务接口（.action/.jsp）不匹配资产扩展名，仍永远直连。
  // 资产 POST 只读缓存不写（写入仍由 GET 完成，语义不变）。
  const isAssetPath = /\.(swf|xml|json|mp3|jpg|jpeg|png|gif|css|js|txt|html|ttf|otf)$/i.test(urlPath.split("?")[0]);
  // captcha.action 的查询参数(?v=时间戳)是验证码刷新的唯一区分——缓存键剥查询参数
  // 会让换一张永远命中同一张旧图 → 必须绕过缓存
  const isCaptcha = /captcha/i.test(urlPath);
  const cacheable = (method === "GET" || (method === "POST" && isAssetPath)) && !isCaptcha;
  const local = cacheable ? localPathFor(cacheHost, urlPath) : null;
  // Round 70：清单网络优先 —— 有缓存也不直接命中，每次启动回源校验（失败回退缓存）
  const relKey = cacheKey(urlPath).split("?")[0].replace(/^\/+/, "");
  const wantFresh = !!(local && FRESH_PATHS_RE.test(relKey));
  // Round 70b：裸名请求 TTL 过期 → 本请求回源校验（每进程每文件一次；补丁站点豁免）
  let ttlStale = false;
  if (!wantFresh && local && CACHE_TTL_MS > 0 && !PATCH_PROTECTED.has(relKey)) {
    try {
      if (Date.now() - statSync(local).mtimeMs > CACHE_TTL_MS && !revalidMemo.has(relKey)) {
        ttlStale = true;
        revalidMemo.add(relKey);
      }
    } catch (e) {}
  }
  const netFirst = wantFresh || ttlStale;
  if (netFirst && local && existsSync(local) && statSync(local).isFile()) {
    console.log(`[${ttlStale ? "ttl" : "fresh"}] ${host}${relKey} 回源校验`);
  }
  if (local && existsSync(local) && statSync(local).isFile() && !netFirst) {
    stats.mirrorHits++;
    console.log(`[${method} ] ${host}${cacheKey(urlPath).split("?")[0]} -> 200 (cache)`);
    return { status: 200, file: local };
  }
  // Round 70e：上游请求**保留版本号** —— 弱校验不是对所有文件成立！实测 materialdata：
  // 裸名 URL = 923749B（无 ToteValueSeason 类），版本化 URL = 951753B（有，官方 11-05 真版）。
  // 剥版本号会把错误版本的字节缓存到版本化文件名下 → 客户端拿到坏数据（#1065/精灵数据缺失）。
  const remotePath = urlPath.split("?")[0];
  const remote = `https://${host}${remotePath}`;
  // 无文件名的路径（如 play/ 目录探测、空声音名）：回一支真实 MP3，避免
  // "HTML 当 MP3 解码" 的异步错误卡断引导链。注意仅限无扩展名路径——
  // captcha.action 等带扩展名但绕过缓存的请求不能吃这个兜底
  const lastSeg = remotePath.split("/").pop() || "";
  if (method === "GET" && !local && !/\.[a-z0-9]+/i.test(lastSeg)) {
    const fb = join(cacheDir, "fallback_silence.mp3");
    if (existsSync(fb)) {
      console.log(`[snd ] ${host}${remotePath} -> fallback mp3`);
      return { status: 200, body: await (await import("node:fs/promises")).readFile(fb), ct: "audio/mpeg" };
    }
  }
  const key = method + " " + host + urlPath;
  if (method === "GET" && inflight.has(key)) return inflight.get(key);
  const p = (async () => {
    try {
      const headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AolaP0/0.1",
        Referer: `https://${host}/play/play.html`,
      };
      // 浏览器侧 Cookie 透传（登录态/会话；所有官方域共用 facade 一只 Cookie 罐）
      // 净化：值含非 ASCII（如 game_auth_sid 的 gameName=奥拉星）时百分号编码——
      // 逗号分隔 + UTF-8 原字节会让上游 WAF 直接 500
      if (req && req.headers.cookie) {
        headers["Cookie"] = String(req.headers.cookie).split(/;\s*/).map(pair => {
          const i = pair.indexOf("=");
          if (i < 0) return pair;
          const k = pair.slice(0, i), v = pair.slice(i + 1);
          return /[^\x20-\x7e]/.test(v) ? k + "=" + encodeURIComponent(v) : k + "=" + v;
        }).join("; ");
      }
      // 上游会话罐叠加（JSESSIONID 等；浏览器拒收官方 Domain 的 Set-Cookie，
      // 验证码/登录必须共享门面侧会话）
      const jarCookie = jarHeader(host);
      if (jarCookie) {
        headers["Cookie"] = headers["Cookie"] ? headers["Cookie"] + "; " + jarCookie : jarCookie;
      }
      const init = { method, headers, redirect: "follow" };
      if (method !== "GET" && method !== "HEAD") {
        const chunks = [];
        for await (const ch of req) chunks.push(ch);
        let bodyBuf = Buffer.concat(chunks);
        // 账号上下文修补：loader 未拿到 duoduoId 时从浏览器登录 Cookie 解析并回填
        if (headers["Cookie"] && /duoduoId=null/.test(bodyBuf.toString("utf8"))) {
          const m = String(headers["Cookie"]).match(/game_auth_sid=([^;]+)/);
          if (m) {
            const dec = decodeURIComponent(m[1]);
            const d = dec.match(/duoduoId=(\d+)/);
            if (d) {
              bodyBuf = Buffer.from(bodyBuf.toString("utf8").replace(/duoduoId=null/g, "duoduoId=" + d[1]));
              console.log("[acct] patched duoduoId=" + d[1] + " into request");
            }
          }
        }
        // newLogin path rewrite: SWF uses password= but we need isnickname=sso + token=
        // Read token from the browser's game_auth_sid cookie
        if (/newLogin\.jsp/.test(remotePath) && /password=/.test(bodyBuf.toString("utf8"))) {
          const cm = headers["Cookie"] ? String(headers["Cookie"]).match(/game_auth_sid=([^;]+)/) : null;
          if (cm) {
            const dec = decodeURIComponent(cm[1]);
            const tm = dec.match(/token=([A-Za-z0-9]+)/);
            const am = dec.match(/account=([^,]+)/) || dec.match(/duoduoId=(\d+)/);
            if (tm && am) {
              bodyBuf = Buffer.from(`isnickname=sso&content=src%3D%26from%3D&test=&token=${tm[1]}&charId=0&wyToken=-1&account=${am[1]}`);
              console.log("[acct] rewrote newLogin to token path (token=" + tm[1].slice(0, 12) + "... account=" + am[1] + ")");
            } else {
              console.log("[acct] game_auth_sid cookie present but no token/account: " + dec.slice(0, 80));
            }
          } else {
            console.log("[acct] no game_auth_sid cookie for newLogin token path");
          }
        }
        init.body = bodyBuf;
        const ct = req.headers["content-type"];
        if (ct) headers["Content-Type"] = ct;
      }
      let upstream;
      try {
        upstream = await fetch(remote, init);
      } catch (e) {
        // https 失败（网关仅支持 http / 证书问题）→ 降级 http 重试
        upstream = await fetch(remote.replace("https://", "http://"), init);
      }
      let body = Buffer.from(await upstream.arrayBuffer());
      // 家族抽图对 POST 也生效（killbig 分片冷缓存时走 POST，漏掉会「首战金环闪一下」）。
      // 与 GET 路径同款 gut：保留类契约，只抽图像；失败则原样返回。
      const famW = familyStubWanted(urlPath, flags);
      if (upstream.status === 200 && famW && famW !== "bg") {
        try {
          const gr = await gutSwfBuffer(body, {});
          if (gr.ok) {
            console.log("[gut] POST 现场抽图 " + cacheKey(urlPath).split("?")[0] + " -> " + gr.buf.length + "B");
            body = gr.buf;
          }
        } catch (e) {}
      }
      // Round 65：petmovie 分片冷缓存首拉常走 POST，这里同样要降采样（否则漏掉一半收益）
      if (PETMOVIE_DS_ON && upstream.status === 200 && PETMOVIE_RE.test(urlPath)
          && !/[?&]nodown=1/.test(String(req.url || ""))) {
        const ck = urlPath.split("?")[0];   // Round 70：键带版本后缀（同 GET 钩子）
        let ds = petmovieCache.get(ck);
        if (!ds) {
          try {
            const r = pmDownsampleSwf(body, PETMOVIE_SCALE);
            if (r) {
              ds = r.buf;
              petmovieCache.set(ck, ds);
              if (petmovieCache.size > PETMOVIE_CACHE_MAX) petmovieCache.delete(petmovieCache.keys().next().value);
              console.log(`[petmovie] POST ${urlPath.split("/").pop()} 降采样 x${PETMOVIE_SCALE}: ` +
                `${r.nBitmaps} 位图, 像素 ${(r.origPx/1e6).toFixed(2)}M→${(r.newPx/1e6).toFixed(2)}M`);
            }
          } catch (e) { console.log("[petmovie] POST 降采样失败 " + urlPath.split("/").pop() + ": " + e.message); }
        }
        if (ds) { noteStub("petmovie", urlPath); body = ds; }
      }
      console.log(`[POST ] ${host}${remotePath} -> ${upstream.status} ${body.length}B`);
      // 登录响应命中腾讯 WAF 滑块挑战 → 暂存参数，交 game.html 顶层完成验证
      if (/TencentCaptcha/.test(body.toString("utf8"))) {
        const html = body.toString("utf8");
        const seqid = (html.match(/var seqid = "([^"]+)"/) || [])[1] || "";
        captchaState.pending = {
          appId: (html.match(/new TencentCaptcha\('(\d+)'/) || [])[1] || "2017163193",
          seqid,
          payload: init.body ? String(init.body) : "",
          ts: Date.now(),
        };
        console.log(`[waf ] captcha challenge queued (seqid=${seqid.slice(0, 20)}...)`);
      }
      // 转发上游 Set-Cookie（登录会话依赖；浏览器按 127.0.0.1 源存储 = 第一方会话）
      let setCookies = [];
      try { setCookies = upstream.headers.getSetCookie(); } catch (e) {}
      // 同时存进门面侧上游会话罐（浏览器拒收官方 Domain 的 Cookie，罐保会话连续）
      for (const sc of setCookies) {
        const [kv] = sc.split(";");
        const i2 = kv.indexOf("=");
        if (i2 > 0) jarFor(host).set(kv.slice(0, i2).trim(), kv.slice(i2 + 1).trim());
      }
      // 登录接口的 Set-Cookie 带官方 Domain（.100bt.com）——浏览器会拒收跨域 Cookie，
      // SWF 的 getCookie 永远读不到新 token。改走 /login-cmd 通道：game.html 用
      // document.cookie 同源写入（game.html 每 2s 轮询领取并重载引导链）。
      if (/quicklogin|normallogin/i.test(urlPath) && setCookies.length) {
        const jar = setCookies
          .map(c => { const [kv] = c.split(";"); const i2 = kv.indexOf("="); return { name: kv.slice(0, i2), value: kv.slice(i2 + 1) }; })
          .filter(c => /auth_sid|web_login_sid/.test(c.name));
        if (jar.length) {
          importLoginCookies(JSON.stringify(jar));
          console.log("[login] " + urlPath.split("/").pop() + " cookies -> game.html channel (" + jar.length + ")");
        }
      }
      if (method !== "GET") {
        try { console.log("  >> req: " + String(init.body).slice(0, 300)); } catch (e) {}
        try { console.log("  << res: " + body.toString("utf8").slice(0, 300)); } catch (e) {}
      }
      if (method === "GET" && upstream.status === 200 && body.length > 0 && local) {
        mkdirSync(dirname(local), { recursive: true });
        writeFileSync(local, body);
        const ct = upstream.headers.get("content-type") || "";
        if (ct && !ct.includes("octet")) {
          try { writeFileSync(local + ".ct", ct); } catch (e) {}
        }
        stats.mirrorFetch++;
        return { status: 200, body, ct: ct && !ct.includes("octet") ? ct : undefined };
      }
      // Round 70/70b：清单/TTL 回源失败（上游非 200）→ 回退本地缓存，保启动韧性
      if (netFirst && local && existsSync(local) && statSync(local).isFile()) {
        console.log(`[fresh] ${remotePath} 上游 ${upstream.status}，回退缓存`);
        stats.mirrorHits++;
        return { status: 200, file: local };
      }
      if (method === "GET") stats.misses++; else stats.mirrorFetch++;
      const ct = upstream.headers.get("content-type") || "";
      return { status: upstream.status, body, ct: ct || "text/plain", setCookies };
    } catch (err) {
      console.log(`[err ] ${remote} -> ${err.message}`);
      stats.misses++;
      // Round 70：清单回源异常（断网/WAF 抖动）→ 回退本地缓存，保启动韧性
      if (netFirst && local && existsSync(local) && statSync(local).isFile()) {
        console.log(`[fresh] ${cacheKey(urlPath).split("?")[0]} 上游异常，回退缓存`);
        stats.mirrorHits++;
        return { status: 200, file: local };
      }
      return { status: 502, body: Buffer.from(String(err)), ct: "text/plain" };
    } finally {
      inflight.delete(key);
    }
  })();
  if (method === "GET") inflight.set(key, p);
  return p;
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://localhost");
  const path = decodeURIComponent(u.pathname);
  stats.requests++;
  try {
    if (path === "/login-cmd") {
      // game.html 轮询：验证码挑战 / 登录 Cookie 注入，领走即清
      let cmd = null;
      if (loginCmds.length) { cmd = loginCmds.shift(); }
      else if (captchaState.pending) {
        cmd = captchaState.pending;
        captchaState.pending = null;
        cmd = { cmd: "captcha", appId: cmd.appId, seqid: cmd.seqid, payload: cmd.payload };
      }
      if (cmd) {
        const who = (req.headers.referer || "no-ref") + " ua=" +
          String(req.headers["user-agent"] || "").slice(0, 40);
        console.log("[cmd ] delivered " + cmd.cmd + " -> " + who);
      }
      res.writeHead(200, { "content-type": "application/json", "access-control-allow-origin": "*" });
      res.end(JSON.stringify(cmd || { cmd: "none" }));
      return;
    }
    if (path === "/import-login" && req.method === "POST") {
      const chunks = [];
      for await (const ch of req) chunks.push(ch);
      const r = importLoginCookies(Buffer.concat(chunks).toString("utf8"));
      console.log("[login] cookie import: " + JSON.stringify(r));
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(r));
      return;
    }
    if (path === "/status") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(stats));
      return;
    }
    // ---------- 低配开关：游戏页按钮的后端（Round 45） ----------
    // GET  /lowfx  → { flags, file, env }   当前生效值 + 文件里的覆盖值 + 启动环境变量
    // POST /lowfx  → 收到 {key:value,...} 合并写 lowfx.json（只接受白名单键），返回最新 flags
    if (path === "/lowfx") {
      const headers = { "content-type": "application/json", "cache-control": "no-store", "access-control-allow-origin": "*" };
      if (req.method === "POST") {
        const chunks = [];
        for await (const ch of req) chunks.push(ch);
        let incoming = {};
        try { incoming = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); }
        catch { res.writeHead(400, headers); res.end(JSON.stringify({ ok: false, error: "bad json" })); return; }
        const cfg = { ...readFxFile() };
        for (const k of FX_BOOL_KEYS) if (k in incoming) cfg[k] = !!incoming[k];
        for (const k of FX_ENUM_KEYS) if (k in incoming) {
          const v = String(incoming[k] || "").trim().toLowerCase();
          const allowed = k === "startmv" ? ["off", "1", "skip"]
            : k === "enterScope" ? ["off", "gq", "all"]
            : ["off", "1", "common"];
          if (allowed.includes(v)) cfg[k] = v;
        }
        writeFxFile(cfg);
        console.log(`[lowfx] 按钮修改: ${JSON.stringify(cfg)}`);
        res.writeHead(200, headers);
        res.end(JSON.stringify({ ok: true, flags: fxFlags(), file: cfg }));
        return;
      }
      res.writeHead(200, headers);
      res.end(JSON.stringify({
        ok: true,
        flags: fxFlags(),
        file: readFxFile(),
        env: {
          AOLA_NO_ENTER_EFFECT: process.env.AOLA_NO_ENTER_EFFECT || "",
          AOLA_NO_BUFF_EFFECT: process.env.AOLA_NO_BUFF_EFFECT || "",
          AOLA_NO_XINGHUI_EFFECT: process.env.AOLA_NO_XINGHUI_EFFECT || "",
          AOLA_NO_PET_BACKGROUND: process.env.AOLA_NO_PET_BACKGROUND || "",
          AOLA_NO_BG_ANIM: process.env.AOLA_NO_BG_ANIM || "",
          AOLA_NO_BATTLE_FX: process.env.AOLA_NO_BATTLE_FX || "",
          AOLA_NO_STARTMV: process.env.AOLA_NO_STARTMV || "",
          AOLA_NO_RES_PKG: process.env.AOLA_NO_RES_PKG || "",
        },
      }));
      return;
    }
    if (path === "/report" && req.method === "POST") {
      const chunks = [];
      for await (const ch of req) chunks.push(ch);
      const text = Buffer.concat(chunks).toString("utf8");
      const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const file = join(root, "docs", "spike", `report-${stamp}.txt`);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, text, "utf8");
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("ok");
      return;
    }
    if (path === "/") {
      res.writeHead(200, { "content-type": mime[".html"] });
      res.end("<h3>Aola P0 mirror (ruffle-client)</h3><p><a href='/game'>open game</a> | <a href='/status'>status</a></p>");
      return;
    }
    if (path === "/game" || path === "/game.html") {
      res.writeHead(200, { "content-type": mime[".html"], "cache-control": "no-store" });
      createReadStream(join(webDir, "game.html")).pipe(res);
      return;
    }
    if (path === "/mirror-inject.js") {
      res.writeHead(200, { "content-type": mime[".js"], "cache-control": "no-store" });
      createReadStream(join(webDir, "mirror-inject.js")).pipe(res);
      return;
    }
    // 系统字体外供：Ruffle 的 fontSources 需要能 fetch 到中文字体（设备字体"宋体"等缺失
    // 会导致中文渲染成空白，登录页角色名只剩数字）。
    if (path.startsWith("/fonts/")) {
      const FONT_ALLOW = new Set(["simhei.ttf", "simsun.ttc", "msyh.ttc", "msyhbd.ttc", "Deng.ttf"]);
      const name = path.slice("/fonts/".length);
      // 优先本地 web/fonts（放改名后的设备字体副本，如 yahei.ttf），再回退系统字体白名单
      const local = /^[A-Za-z0-9_.-]+$/.test(name) ? join(webDir, "fonts", name) : null;
      const fp = local && existsSync(local) ? local : `C:\\Windows\\Fonts\\${name}`;
      if ((!FONT_ALLOW.has(name) && !(local && existsSync(local))) || !existsSync(fp)) {
        res.writeHead(404); res.end("font not found"); return;
      }
      const useLocal = local && existsSync(local);
      res.writeHead(200, {
        "content-type": "font/ttf",
        "cache-control": useLocal ? "no-store" : "max-age=86400",   // 本地字体改动频繁，禁用缓存
      });
      createReadStream(fp).pipe(res);
      return;
    }
    if (path.startsWith("/ruffle/") || path.startsWith("/ruffle-stable/") || path.startsWith("/ruffle-bisect/")) {
      // /ruffle-bisect/<version>/<file>：Ruffle 版本二分用多套运行时（round34），如 /ruffle-bisect/2026-10-24/ruffle.js
      let sub, rel;
      if (path.startsWith("/ruffle-bisect/")) {
        rel = path.slice("/ruffle-bisect/".length);            // "<version>/<file>"
        const slash = rel.indexOf("/");
        sub = slash > 0 ? "ruffle-bisect/" + rel.slice(0, slash) : null;
        rel = sub ? rel.slice(slash + 1) : null;
      } else {
        sub = path.startsWith("/ruffle-stable/") ? "ruffle-stable" : "ruffle";
        rel = path.slice(sub.length + 2);
      }
      const file = sub && rel ? resolve(webDir, sub, rel) : "";
      if (!file.startsWith(resolve(webDir, sub ?? "") + sep) || !existsSync(file) || !statSync(file).isFile()) {
        res.writeHead(404); res.end("not found"); return;
      }
      res.writeHead(200, { "content-type": mime[extname(file).toLowerCase()] || "application/octet-stream", "cache-control": "no-store" });
      createReadStream(file).pipe(res);
      return;
    }
    if (path.startsWith("/mirror/")) {
      const rest = path.slice("/mirror/".length);
      const idx = rest.indexOf("/");
      if (idx <= 0) { res.writeHead(400); res.end("bad mirror path"); return; }
      let host = rest.slice(0, idx).toLowerCase();
      // IP_端口 形式还原（硬编码 IP 网关 183.61.254.215_8050）
      const m = host.match(/^(\d{1,3}(?:\.\d{1,3}){3})_(\d+)$/);
      let remoteHost = host;
      if (m) { remoteHost = `${m[1]}:${m[2]}`; host = remoteHost; }
      const urlPath = rest.slice(idx);
      const r = await mirror(remoteHost, urlPath, req);
      const headers = { "access-control-allow-origin": "*", "cache-control": "no-store" };
      // 默认保留官方网页登录流程（isWebLogin=true）。AOLA_LOCAL_FLOW=1 才翻转为本地清单流程
      // （round22 的世界装配对照实验用；该流程依赖 LocalStore 已保存账号，Cookie 登录会失效）。
      const keepWebLogin = process.env.AOLA_LOCAL_FLOW !== "1";
      const socketDebug = process.env.AOLA_SOCKET_DEBUG === "1";
      const dropServices = (process.env.AOLA_DROP_SERVICE || "").split(",").map(x => x.trim()).filter(Boolean);
      let body;
      if (r.file) {
        headers["content-type"] = mime[extname(r.file).toLowerCase()] || "application/octet-stream";
        body = await import("node:fs/promises").then(fs => fs.readFile(r.file));
      } else {
        headers["content-type"] = r.ct || "application/octet-stream";
        body = r.body;
      }
      if (r.setCookies && r.setCookies.length) {
        headers["set-cookie"] = r.setCookies;
        console.log(`[ck  ] forwarding ${r.setCookies.length} set-cookie(s)`);
      }
      // 记录本场战斗实际发出的 SWF 体积（见 /status 的 recentSwf），760B 即换壳
      if (/\.swf/i.test(urlPath)) noteSwf(urlPath, body.length, body.length === 760);
      if (headers["content-type"] && TEXT_TYPES.test(headers["content-type"]) && body.length < 8 * 1024 * 1024) {
        const kind = /text\/html/i.test(headers["content-type"]) ? "html"
          : /text\/css/i.test(headers["content-type"]) ? "css" : "other";
        const transformed = transformText(body, remoteHost, kind, { keepWebLogin, socketDebug, dropServices });
        if (transformed) {
          body = transformed;
          console.log(`[rw  ] gateway rewrite applied (${kind}): ${path}`);
        }
        // 向官方 HTML 页面注入同源重写脚本（登录页等的运行时 XHR 也要走 facade）。
        // 注意：content-type 可能误报（jsp 回 text/html 但 body 是 XML），只对真 HTML 文档注入
        if (kind === "html") {
          let s = body.toString("utf8");
          if (/<html[\s>]/i.test(s) || /<!doctype\s+html/i.test(s)) {
            const inject = `<script src="${ORIGIN}/mirror-inject.js"></script>`;
            if (/<head[^>]*>/i.test(s)) s = s.replace(/<head[^>]*>/i, (m) => m + inject);
            else s = inject + s;
            body = Buffer.from(s, "utf8");
          }
        }
      }
      res.writeHead(r.file ? 200 : r.status, headers);
      res.end(body);
      return;
    }
    // 未知路径：先尝试从 Referer 推导镜像宿主回源（运行时动态构造的根相对路径），
    // 再不行才 404（避免把 HTML 索引页喂给 SWF 的 XML 解析器）
    const ref = req.headers.referer || "";
    const rm = ref.match(/\/mirror\/([a-z0-9.-]+(?:_\d+)?)(\/|$)/i);
    if (rm) {
      const refHost = rm[1].replace(/_(\d+)$/, ":$1");
      const r = await mirror(refHost, path, req);
      const headers = { "access-control-allow-origin": "*", "cache-control": "no-store" };
      let body;
      if (r.file) {
        // 优先用回源时记录的真实 content-type（.ct 边车），否则按扩展名推断
        let ct = null;
        try { ct = (await (await import("node:fs/promises")).readFile(r.file + ".ct", "utf8")).trim(); } catch (e) {}
        headers["content-type"] = ct || mime[extname(r.file).toLowerCase()] || "application/octet-stream";
        body = await (await import("node:fs/promises")).readFile(r.file);
      } else {
        headers["content-type"] = r.ct || "application/octet-stream";
        body = r.body;
      }
      console.log(`[ref ] fallback via ${refHost}: ${path} -> ${r.file ? 200 : r.status}`);
      if (r.file || (r.status >= 200 && r.status < 400)) {
        res.writeHead(200, headers);
        res.end(body);
        return;
      }
    }
    console.log(`[404 ] ${path}`);
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found: " + path);
  } catch (err) {
    console.error("[serve]", err);
    res.writeHead(500);
    res.end(String(err));
  }
});

server.on("upgrade", setupWsTunnel);

// ============ 引擎补丁自愈（Round 47/50） ============
// petfightnew.swf 里两处「等长替换方法体」补丁：①跳过亚比登场演出 ②屏蔽专属战斗场景加载。
// cache 被重新下载后字节会丢，启动时检查标记、缺失就从 .orig 重打一遍。
function ensureEnginePatches() {
  // Round 57：引擎 ABC 补丁改为**显式 opt-in**（AOLA_ENGINE_PATCH=1 才打）。
  // 原因：showAppearEffect（登场演出跳过）与 changeSkillBackGround（专属场景屏蔽）两个补丁
  // 会杀掉星辉/王者「系统专属技能按钮」的挂载链（昊天·瞬耀技能 / 盖亚·王者技能 消失；
  // 任一单补丁即可杀昊天侧，两补丁同打连盖亚侧也消失 —— Round 57 控制变量真值表）。
  // 登场演出改由资源级方案覆盖（lowfx.json enterScope=gq 抽空 petfightnew_res 的
  // Appear 类闭包，类/时间轴/帧脚本保留 → 挂载逻辑存活）；专属技能背景改由
  // bgSkill=false 原样直发（抽空会整层白，见 Round 50）。
  if (!process.env.AOLA_ENGINE_PATCH) return;
  try {
    const swf = join(cacheDir, "aola.100bt.com/play/pet/petfightnew.swf");
    if (!existsSync(swf)) return;
    const raw = readFileSync(swf);
    if (raw.subarray(0, 3).toString("latin1") !== "CWS") return;
    const body = zlib.inflateSync(raw.subarray(8));
    const marker = Buffer.from("d030d0d066841d4fba1d0147", "hex");
    if (body.includes(marker)) return;
    console.log("[patch] AOLA_ENGINE_PATCH=1：petfightnew.swf 未打补丁，正在自动应用 …");
    const r = spawnSync(process.execPath, [join(root, "tools/apply_engine_patches.mjs")], { timeout: 180000, encoding: "utf8" });
    console.log("[patch] " + (r.status === 0 ? "已应用（登场演出关闭 / 专属场景屏蔽）" : "失败：" + (r.stderr || r.stdout)));
  } catch (e) {
    console.warn("[patch] 自动打补丁失败：" + (e && e.message));
  }
}
ensureEnginePatches();

server.listen(port, "127.0.0.1", () => {
  console.log(`[serve] P0 mirror on http://127.0.0.1:${port}/  game: /game`);
});





