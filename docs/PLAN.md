# 奥拉星现代内核客户端 开发规划
> 方案：现代浏览器内核（WebView2/Tauri 2）+ Ruffle WASM 运行时
> 依据：《奥拉星 Flash 客户端架构调查报告》（[REPORT.md](REPORT.md)）+ Ruffle 2026 年现状调研
> 起草：2026-10-31
>
> **现状（2026-11-02）**：P0 已全部打通（引导/登录/角色/Socket/世界/战斗）。
> 当前可运行形态见 [../README.md](../README.md)；本文 §5 的 `crates/aola-shell` 为后续 Tauri 产品化结构规划，尚未实施。

---

## 0. 目标与非目标

**目标**
1. 用现代 Chromium 内核 + Ruffle 替换 My登录器的 CEF 87 + PPAPI Flash 34 私有运行时
2. 根治卡顿主因：Flash 位图池/纹理地板（渲染进程 215→1549MB 只涨不跌）在 GPU 矢量渲染 + 宿主层资源治理下不再累积
3. 根治"刷新触发重新登录"：登录态由壳层持有，刷新 = 重建 VM + 自动重进场（refresh-ext 方案的终极形态）
4. 摆脱 Flash 停服后的私有分发依赖与安全面

**非目标（首期）**
- 不修改游戏逻辑/协议/封包（规避反作弊风险）
- 不做协议级加速、外挂功能
- 不分发游戏资源包（资源运行时从官方源拉取，仅本地缓存）

---

## 1. 技术选型

| 层 | 选择 | 理由 | 备选 |
|---|---|---|---|
| 壳层 | **Tauri 2（Windows，WebView2 Evergreen）** | 现代 Chromium 自动更新；Rust 生态与 Ruffle 同源，可内联代理/资源服务；体积小 | Electron（重）、CEF modern（重）、纯 ruffle-desktop（无浏览器内核） |
| Flash VM | **Ruffle selfhosted WASM 包**（ruffle.js，6 文件本地打包） | 与"浏览器内核"目标一致；JS API 完整（`window.RufflePlayer.config`）；[官方文档](https://github.com/ruffle-rs/ruffle/blob/master/web/packages/selfhosted/README.md) | Plan B：直接以 Rust crate（ruffle_core + wgpu）原生嵌入，性能更高但失去内核集成 |
| 资源管线 | Tauri 主进程内置 **axum 本地服务** + WebView2 `WebResourceRequested` 请求拦截 | 拦截发生在网络栈下层，能改写 Ruffle WASM 发起的所有 fetch；可注入 CORS 头与 crossdomain.xml | 仅本地源镜像（需确认 loader 的 URL 拼接规则） |
| Socket 桥 | 主进程内 **tokio WebSocket↔TCP 隧道** + Ruffle `socketProxy` 配置 | Ruffle 原生机制：`socketProxy: [{host, port, proxyUrl}]`，未匹配则连接失败（源码 load-options.ts 已确认） | 上游通配符支持（待验证） |
| 登录 | 独立 Profile 的内嵌 WebView 打开官方登录页，捕获票据 URL | 复用官方登录/验证码/安全体系 | — |
| 调试 | WebView2 自带 CDP（`--remote-debugging-port=9222` 同款） | refresh-ext 全套工具链（监控/DevTools 下发）可直接移植 | — |

---

## 2. 总体架构

```
┌────────────────────────────────────────────────────────────┐
│ Tauri 2 Shell (Rust, Windows)                              │
│                                                            │
│  ┌─ 登录窗口 ─────────┐   ┌─ 游戏窗口 ─────────────────┐   │
│  │ WebView2           │   │ WebView2                   │   │
│  │ account.100bt.com  │   │  index.html（宿主页）       │   │
│  │ 持久 Profile       │   │   └ Ruffle WASM (AVM2)     │   │
│  │ 捕获票据 u/code ────┼──▶│   start.swf→loader→play    │   │
│  └────────────────────┘   └────────────┬───────────────┘   │
│                                        │ WebResourceRequested│
│  ┌─ 本地服务（主进程 axum/tokio）───────▼───────────────┐   │
│  │ /mirror/*     资源镜像（cache/ 目录，LRU+增量同步）    │   │
│  │ /ws2tcp/:h/:p WebSocket↔TCP 隧道（游戏 socket 用）    │   │
│  │ /updater      start.xml 增量 + versiondata 全量解析    │   │
│  └──────────────┬─────────────────────────────────────┘   │
└─────────────────┼──────────────────────────────────────────┘
                  ▼
     官方服务器（不变）：aola.100bt.com 资源/登录、
     login/service 网关、动态分配的游戏 socket host:port
```

**请求流（关键设计）**
- 游戏页 origin = `http://127.0.0.1:<port>`（同源，杜绝 Flash 安全沙箱差异）
- SWF 内部对 `aola.100bt.com` / `resource.a0bi.com` / `localstore.100bt.com` 的**绝对 URL 请求**：由 `WebResourceRequested` 拦截 → 缓存命中回本地，未命中透传官方并写缓存；统一附加 `Access-Control-Allow-Origin: *`
- SWF 内部**相对 URL**：基于宿主页 base 解析到 `/mirror/` 本地路径
- `crossdomain.xml`：由拦截器返回本地副本（策略文本由我们控制，消除沙箱判定分歧）
- 游戏二进制 Socket：SWF 请求 `flash.net.Socket.connect(host, port)` → Ruffle 查 `socketProxy` 匹配表 → 连 `ws://127.0.0.1:<port>/ws2tcp/{host}/{port}` → 隧道到真实服务器

---

## 3. 攻坚点与对策（映射调查证据）

| # | 难点 | 证据 | 对策 | 风险 |
|---|---|---|---|---|
| 1 | **二进制 Socket + PBJ 加密** | config.xml `<protocol>binary</protocol>`；`encrypt.pbj`（C++ mangled `__Z16encryptByteArrayv`）；socketclient/socketserver.swf | socketProxy 隧道承担传输；PBJ 加解密在 AVM2 内由 Ruffle 的 pixelbender 解释器执行——Ruffle 已支持 PBJ 字节码翻译但 **opcode 有缺口**（#14519 `Div` 等、canvas 后端不支持 #20917）。Phase 0 实测 encrypt.pbj；缺口则向上游补算术指令（工作量可控） | 高→中 |
| 2 | **4 级引导链 + 49,555 条资源路径** | start.swf→start.xml→loader.swf→versiondata.swf(3.59MB)；URL `~版本` 后缀服务器忽略 | 本地镜像 + 拦截改写；增量同步用 start.xml（当期变更）+ versiondata（全量映射，SWF tag 解析成 JSON 缓存）；启动不阻塞、后台预热 | 中 |
| 3 | **JS↔AS 双向桥** | aola.js：`closeSocket/openVoice/showWebLogin/addCookieFromAs/showPayDialog/getUserAgent` | Ruffle 支持 ExternalInterface；宿主页实现同名函数，付费/语音类先 stub | 低 |
| 4 | **一次性登录票据** | play.html 参数 `u`/`code`；WebLoginChecker/`loginTimestamp` | 登录窗口持持久 Profile；票据捕获后组 URL 进游戏；**Phase 2**：检测到回落门户页时自动重取票据（门户"开始"按钮若为会话 cookie 换票即可全自动） | 中 |
| 5 | **AVM2 API 覆盖面** | Box2D 内嵌（physicsengine/box2d）、~50 服务模块、MemoryWatch 等 | Ruffle AVM2 已达"多数游戏可玩"水平（[官方兼容页](https://ruffle.rs/compatibility)）；Phase 0 按模块清单抽 API 矩阵（ByteArray/ShaderJob/Sound/DefineFont/SharedObject/ExternalInterface…）逐项验证 | 中 |
| 6 | **内存治理（本客户端的存在理由）** | fightassets 位图池 3,283 件×742-1458KB（矢量孪生仅 8-14KB）；activityres 占库 42% | Ruffle GPU 渲染无 Flash 纹理地板；资源层 LRU + 预取白名单；兜底手段：会话热回收（VM 重建 + 免重登重进场，把"刷新"变成秒级操作） | 低 |
| 7 | **动态区服 IP** | 游戏服 host:port 由登录流（ZoneInfo.jsp/redirect.jsp）下发，config.xml 无静态 IP | 方案 a：拦截改写 ZoneInfo 响应，把 socket 地址固定指向本地隧道；方案 b：socketProxy 通配（若上游支持；否则本地全端口隧道+改写）。Phase 0 定案 | 中 |
| 8 | **SharedObject/BtLocalStore** | localstore.100bt.com/btlocalstore.swf 跨域本地仓库 | Ruffle SharedObject 走 localStorage 后端；跨域仓由拦截器同源化 | 低 |

---

## 4. 分阶段计划

### Phase 0 —— 可行性冲刺（预计 2~4 天，产出 GO/NO-GO）
| 步骤 | 内容 | 判据 |
|---|---|---|
| P0.1 | Tauri 2 模板 + selfhosted 包 + axum 静态镜像，从本地加载 start.swf 跑通引导链到 loader.swf | 引导器内存表出现、loader 开始拉模块 |
| P0.2 | ws2tcp 隧道 + socketProxy 配置；用登录流抓到的真实 host:port 联通二进制 socket | socket 状态机进入 READY/SUC |
| P0.3 | encrypt.pbj 在 Ruffle 下执行验证（加密解密往返一致） | 收发封包校验通过（MD5/心跳有响应） |
| P0.4 | 登录窗口拿票据 → play.html 进游戏主城 | 看到游戏场景即 **GO** |

**NO-GO 判据**：PBJ 无法补齐且封包无法解密（游戏完全不可用），或 AVM2 缺口密集到主流程瘫痪 → 切换策略：同壳层承载官方 **H5 互通版**（/h5/ LayaAir，共享资源管线）作为容器方案。

### Phase 1 —— MVP 可日常游玩（预计 2~3 周）
- 资源管线完整化：镜像缓存 + start.xml 增量同步 + versiondata 全量解析 + LRU + 空闲预取
- 登录桥完整化：持久 Profile、验证码、多区服选择（config.xml 区服表）、断线重连
- ExternalInterface shim 全量适配；声音/字体/输入法（中文聊天）验证
- 稳定性：崩溃恢复、日志收集（clientlog 上报维持官方通道）
- **验收**：登录→主城→战斗→聊天→换场景→活动页全流程；2 小时会话内存曲线 ≤ Flash 方案同期的 1/3

### Phase 2 —— 优化（预计 1~2 周）
- **免重登刷新**：VM 重建 + 票据自动重取（refresh-ext 的根治版；配合 Ruffle PlayerElement 生命周期可控）
- fightassets 按需加载策略（白名单裁剪位图池）、性能 profile（WASM AVM2 vs Flash 帧率对比）
- 全屏/手柄/DPI 缩放/多显示器；内网加速线路调度（isp.txt）

### Phase 3 —— 产品化（按需）
- 安装包 + 自动更新（Tauri updater）、托盘、多开/多账号
- Flash/H5 双模式一键切换（Ruffle 跑不通的模块走官方 H5 版兜底）
- 可选：Ruffle native（Plan B）性能通道

---

## 5. 仓库结构

```
ruffle-client/
  PLAN.md                     ← 本文档
  crates/aola-shell/          # Tauri 主程序
    src/main.rs               #   窗口/托盘/生命周期/CDP 端口
    src/res_server.rs         #   axum 镜像服务 + LRU
    src/interceptor.rs        #   WebResourceRequested 拦截器
    src/ws2tcp.rs             #   socket 隧道
    src/updater.rs            #   start.xml/versiondata 解析与同步
    src/login_bridge.rs       #   登录票据捕获
  web/                        # WebView 前端
    game.html                 #   游戏宿主页（ruffle 装载 + EI shim + socketProxy 注入）
    login.html                #   登录跳板
    ruffle/                   #   selfhosted 包（本地化）
  cache/                      # 资源缓存（运行时生成，gitignore）
  docs/spike/                 # Phase 0 实验记录与兼容性矩阵
```

---

## 6. 风险矩阵

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| AVM2 API 缺口密集 | 中 | 高 | API 矩阵驱动逐项攻坚；必要时向上游提 patch；兜底切官方 H5 版 |
| PBJ opcode 缺口 | 中 | 高 | encrypt.pbj 逻辑简单（算术/查表），Rust 侧补齐 opcode 可控 |
| WASM 性能不足 | 中 | 中 | Plan B：Ruffle native crate 嵌入；矢量渲染本身优于 Flash 位图池 |
| socketProxy 通配不匹配动态 IP | 中 | 高 | ZoneInfo 响应改写固定到隧道；或上游通配支持 |
| 官方风控（易盾/加密升级） | 低 | 高 | 不碰协议不改封包，纯容器；保持官方上报通道 |
| 合规 | 低 | 中 | 仅个人本地容器、不分发资源、资源来自官方源 |

---

## 7. 与既有交付物的关系
- `refresh-ext/`（刷新代理 + DevTools 通道）：在 My登录器上继续可用；本客户端 Phase 2 的"VM 重建"是其根治版
- 调查报告 `REPORT.md` 的 loader 链 / 网关拓扑 / 协议结论直接作为本项目输入
- 监控工具链（内存采样、窗口救援、DPI 修复）可整体移植（WebView2 同样支持 CDP）

## 8. 参考来源
- Ruffle 官方兼容页：https://ruffle.rs/compatibility （AVM2 追踪：https://ruffle.rs/compatibility/avm2）
- Ruffle 仓库：https://github.com/ruffle-rs/ruffle
- Socket 支持（WS 隧道）：https://github.com/ruffle-rs/ruffle/issues/905
- PBJ 缺口：https://github.com/ruffle-rs/ruffle/issues/14519 、https://github.com/ruffle-rs/ruffle/issues/20917
- selfhosted 包文档：https://github.com/ruffle-rs/ruffle/blob/master/web/packages/selfhosted/README.md
- JS 配置 API：https://ruffle.rs/js-docs/master/index.html （`socketProxy` 键定义见 web/packages/core/src/public/config/load-options.ts）
