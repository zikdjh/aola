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
import { createReadStream, existsSync, statSync, mkdirSync, writeFileSync, appendFileSync, rmSync } from "node:fs";
import { extname, resolve, sep, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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

const stats = { requests: 0, mirrorHits: 0, mirrorFetch: 0, misses: 0 };
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
  const key = cacheKey(urlPath).split("?")[0];
  const rel = decodeURIComponent(key).replace(/^\/+/, "");
  if (!rel || rel.includes("..")) return null;
  if (!/\.[a-zA-Z0-9]+$/.test(rel)) return null;   // 必须带文件名（防目录/空路径）
  return join(cacheDir, host, rel.replace(/:/g, "_")); // Windows 文件名不允许冒号
}

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

async function mirror(host, urlPath, req) {
  const method = (req && req.method || "GET").toUpperCase();
  const cacheHost = host.replace(/:/g, "_");   // Windows 目录名不允许冒号
  // 静态资源（GET）走磁盘缓存；POST（登录/业务接口）永远直连转发
  // captcha.action 的查询参数(?v=时间戳)是验证码刷新的唯一区分——缓存键剥查询参数
  // 会让换一张永远命中同一张旧图 → 必须绕过缓存
  const isCaptcha = /captcha/i.test(urlPath);
  const local = (method === "GET" && !isCaptcha) ? localPathFor(cacheHost, urlPath) : null;
  if (local && existsSync(local) && statSync(local).isFile()) {
    stats.mirrorHits++;
    console.log(`[${method} ] ${host}${cacheKey(urlPath).split("?")[0]} -> 200 (cache)`);
    return { status: 200, file: local };
  }
  const remotePath = cacheKey(urlPath).split("?")[0];
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
      const body = Buffer.from(await upstream.arrayBuffer());
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
      if (method === "GET") stats.misses++; else stats.mirrorFetch++;
      const ct = upstream.headers.get("content-type") || "";
      return { status: upstream.status, body, ct: ct || "text/plain", setCookies };
    } catch (err) {
      console.log(`[err ] ${remote} -> ${err.message}`);
      stats.misses++;
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
    if (path.startsWith("/ruffle/") || path.startsWith("/ruffle-stable/")) {
      const sub = path.startsWith("/ruffle-stable/") ? "ruffle-stable" : "ruffle";
      const file = resolve(webDir, sub, path.slice(sub.length + 2));
      if (!file.startsWith(resolve(webDir, sub) + sep) || !existsSync(file) || !statSync(file).isFile()) {
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

server.listen(port, "127.0.0.1", () => {
  console.log(`[serve] P0 mirror on http://127.0.0.1:${port}/  game: /game`);
});
