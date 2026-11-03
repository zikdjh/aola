# 奥拉星现代内核客户端（aola）

用 **Ruffle(WASM) + 现代 Chromium 内核** 承载奥拉星 Flash 页游，替代已停服的 PPAPI Flash。
资源从官方源实时回源并本地缓存，游戏二进制 socket 经本地 `WebSocket ↔ TCP` 隧道转发。

> 状态：**P0 全部打通** —— 引导 / 登录 / 角色 / Socket / 世界装配 / 战斗 均已在本地客户端复现并验证。

---

## 1. 快速开始

```powershell
cd D:\temp\ZCode\aola
# 全部 61 个服务都已启用；如遇特定账号数据问题，可临时用 AOLA_DROP_SERVICE 摘除服务
# $env:AOLA_DROP_SERVICE="HeadFrameService,ToteService,CrystalKeyService"
$env:AOLA_TUNNEL_DEBUG="1"
node client\tools\serve.mjs 8700
```

浏览器打开 <http://127.0.0.1:8700/game>，依次：

1. 等 ~30s 出「自动登录页」→ 点 **进入游戏**
2. ~15s 出选服页 → 点 **快速开始游戏**
3. ~90s 世界装配完成（61/61）→ 进入游戏世界

Cookie 失效时重打票据（测试号 26394032）：

```powershell
ego-browser nodejs -e "await import('file:///D:/temp/ZCode/aola/client/tools/round15_auto_login.mjs')"
```

### 环境变量

| 变量 | 作用 |
|---|---|
| `AOLA_DROP_SERVICE=a,b,...` | 从 config.xml `<service>` 摘除指定服务（调试 / 特殊账号数据兼容） |
| `AOLA_TUNNEL_DEBUG=1` | 隧道双向 hexdump + 落盘 `client/docs/spike/tunnel_capture.bin` |
| `AOLA_LOCAL_FLOW=1` | 把 difference.xml 的 `isWebLogin` 翻成 false，走本地清单流程（对照实验用；依赖 LocalStore 内已存账号） |
| `AOLA_SOCKET_DEBUG=1` | 打开 config.xml `<socket><debug>`，输出 socket 层调试 trace |

---

## 2. 目录结构

```
aola/
├─ README.md                     ← 本文件（总入口）
├─ docs/
│  ├─ REPORT.md                  Flash 客户端架构调查报告（2026-10-31）
│  ├─ PLAN.md                    现代内核客户端开发规划（Tauri/Ruffle 方案）
│  ├─ p0-log.md                  P0 可行性冲刺执行日志（第 1–15 轮）
│  ├─ HANDOFF.md                 世界装配 [2/61] 攻坚 + 战斗验证交接（Round 22–25）
│  └─ screenshots/               关键里程碑截图
├─ client/                       ← 客户端本体（原 ruffle-client）
│  ├─ tools/serve.mjs            镜像/回源/网关改写/WS↔TCP 隧道/DS 加密补位（单文件，零依赖）
│  ├─ tools/*.mjs                补丁与逆向工具（ABC 反汇编、SWF 补丁、票据自动化）
│  ├─ web/game.html              Ruffle 宿主页（EI 桩、Cookie 组合、登录桥、socketProxy）
│  ├─ web/ruffle/                Ruffle selfhosted 运行时
│  ├─ cache/                     资源缓存（含已打补丁的 SWF，见 §3）
│  └─ docs/spike/                运行时报告 report-*.txt 与过程截图 r*.png
├─ assets/                       官方入口页与引导 SWF 样本（play.html/aola.js/start.swf）
├─ patches/
│  ├─ socketserver/              socketserver / socketserver1 补丁前后 SWF
│  ├─ bodies/                    反汇编用解压体（ss1/util/common/socketclient/kernel）
│  └─ originals/                 被替换文件的原始备份与补丁产物
├─ captures/                     抓包与解压证据（zone_live.etl / zone_real.etl / loginmod_body.bin）
├─ automation/                   ego-browser 自动化脚本（round21–round82，按轮次编号）
└─ investigation/                早期调查产物（monitor / refresh-ext / download / scripts）
```

---

## 3. 补丁清单（已部署在 `client/cache`）

| 目标 SWF | 补丁工具 | 作用 |
|---|---|---|
| `library/socketserver.swf`、`socketserver1.swf` | `client/tools/patch_seq4.mjs` | DefenseMsgSeq 计数器公式内联（Ruffle ShaderJob 空壳，等待永不完成） |
| `material/materialservice.swf` | `client/tools/patch_itemservice_skipmissing.mjs` | `ItemService.initItemData` 缺失物品**跳过**而非 throw，并保留 `onInited()` → 修掉 `[2/61]` 卡死 |
| `pet/petfightnew.swf` | `client/tools/patch_fightdata_resetdomain.mjs` | `FightData.resetDomainIfStale` → `return false`（`tagDomain` 缺失导致战斗卡在 VS 界面） |
| `library/materialdata.swf` | 线上版本 `materialdata~261029283147051.swf` | 必须与 interfaces/materialservice 成套（详见 §4 数据版本约束） |
| ~~8 个含设备字体名的 SWF~~ | `client/tools/patch_fontname_simsun.mjs` | **已回退**：改由 `client/web/fonts/songti.ttf` 提供「宋体」家族；备份 `*.prefont` 保留 |
| `material/materialservice.swf` | `client/tools/patch_petcard3_skipmissing.mjs` | `PetCard3Service.initDatas` 跳过 materialdata 未定义的宠物卡（否则该服务永不 `onInited`，世界装配卡在 13/57） |
| `material/materialservice.swf` | `client/tools/patch_hkservice_skipmissing.mjs` | `HKService.initItemData` 缺失 HK 跳过而非 throw（保留，宽松处理异常账号数据） |
| `library/interfaces.swf` | `client/tools/patch_equiptotalbe_guard.mjs` | `PetBattleEffHelper.getEquipTotalBE`：`getPetCardById` 返回 null 时返回 0（否则背包面板 `initUI` 抛 #1009） |

> 已停用的两个补丁（工具保留，**不要再打**，否则会清零战力）：
> `patch_petcard3_extra_skip.mjs`（把 `getPetCard3SingleExtraEff` 结果置 0 → 宠物卡3额外战力丢失，实测 -3592）、
> `patch_hkhelp_skip.mjs`（跳过全部 HK 槽位 → 魂卡战力归零，实测 -6000）。
> 新版数据下空引用已消失，恢复原逻辑后背包仍正常。

### 中文字体（设备字体）修复

SWF 大量按**中文设备字体名**（宋体 / 微软雅黑 / 汉仪旗黑 等）取字。Ruffle 只按**字体家族名**
在 `fontSources` 已加载的字体里匹配；Windows 自带字体家族名是英文（`SimSun` / `Microsoft YaHei`），
所以中文名永远匹配不到 → 回退到不含 CJK 的字体 → **中文整段不可见/缺字方框**（角色名只剩数字、
背包卡片名字空白）。`宋体`(6B) 这类「中文名 → 英文家族名」可用 SWF 等长替换绕开，但 `微软雅黑`(12B)、
`汉仪旗黑-80S ExtraBold` 等无法等长映射。

最终方案：**给需要的中文设备字体名各生成一份字体副本**（改 name 表 family，字形不动）。
但 **字体数量会显著拖慢 Ruffle**（见下），当前只加载必要的最小集（5 个）：

| 字体文件（`client/web/fonts/`，~79MB） | family | 来源 / 用途 |
|---|---|---|
| `songti.ttf` / `songti_b.ttf` | 宋体（Regular / Bold） | **simsun.ttc face0**；背包/通用文本（**精灵名字的关键**） |
| `yahei.ttf` / `yahei_b.ttf` | 微软雅黑（Regular / Bold） | **msyh.ttc / msyhbd.ttc face0**；HUD |
| `hanyi.ttf` | 汉仪旗黑-80S ExtraBold | simhei 副本；精灵卡/标签 |

生成方式（改 name 表，保留全部字形；`.ttc` 可传 faceIndex）：

```powershell
uv run --no-project --with fonttools -- python client\tools\make_cjk_font.py `
  C:\Windows\Fonts\msyh.ttc client\web\fonts\yahei.ttf "微软雅黑" Regular "AolaCJK-YaHei" 0
```

配套改动：

1. `client/tools/serve.mjs` 的 `/fonts/*` 路由：优先 `client/web/fonts/`（本地副本，`cache-control: no-store`），
   回退 `C:\Windows\Fonts` 白名单（simhei/simsun/msyh/msyhbd/Deng）
2. `client/web/game.html`：`fontSources` 只列上述 5 个文件（**只有 fontSources 生效**，
   Ruffle 的 `defaultFonts` 对设备字体请求不起作用，保留仅为兼容旧配置）
3. ~~`patch_fontname_simsun.mjs`（8 个 SWF 里「宋体」→`SimSun`，175 处）~~ 已**回退**
   （备份 `*.prefont` 仍在），改由 `songti.ttf` 直接提供「宋体」家族，因此不再需要加载 `simsun.ttc`

⚠️ **字体数量 = 性能**（Round 31 实测）：加载 14 个 CJK 字体时，背包内切精灵会阻塞 5–6 秒、
魂卡编辑只有 ~13fps；缩减到 5 个后，重复切换降到 ~40–70fps、最长停顿 ~0.1–0.2s。
`simsun.ttc`/`msyh.ttc` 这类十几 MB 的 TTC 尤其贵，能不加就不加。
其余字体副本（方正/黑体/Arial 等）可按需再生成，但会重新引入卡顿。

> 说明：`Unknown device font "SimSun" / "Microsoft YaHei"` 之类告警仍会出现（少量 SWF 原生请求英文名），
> 对应文本目前未发现可见缺失；若需要可再加对应家族副本，但会增加字体数量与开销。

### 数据版本约束（重要）

当前使用**与线上同版本**的一套数据（2026-11-03 校准）：

- `materialdata.swf` = `library/materialdata~261029283147051.swf`（947244B，含 `ToteValueSeason` 类）
- `library/interfaces.swf` = 线上最新版（1118994B，body 3116181）**+ 1 个补丁**（`getEquipTotalBE` 空值保护）
- `material/materialservice.swf` = 官方 11-02 版（102939B）**+ ItemService / PetCard3 初始化补丁**（HK 初始化跳过已撤销）

⚠️ 这三者必须成套：
- 旧的 923749B materialdata 没有 `ToteValueSeason` → `ToteService` 初始化报 `#1065`
- 旧的 interfaces（body 3112213）与新 materialdata 的 `ToteValueSeasonData` 构造参数不匹配 → `#1063 Expected 6, got 5`
- 换数据时请整套替换并重新打补丁，不要只换其中一个文件

### SWF 解压备忘

| 容器 | 布局 | 解压 |
|---|---|---|
| `CWS` | 8B 头 + zlib | `zlib.inflateSync(raw.subarray(8))` |
| `ZWS` | `[8B 头][4B 压缩长][5B LZMA props][raw LZMA1 data]` | **raw LZMA1**：`client/tools/swf_to_fws.py`（Python，`uv run --python 3.12`）；npm `lzma` 无法解 raw 流 |

---

## 4. 已完成里程碑

| 关卡 | 结论 | 关键证据 |
|---|---|---|
| 引导链 | ✅ | start.swf → loader → config/difference → 模块装配 |
| 登录 | ✅ | game_auth_sid 组合 Cookie → newLogin.jsp → serverslist |
| 角色/选服 | ✅ | AutoLoginPage → 快速开始 |
| Socket | ✅ | 22 条 C2S / 279 条 S2C，DefenseMsgSeq 计数器补位 |
| 世界装配 | ✅ | `57/57`（曾卡 `[2/61]`，见 HANDOFF） |
| 战斗 | ✅ | 单人 PvP 匹配 → VS → 回合 → 结算（单亚比 胜场 2 / 连胜 2） |

---

## 5. 已知问题（不阻塞）

- `baseservice/faceres/face_res` 旧版缺 `face88/face89` → 聊天表情 #1065
- `onPlayerEnterRoom` 参数数量不匹配 #1063（切场景偶发，标题缓存相关）
- 测试账号带客户端未定义物品（如 `没有 68` / `5609`）：初始化补丁已做宽松跳过
- 稀有 `71_24/71_25` Ruffle 脚本超时
- 首次打开背包 / 首次切到某只新精灵会有 0.8–2.2s 一次性停顿（Ruffle 解码 `petmovie` 位图，
  评估见 HANDOFF Round 31/32；重复切换已是 0.1–0.2s）
- 少量 `Unknown device font "SimSun" / "Microsoft YaHei" / "微软雅黑"(bold)` 告警，未见可见缺字
- 性能敏感点：**`fontSources` 字体数量**（14 个时切精灵阻塞 5–6s），当前只保留 5 个，勿随意增加

---

## 6. 文档索引

| 文档 | 内容 |
|---|---|
| [docs/REPORT.md](docs/REPORT.md) | 官方客户端架构（引导链、协议、服务拓扑、安全策略） |
| [docs/PLAN.md](docs/PLAN.md) | 现代内核客户端整体方案与分阶段计划 |
| [docs/p0-log.md](docs/p0-log.md) | P0 执行日志：登录链破解、DefenseMsgSeq 逆向、票据协议 |
| [docs/HANDOFF.md](docs/HANDOFF.md) | `[2/61]` 根因与修复、战斗验证、数据版本、背包/战力/字体/性能（Round 22–32） |

---

## 7. 迁移记录（2026-11-02）

- 原散落于仓库根目录的产物已合并到 `aola/`（client / docs / assets / patches / captures / automation / investigation）
- 本地 git 仓库根 = `D:\temp\ZCode\aola`；`.gitignore` 排除可重建的大件：
  `client/cache/`（资源镜像）、`client/web/fonts/`（字体副本，用 `make_cjk_font.py` 生成）、
  `client/docs/`（抓包/截图等工作产物，550MB）、`client/tools/node_modules/`
- 需要完整可跑的副本时：恢复 `client/web/fonts/`（见 §3 生成命令）并预热 `client/cache/`（首次打开页面自动回源）

原散落在仓库根目录的产物已整合进 `aola/`：

| 旧路径 | 新路径 |
|---|---|
| `aola_flash_investigation/ruffle-client/` | `aola/client/` |
| `aola_flash_investigation/REPORT.md` | `aola/docs/REPORT.md` |
| `aola_flash_investigation/{download,monitor,refresh-ext,scripts}/` | `aola/investigation/*` |
| `aola_flash/` | `aola/assets/` |
| `patched/` | `aola/patches/socketserver/` |
| `ss1/` | `aola/patches/bodies/` |
| `scripts/` | `aola/automation/` |
| `zone_live.etl` / `zone_real.etl` / `loginmod_body.bin` | `aola/captures/` |

所有文档与脚本内的绝对路径已同步替换；服务器验证：`/status`、`/game`、镜像资源均 200。

---

## 8. 许可

本项目代码与文档采用 [MIT License](LICENSE)（Copyright (c) 2026 The Aola Ruffle Client Authors）。

第三方组件与资源的许可另行遵循：

- `client/web/ruffle/`、`client/web/ruffle-stable/`：内置的 [Ruffle](https://ruffle.rs) 运行时，
  遵循其自身许可（MIT / Apache-2.0）
- `client/tools/node_modules/`：npm 依赖，遵循各包许可（如 `lzma` MIT）
- 游戏客户端资源（`client/cache/` 及仓库外的官方 SWF/数据）版权归原权利人，**不在本仓库分发**
- `client/web/fonts/`（由 `make_cjk_font.py` 从 Windows 系统字体生成）同样不入库，
  使用/再分发前请核对系统字体自身的授权条款
