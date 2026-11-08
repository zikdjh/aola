# 奥拉星现代内核客户端（aola）

用 **Ruffle(WASM) + 现代 Chromium 内核** 承载奥拉星 Flash 页游，替代已停服的 PPAPI Flash。
资源从官方源实时回源并本地缓存，游戏二进制 socket 经本地 `WebSocket ↔ TCP` 隧道转发。

> 状态：**P0 全部打通** —— 引导 / 登录 / 角色 / Socket / 世界装配 / 战斗 均已在本地客户端复现并验证。
>
> 近期性能与交付（Round 64–68，详见 §5 与 [HANDOFF](docs/HANDOFF.md)）：
> - **Round 64** 背包卡顿根因 = GPU 光栅化（`CommandBuffer::Flush` 每帧 93.8ms）；DPR 钳到 1 → 切宠 11.2→19.3fps
> - **Round 65 / 67** 精灵大立绘 `petmovie` 位图降采样（单片 -43%）；首版因**调色板位图行未 4 字节对齐**导致开背包崩溃，已修复并加自检护栏
> - **Round 66** 整合包改为一键 **`启动奥拉星.exe`**：无命令行窗口、网关后台运行、生命周期绑定浏览器
> - **Round 68 / 69** 渲染像素固定 **960×560**（比原 1152×672 再省 30.6%），渲染逻辑与官方对齐；
>   显示倍率改为页面「页面大小」五档选择（100%~200% = 960×560 ~ 1920×1120），自动记住
> - **Round 70** 版本自动跟版：清单网络优先 + 缓存按版本落盘，官方每周五更新后**下次启动自动拉新**，
>   不再落后版本（此前缓存被版本后缀剥离逻辑冻结）

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

**版本自动跟版（Round 70）**：官方每周五更新后，**下次启动自动拉新**——`start.xml`（增量版本清单）
等 9 个清单文件每次启动回源校验（失败回退缓存），资源按版本号落盘、新版本必然重新拉取。
无需手动清缓存。注意 `loader.swf` 是注入过 CJK 字体的补丁版，刻意不回源。

Cookie 失效时重打票据（测试号 26394032）：

```powershell
ego-browser nodejs -e "await import('file:///D:/temp/ZCode/aola/client/tools/round15_auto_login.mjs')"
```

### 整合包一键启动（Round 66：EXE 启动器）

整合包内双击 **`启动奥拉星.exe`** 即可，**没有任何命令行窗口**：

- 网关（`app\tools\serve.mjs`）在后台隐藏运行，stdout/stderr 落 `logs\gateway-YYYYMMDD.log`
- **网关生命周期 == 游戏浏览器生命周期**：关窗口 → 网关立刻退出 → 启动器退出；端口 8700 立即释放
- **Job Object（KILL_ON_JOB_CLOSE）**：启动器被强杀/崩溃时网关被连带杀掉，绝不留孤儿进程占端口
- 单实例：重复双击不会开第二套网关
- 启动参数：`--force-device-scale-factor=1`（Round 64 的 DPR 钳制）、`--window-size=1300,860`
  （125% 档可完整放下）、`--disable-features=CalculateNativeWindowOcclusion`；
  显示倍率不再由启动器强制（Round 69 起页面选择器自管）

源码与构建（源码入库，`dist/` 不入库）：

```powershell
# client/tools/launcher/AolaLauncher.cs   —— 单文件 C#，仅依赖 .NET Framework 4.x
pwsh -File client\tools\launcher\build.ps1     # 编译并部署到整合包根目录
```

> 旧的 `启动奥拉星.cmd` / `启动奥拉星-去特效.cmd` 已移入整合包 `backup\`（会弹命令行窗口，仅作回退）。
> 低配开关改由 `app\lowfx.json` + 游戏内「⚙ 特效开关」面板控制（见下）。

### 渲染像素与页面大小（Round 68 / 69）

**渲染逻辑与官方 Flash 运行时对齐：画布后备缓冲恒为 SWF 原生的 960×560（0.54MPx），
与窗口大小、页面倍率都无关** —— GPU 光栅化成本恒定，任何档位下不涨。

显示倍率由页面右下角**「页面大小」选择器**控制（Round 69），五档即时生效并自动记住（localStorage）：

| 档位 | 显示尺寸 | 说明 |
|---|---|---|
| **100%（默认）** | **960×560** | 官方原生 1:1 |
| 125% | 1200×700 | 1300×860 启动窗口可完整放下 |
| 150% | 1440×840 | 超出窗口出滚动条 |
| 175% | 1680×980 | 同上 |
| 200% | 1920×1120 | 同上 |

实现要点：`#stage` 的**布局尺寸恒为 960×560**（Ruffle 据此分配画布后备缓冲），
用 `transform: scale()` 做视觉放大 —— transform 不参与布局，所以画布不会被放大；
`#fit` 用 `margin: auto` 占位，放大超出窗口时滚动条可达（flex 居中会双向裁切滚不到）。
配合 `--force-device-scale-factor=1`（DPR=1），画布严格是 960×560。

- 优先级：**页面手选（localStorage 持久化）> URL `?scale=`（测试/强制用）> 默认 100%**；
  此前启动器强制的 1.3 倍已移除（Round 68 的按窗口自适应也不再保留）
- 鼠标坐标映射机制与 Round 68 验证的结论一致（Ruffle 按 `canvas.width/rect.width` 换算，
  rect 实时反映 transform 倍率），档位只改变倍率数值本身
- 放大是双线性插值，高倍率轻微软化属正常
- 页面内 `#log` 默认隐藏（日志在 `logs\gateway-*.log`），需要时 URL 加 `?log=1`
- 与 Round 67 的立绘降采样互不影响，可叠加

### 环境变量

| 变量 | 作用 |
|---|---|
| `AOLA_DROP_SERVICE=a,b,...` | 从 config.xml `<service>` 摘除指定服务（调试 / 特殊账号数据兼容） |
| `AOLA_TUNNEL_DEBUG=1` | 隧道双向 hexdump + 落盘 `client/docs/spike/tunnel_capture.bin` |
| `AOLA_LOCAL_FLOW=1` | 把 difference.xml 的 `isWebLogin` 翻成 false，走本地清单流程（对照实验用；依赖 LocalStore 内已存账号） |
| `AOLA_SOCKET_DEBUG=1` | 打开 config.xml `<socket><debug>`，输出 socket 层调试 trace |
| `AOLA_EFFECT_STUB=a,b,re:…` | 通用特效屏蔽：逗号分隔 urlPath 匹配项（普通项=子串，`re:` 前缀=正则），命中即换发轻量特效壳 |
| `AOLA_NO_ENTER_EFFECT=1` | 屏蔽亚比入场特效：① 战斗入场动画包 `pet/petfightnew_res.swf` —— Round 44 起换发「**12 个 Appear 类全部抽图**」的空壳（`GQAppearMovie`、`XinghuiAppearMovie`、`McMy/McVs/AI *PetAppear`、`*SuperPetAppear`、`AoYi/Legend/Degenerator`，类与时间轴不变；`AOLA_NO_APPEAR_MV=0` 可单独关掉 ①）；② 资源名含 `appear` 的特效（`gqpet|xinghuipet/<机制>/effect/*appear*`） |
| `AOLA_NO_BUFF_EFFECT=1` | 屏蔽光启 buff/机制特效（`gqpet/<机制>/effect/*`、`gqpet/<机制>/backgroundup/*`） |
| `AOLA_NO_XINGHUI_EFFECT=1` | 屏蔽星辉机制特效（`xinghuipet/<机制>/{effect,movie,status}/*`） |
| `AOLA_NO_PET_EFFECT=1` | 上面三个全开（光启+星辉的入场与 buff/机制特效） |
| `AOLA_NO_PET_BACKGROUND=1` | 屏蔽专属战斗场景：专属战斗背景 `petfightbackground/*`（不含 common）+ 专属技能背景 `skillbackground/*`，换 760B 空壳。**不再包含**背景加载/切换动画（Round 44 回退） |
| `AOLA_NO_PET_BACKGROUND=common` | 专属战斗背景改换通用背景 `petfightbackground/common.swf`；专属技能背景仍为空壳 |
| `AOLA_NO_BATTLE_FX=1` | （Round 44d 收敛版）屏蔽**战斗内通用特效**：只换 `pet/fightasyncres/effect/` 与 `pet/fightasyncres/crieffect_normal*`（`effect<ID>` 系列、暴击特写）→ 760B 空壳；保留 `waitbgmovie`（战斗页面加载动画）、`xinghuispiritskillbuttonmovie`（星辉技能按钮 UI）。⚠️ `revertpp/reverthp`、`xinghuikillbigmovie/*`、`gqkillbigmovie/*`、`petfightnew_skillwindword` 属「按类名取符号 + 等 `onMovieEnd` 回调」的资源，**任何开关都不会换壳**（换壳会让 4V2 选完技能就卡死，Round 44d 真机实锤） |
| `AOLA_NO_RES_PKG=1` | （Round 44c/44d，默认关闭，需与 `AOLA_NO_BATTLE_FX=1` 合用）把光启/星辉资源包 `petfightnew_gqresource`（1.36MB→176KB）、`petfightnew_xhresource`（450KB→10.6KB）换成「只保留 UI 面板类图形」的空壳。默认不开：包内可能有页面依赖的符号，先在 `AOLA_NO_BATTLE_FX` 下验证稳定再用 |
| `AOLA_NO_BG_ANIM=1` | （Round 44 新增，默认关闭）把**战斗页面的加载/等待动画** `fightasyncres/waitbgmovie/movie.swf` 与背景切换特效 `backgroundmovie/*` 也换 760B 空壳 |
| `AOLA_NO_STARTMV=1` | 屏蔽战斗开场「亚比登场」演出（`pet/petfightnew_startmv.swf` 1.30MB → 换发 16.6KB 空壳版本，类/子对象/时间轴保留）。**只影响演出画面**：战斗页面的加载界面（VS 画面）与加载动画 `waitbgmovie` 不受影响。⚠️ 整合包默认档**没有**开它（`app\lowfx.json` 里 `startmv` 是 `"off"`，网关只认 `"1"`/`"skip"`）；且文件优先于环境变量，要开启须把文件里该值改成 `"1"` |
| `AOLA_NO_STARTMV=skip` | 同上但直接换 760B 空壳（更彻底，有 `#1065`/`#1009` 风险，仅作对照） |
| `AOLA_NO_PETMOVIE_DOWNSAMPLE=1` | （Round 65）**关闭精灵大立绘位图降采样**。默认开启：宠物立绘 `peticon/movie/type0/petmovie<ID>_0..3.swf` 每片 1.5-1.7MB、100% 是位图（50 张 525×475），切换时要解压+上传约 52MB 纹理，是「点精灵等 1-2 秒」的主因。网关用盒式平均降采样后重压缩，SWF 结构不变 |
| `AOLA_PETMOVIE_SCALE=0.7` | 降采样比例（默认 **0.7**，视觉几乎无损）。`0.5` 更快更糊；`0.85` 更保守。单次请求可加 `?nodown=1` 跳过 |
| `GET/POST /lowfx` | （Round 45 建，58/59 更新）**游戏页面板的后端**：`GET` 返回 `{flags, file, env}`；`POST` 传 `{key:value,...}` 合并写 `client/lowfx.json`，秒级生效、无需重启网关。文件里的键覆盖环境变量 |

### 低配模式（Round 40–59：去入场/机制特效 + 去专属战斗场景 + 去战斗开场演出）

> **Round 58/59：面板收简为 4 个常用开关 + 双应用模式**。左下角 **「⚙ 特效开关」** 展开：
>
> | 开关（勾选 = 屏蔽） | 配置键 | 对应资源 |
> |---|---|---|
> | 光启进场特效 | `enterGq` | `gqpet/*appear*` 特效 URL + 登场包里的 `GQAppearMovie` |
> | 星辉进场特效 | `enterXh` | `xinghuipet/*appear*` 特效 URL + 登场包里的 `XinghuiAppearMovie` |
> | 光启buff特效 | `buffGq` | `gqpet/<机制>/effect/*`（不含 appear）、`backgroundup/*` |
> | 专属战斗背景 | `petBackground=1` | `petfightbackground/*`（非 common） |
>
> 登场动画包 `petfightnew_res` 按两开关组合四选一：双关=抽两个 Appear 类（2,072,753B）/
> 仅光启=gqonly（2,107,728B）/ 仅星辉=xhonly（2,096,470B）/ 全开=原样直发。
>
> 两个应用按钮：**「局内即时」**只写配置**不刷新**——开关在网关按"资源请求时"判定，之后新加载的
> 资源立即按新开关生效（已加载进 Ruffle 的不回收；登场/开场类下一场战斗见效）；**「应用并刷新」**
> 写配置并重载游戏（100% 干净）。
>
> 其余细粒度开关（`startmv`/`buffXh`/`fxEffect`/`fxCrit`/`bgSkill`/`bgLoading`/`bgSwapMovie`/
> `resPkg`/`gutBundles`）**不再出现在面板上**，但网关仍按 `client/lowfx.json` 里的键值生效
> （面板 POST 为合并写，不会动未列出的键；旧键 `enterScope`/`fxEnterUrls` 仅在文件未写新键时
> 参与推导）。手改 `lowfx.json` 秒级生效；删掉该文件即回到纯环境变量行为。
> `GET /lowfx` 可查看当前生效值（含 env/file 两份来源）。

⚠️ **两个刻意锁死、页面上显示为灰色的类型**：`revertpp/reverthp`（回血/回蓝演出）与
`xinghuikillbig*`/`gqkillbig*`（大招特写，以及 `petfightnew_skillwindword`）。它们是「按类名取符号 +
等 `onMovieEnd` 回调」的资源，换成空壳会让 **4V2 选完技能卡在「对方选择技能中，请等待…」**
（Round 44d 真机实锤），所以网关侧设有 `NEVER_STUB` 白名单，任何开关都不会碰。

战斗卡顿的主要来源之一是特效对象树（见 [Round 35](docs/HANDOFF.md)）。网关层提供特效屏蔽开关：
命中的 GET 特效资源改发缓存里最小的真实特效 `effect0.swf`（760B ZWS），**加载/播放/完成生命周期完整**，
所以战斗逻辑、伤害结算、回合推进都不受影响，只是不显示特效（画质换流畅）。
入场动画这类**打包在资源里、不按 URL 加载**的，则改发「保留类契约、只抽图像」的空壳（见下）。

> ⚠️ **不是所有特效都能换 760B 空壳**（Round 44d 真机实锤）：像 `revertpp/reverthp`、`xinghuikillbig*`、
> `gqkillbig*`、`petfightnew_skillwindword` 这些是「按类名取符号 + 等 `onMovieEnd` 回调」推进流程的，
> 换成空壳后回调永不到来 —— 表现为 **4V2 选完技能就停在「对方选择技能中，请等待…」**，且客户端之后
> 不再发任何请求。网关已内置 `NEVER_STUB` 白名单，任何开关都不会碰这类文件。

- 用法（开发环境）：
   `$env:AOLA_NO_ENTER_EFFECT=1; $env:AOLA_NO_BUFF_EFFECT=1; $env:AOLA_NO_XINGHUI_EFFECT=1; $env:AOLA_NO_BATTLE_FX=1; $env:AOLA_NO_STARTMV=1; node client/tools/serve.mjs 8700`
- 整合包（Round 66 起）：**只有一个入口 `启动奥拉星.exe`**，开关不再靠 `.cmd` 里的环境变量，而是：
  ① `app\lowfx.json`（配置文件，值为**文件优先于环境变量**）；② 游戏内「⚙ 特效开关」面板（面板会回写该文件）。
  当前默认档位（`app\lowfx.json` 实际生效值）：光启/星辉进场特效、含 `appear` 特效、光启/星辉 buff 特效、
  专属战斗背景（→ 通用星域背景）、专属技能背景抽图、背景切换特效、机制特效抽图、暴击特写 **均已屏蔽**；
  战斗内 `effect<ID>` 系列、加载动画、光启/星辉资源包、战斗开场「亚比登场」演出 **保持原样**
  （`startmv` 在文件里是 `"off"`，网关只认 `"1"`/`"skip"`，等价于不换壳）。
  战斗页面的加载界面与加载动画保持原样。
  旧的 `启动奥拉星.cmd` / `启动奥拉星-去特效.cmd` 已移入 `backup\`，仅作回退，**不要再当成主入口**。
- 匹配规则刻意避开 UI 资源（`gqpet/skill/*`、`xinghuipet/skill|soul/*`），避免打坏技能列表面板；
   不设置变量时完全不介入（零影响）。
- **哪些视觉属于哪一族（Round 44b/44c/44d 逐项定位）**：

  | 视觉 | 归属 | 用什么开关 |
  |---|---|---|
  | 光启/星辉登场的大号星爆、金色光柱 | `petfightnew_res.swf` 的 12 个 Appear 类 + `startmv` | `AOLA_NO_ENTER_EFFECT` + `AOLA_NO_STARTMV` |
  | 抗性护盾 / `抗性+xxx` 飘字 | `fightasyncres/effect/*`（缓存的 buff 特效） | `AOLA_NO_BATTLE_FX` |
  | 光启机制（神兵/万羽之潮/梦幻蝶月…） | `gqpet/<机制>/effect/*` | `AOLA_NO_BUFF_EFFECT` |
  | 星辉机制（神灵/通灵/战意…） | `xinghuipet/<机制>/{effect,movie,status}/*` | `AOLA_NO_XINGHUI_EFFECT` |
  | 专属战斗场景 | `petfightbackground/*`（非 common）+ `skillbackground/*` | `AOLA_NO_PET_BACKGROUND` |
  | 加载界面 / 加载动画 | `petfightnew.swf` 内 + `fightasyncres/waitbgmovie` | **保持原样**（要关用 `AOLA_NO_BG_ANIM=1`） |

- **机制特效/背景改用「保留类契约」的空壳（Round 48，修卡技能）**：`gqpet/<机制>/effect/*`、
  `xinghuipet/<机制>/*`、`skillbackground/*`、`petfightbackground/*`（非 common）这些 SWF 里有游戏**按类名取符号**的资源
  （例：`mmo.gqpet.wanyuzhichao.effect.Pet6000Stand_2`、`BackGroundAppearMovienianfei2026`）。以前一律换 760B 空壳会抛
  `resourceReflectError`，进而让「年费·祁」的专属追击技能**卡住不放**。现在改为预生成「只抽图像、类/时间轴/帧脚本不变」的空壳
  （`client/web/stub/gut/`，由 `client/tools/gut_swf_visuals.mjs` 生成），网关按路径命中就换发；
  **没有对应空壳时保持原样**（宁可留着特效，也不能缺类卡死）。当前 21 个：gqpet 机制特效 12、skillbackground 4、
  petfightbackground 3、xinghuipet 面板 2。重新生成：`node client/tools/build_gut_catalog.mjs`。
### 引擎级补丁：`petfightnew.swf`（Round 47 / 50）

有些演出**不在任何可替换的资源里**，而是主战斗模块 `petfightnew.swf`（5.6MB）用 ABC 自己画的。
这类只能对方法体做「等长替换」：把方法开头改成 `returnvoid`（或改成直接回调），其余字节填 `nop`，
**ABC 结构、偏移、异常表全不动**，所以对同一版本幂等、可回滚。

| 目标方法 | 改法 | 效果 |
|---|---|---|
| `MCPetContainer.showAppearEffect` | 换成 `this.dispatchGotPet(this._loacId); return` | 跳过亚比登场演出（光启金色光柱 / 白羽全屏 / 星辉登场），但出场回调照常 |
| `BackGroundViewHandler.changeSkillBackGround` | `returnvoid` | **不再加载专属战斗场景**（技能背景 / 年费背景），彻底避免白屏与缺类卡技能 |

用法：

```bash
node client/tools/apply_engine_patches.mjs      # 一键（重）打两个补丁；幂等
cp client/cache/aola.100bt.com/play/pet/petfightnew.swf.orig \
   client/cache/aola.100bt.com/play/pet/petfightnew.swf   # 还原原版
```

- 网关启动时会自动检查 `petfightnew.swf` 是否打了补丁（标记：补丁后 `showAppearEffect` 开头字节），
  没打就自动调 `apply_engine_patches.mjs` 补上 —— 所以**清缓存/换版本后不用手动处理**；
  想临时禁用：环境变量 `AOLA_NO_ENGINE_PATCH=1`。
- 明细工具：`patch_petfightnew_appear.mjs`（登场）、`patch_pf_methods.mjs` + `patch_targets_petfightnew.json`（通用方法 → returnvoid）。
- 已知未解决：光启的**属性飘字**（如「抗性+5299」）属于战斗信息层，尚未定位到具体方法。

- **怎么确认开关真的生效**（Round 44 新增）：`GET /status` 除了原来 4 个计数器，还会返回
  `stubs: {effect, bg, appearBundle, startmv, extra, battlefx}`、最近 60 条 `stubLog`（时间 + 路径 + 命中类型），
  以及最近 120 个 SWF 的 `recentSwf`（路径 + **实际发出体积** + 是否 760B 换壳）。
  打一场战斗后刷新 `http://127.0.0.1:8700/status`，看 `appearBundle`/`effect`/`battlefx` 是否增长即可 ——
  不用翻整屏网关日志，也不依赖客户端有没有报错。体积对照：`effect*` 760 = 已换壳、
  `petfightnew_res` 1,915,822 = 入场包空壳、`gqresource` 176,414 / `xhresource` 10,562 = 资源包空壳（需 `AOLA_NO_RES_PKG=1`）。
- 已验证：5 组开关 × 11 个真实/合成 URL 的匹配矩阵 **55/55 通过**（含“UI 不被误伤”“关闭零影响”）。
- 资源命名规律（取自 `petfightnew.swf` 的路径构造）：光启 = `gqpet/<机制>/effect/<名>effect_<亚比id>.swf`；
   入场类资源名含 `appear`（例：`gqpet/armorburst/effect/armorburstappeareffect.swf`、
   `xinghuipet/shenling/effect/xinghuishenlingappearmv`）。
- **光启/星辉入场动画（Round 44，关键修正）**：它们**不按 URL 单独加载**——
  聚合 1.7 万份真机日志后确认：`xinghuipet/*` 从未被请求，`gqpet/*` 只有 `<机制>/effect/*effect_<id>` 与
  `gqpet/skill/*`。真正的来源是每场战斗必拉的 **`pet/petfightnew_res.swf`（ZWS 2.10MB）**，
  它的 SymbolClass 里就有 `mmo.petfightnew.GQAppearMovie`（光启入场）与
  `mmo.petfightnew.XinghuiAppearMovie`（星辉入场），同包还有普通入场/换宠/死亡等动画。
  因此 Round 40 那种「按 URL 换 760B 空壳」对入场**完全无效**（这也是「没移除」的根因）。
  现在的做法：`gut_swf_visuals.mjs --only GQAppearMovie,XinghuiAppearMovie` 只把这**两个类依赖闭包内**
  的 158 个矢量形状换成空形状（位图 0 个；普通入场/换宠/死亡原样），778 个其它标签逐字节不变，
  550 个 DefineSprite 的体逐字节不变 —— 类、子对象、时间轴都还在，所以不会 `#1065`/`#1009`，
  只是这两段入场演出变成空画面。产物 `client/web/stub/petfightnew_res.gut.swf`。
  重新生成：`cd client/tools && node gut_swf_visuals.mjs ../cache/aola.100bt.com/play/pet/petfightnew_res.swf ../web/stub/petfightnew_res.gut.swf --only GQAppearMovie,XinghuiAppearMovie`
- **专属战斗场景**（Round 41，Round 44 收窄）：`AOLA_NO_PET_BACKGROUND` 现只覆盖 ——
   ① 专属战斗背景 `petfightbackground/<名字>`（`starshinecity`、`thinktoweroffire`、`hexagrampalace`…，
   服务端按精灵/场景下发；通用基础背景是 `petfightbackground/common.swf`，503KB）；
   ② 专属技能背景 `skillbackground/*`（年费/专属，322–694KB）。
   实测专属背景仅 37–47KB（叠加层），所以 `=1` 换 760B 空壳比叠 common 更省；`=common` 则换通用背景。
   已验证：3 种取值 × 7 个 URL **16/16 通过**（特效矩阵回归 55/55）。
   注意：这些 SWF 内隐含类名（如 `mmo.petfight.StarShineCity`），替换后客户端可能报 `#1065`
   （特效类同款处理已在 Round 35 验收，战斗可继续）—— 观感**需实战确认**。
- **战斗页面加载动画（Round 44 回退）**：`pet/fightasyncres/waitbgmovie/movie.swf`（83KB）与
  `backgroundmovie/*` 原本在 Round 42 被并进 `AOLA_NO_PET_BACKGROUND` 一起换空壳，用户要求保留，
  已从该开关摘出；需要再去掉时用独立的 `AOLA_NO_BG_ANIM=1`。
- **战斗开场「亚比登场」演出**（Round 43）：开关 `AOLA_NO_STARTMV`。
  `pet/petfightnew_startmv.swf`（ZWS 1.30MB）就是战斗开场那段演出：主战斗模块 `petfightnew.swf` 用
  `playStartMv()` 加载它，再 `getDefinitionByName("mmo.petfightnew.movie.StartMovie")` 取符号类
  （该类 `extends MovieClip`，实例引用子对象 `mcMyPlayer/mcVsPlayer/spPlayer`，构造函数里
  `addFrameScript(25, stop)`）—— 所以**换 760B 空壳会 #1065 / #1009**，不能照搬特效的做法。
  这里改发 `client/web/stub/petfightnew_startmv.gut.swf`（压缩后 16.6KB / 解压 43.1KB）：由
  `client/tools/gut_swf_visuals.mjs` 生成，**ABC / SymbolClass / 132 个 DefineSprite 与「每个 sprite 的
  帧数序列」逐个保持原样**，只把 47 个位图换成 1×1 全透明、119 个矢量形状换成空形状
  （解压 1.51MB → 43.1KB）。演出照旧播完、画面是空的：类契约不变，也不再解码/绘制那 1.43MB 图像。
  生成器带**结构化自检**（逐标签复解：形状体必须被完整消费含 `EndShapeRecord`、位图像素数 == 宽×高×4、
  End 后无残余），不通过会以退出码 2 失败 —— 空壳 SWF 不合法会导致类注册失败、战斗卡白屏。
  已验证：矩阵 3 种取值 × 4 个 URL（裸名 / `?v=` / `~版本号`）**15/15 通过**；真机 4V2 实战进场正常、
  日志无 `StartMovie`/`definition tag`/`Unexpected EOF` 报错。
  ⚠️ 匹配规则**不要用 `$` 锚定 urlPath**：游戏把版本后缀插在扩展名之前（`名字~261029175809261.swf`），
  且日志打印会 `cacheKey()` 抹掉它，写成 `\.swf$` 会静默漏匹配。
  重新生成：`cd client/tools && node gut_swf_visuals.mjs ../cache/aola.100bt.com/play/pet/petfightnew_startmv.swf ../web/stub/petfightnew_startmv.gut.swf`

---

## 2. 目录结构

```
aola/
├─ README.md                     ← 本文件（总入口）
├─ LICENSE                       MIT 许可证
├─ docs/                         ← 项目文档（入库）
│  ├─ REPORT.md                  Flash 客户端架构调查报告（2026-10-31）
│  ├─ PLAN.md                    现代内核客户端开发规划（Tauri/Ruffle 方案）
│  ├─ p0-log.md                  P0 可行性冲刺执行日志（第 1–15 轮）
│  ├─ HANDOFF.md                 攻坚交接日志（Round 22–70：世界/战斗/背包/字体/性能/整合包/启动器/页面大小/版本同步）
│  └─ screenshots/               关键里程碑截图
├─ client/                       ← 客户端本体
│  ├─ tools/serve.mjs            本地网关：镜像/回源/网关改写/WS↔TCP 隧道/DS 加密补位/特效开关/立绘降采样（单文件零依赖）
│  ├─ tools/petmovie_downsample.mjs  精灵立绘位图降采样（单文件/批量/扫描；网关内嵌同款实现）
│  ├─ tools/launcher/            一键启动器源码（AolaLauncher.cs + build.ps1，产出整合包 exe）
│  ├─ tools/*.mjs|py|ps1         补丁工具（SWF 字节补丁）、逆向工具（ABC 反汇编）、CDP/窗口辅助
│  ├─ web/game.html              Ruffle 宿主页（EI 桩、Cookie 组合、登录桥、socketProxy、字体源）
│  ├─ web/mirror-inject.js       页面级请求改写注入
│  ├─ web/ruffle/                Ruffle selfhosted 运行时（当前 0.8.0-nightly.2026.11.4）
│  ├─ web/ruffle-bisect/         版本二分副本（2026-10-24 / 10-31 / 11-04；本地不入库）
│  ├─ web/ruffle.old-10-31/      升级前运行时备份（本地不入库）
│  ├─ web/fonts/                 生成中文字体 6 件 99MB（不入库；make_cjk_font.py 可重建）
│  ├─ cache/                     全量资源镜像 606MB（含全部已打补丁 SWF；不入库，删除即补丁失效）
│  └─ docs/spike/                过程产物（432+ 截图、反汇编 .bin、stutter-20261104 归因数据；不入库）
├─ assets/                       官方入口页与引导 SWF 样本（play.html/aola.js/start.swf）
├─ patches/                      socketserver 补丁前后 SWF / 反汇编 bodies / 原始备份
├─ captures/                     抓包与解压证据（zone_live.etl / zone_real.etl / loginmod_body.bin）
├─ automation/                   自动化脚本 357 个（round21–286：登录/战斗/性能采样/整合包 CDP 驱动）
├─ investigation/                早期调查产物 8.4MB（monitor / refresh-ext / download / scripts）
├─ reverse/                      逆向数据 30MB（本地不入库）
│  ├─ fws/                       游戏数据 SWF × 6（pf/pm/itf/mde/pcn/play）
│  └─ analysis/                  ABC 反汇编分析 txt × 27
├─ dist/                         分发构建产物 2.6GB（本地不入库）
│  └─ aola-launcher-pack/        奥拉星整合包（zip 1.03GB + 解包目录：内嵌 Chromium 157 + 便携 Node 22 + 全量缓存）
│     └─ AolaStarLauncher/
│        ├─ 启动奥拉星.exe        一键启动器（无窗口；网关后台；生命周期绑定浏览器）
│        ├─ 说明.txt              使用/调参/排错说明（唯一权威用户文档）
│        ├─ app/                  网关 + 页面 + lowfx.json（低配开关配置）
│        ├─ runtime/              node 22 + chromium
│        ├─ profile/              浏览器配置（登录态）
│        ├─ logs/                 gateway-YYYYMMDD.log
│        └─ backup/               旧的 .cmd 启动脚本（回退用）
└─ temp/downloads/               二分/内核原始下载包 589MB（本地不入库，可随时删除）
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
但 **字体数量会显著拖慢 Ruffle**（见下），当前只加载必要的最小集（8 个）：

| 字体文件（`client/web/fonts/`） | FULL_NAME（=Ruffle 注册名） | bold | 来源 / 用途 |
|---|---|---|---|
| `songti.ttf` | 宋体 | 否 | **simsun.ttc face0**；背包/通用文本（**精灵名字的关键**） |
| `songti_b.ttf` | 宋体 | 是 | simsun.ttc face0 副本 + 粗体标志 |
| `yahei.ttf` | 微软雅黑 | 否 | **msyh.ttc face0**；HUD |
| `yahei_b.ttf` | 微软雅黑 | 是 | msyhbd.ttc face0 |
| `yahei_bold.ttf` | 微软雅黑 Bold | 是 | msyhbd.ttc face0；部分控件直接请求该族名 |
| `hanyi.ttf` | 汉仪旗黑-80S ExtraBold | 否 | simhei 副本；精灵卡/标签 |
| `hanyi60.ttf` | 汉仪旗黑-60S Regular | 否 | simhei 副本；达人王等活动面板任务文本 |
| `lingxin.ttf` | 汉仪菱心体简 | 是 | msyhbd.ttc face0 副本；背包预设阵容名等展示文本 |

**Ruffle 设备字体匹配规则**（实锤自源码 `web/src/builder.rs::register_ttf_face_by_name`，Round 39）：

- 注册名 = 字体文件的 **FULL_NAME（nameID 4）**；bold/italic 由文件里的 OS/2·head 标志解析；
- SWF 请求的是「族名 + bold」，所以**粗体字面的 FULL_NAME 必须等于被请求的族名**。
   写成「宋体 Bold」时，请求「宋体」+bold 查不到 → 回退内置 `Noto Sans`（**无 CJK**）→
   中文整段消失、只剩数字（典型症状：「任务名全是 1」）。
- `defaultFonts` 的 key 只能是 `sans/serif/typewriter/japaneseGothic[|Mono]/japaneseMincho`
   这些固定槽位，值是**已注册设备字体名的数组**（如 `["宋体"]`），**不能写 URL**；
   中文 key 或字符串值都无效（字符串会被按字符拆成字体名）。

生成方式（改 name 表，保留全部字形；`.ttc` 可传 faceIndex；末两参为 fullName / bold）：

```powershell
# 常规字面
uv run --no-project --with fonttools -- python client\tools\make_cjk_font.py `
   C:\Windows\Fonts\msyh.ttc client\web\fonts\yahei.ttf "微软雅黑" Regular "AolaCJK-YaHei" 0
# 粗体字面（FULL_NAME 必须 = 族名 + bold=1）
uv run --no-project --with fonttools -- python client\tools\make_cjk_font.py `
   C:\Windows\Fonts\msyhbd.ttc client\web\fonts\yahei_b.ttf "微软雅黑" Bold "MicrosoftYaHei-Bold" 0 "微软雅黑" 1
```

配套改动：

1. `client/tools/serve.mjs` 的 `/fonts/*` 路由：优先 `client/web/fonts/`（本地副本，`cache-control: no-store`），
    回退 `C:\Windows\Fonts` 白名单（simhei/simsun/msyh/msyhbd/Deng）
2. `client/web/game.html`：`fontSources` 列上述 8 个文件；`defaultFonts` 把
    `sans/serif/typewriter/japanese*` 全部指向 `["宋体"]`（默认回退也能拿到中文字形）
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
- **进不去世界 / 装配冻结（Round 70c/70d，已修复）**：清缓存或版本更新曾引入四层问题 ——
  ① 登录 Cookie 是会话级（已持久化）；② 世界装配用 POST 拉库文件绕过补丁缓存（已修）；
  ③ 版本化 URL 绕过补丁站点（已折叠到钉死文件）；④ **materialdata.swf 必须用配套旧版
  （947244B，已钉死）** —— 换上游最新版会让 ToteService 的 onInited 链
  `getDefinitionByName("ToteValueSeason")` #1065，装配冻结在 15/61。
  ⚠️ 未来清缓存必须保留 PATCH_PROTECTED 七件套（见 HANDOFF Round 70d），
  其中任一文件丢失都会以不同形式卡死引导链/装配链。
- 稀有 `71_24/71_25` Ruffle 脚本超时
- **背包操作卡顿（Round 64 定位，Round 68 再降 30% 像素）**：真因是 **GPU 光栅化瓶颈** ——
  Ruffle 按 `devicePixelRatio` 分配 canvas 后备缓冲，`dpr=1.5` 时舞台实际渲染
  **1728×1008（1.74MPx，比 CSS 面积多 125% 像素）**；GPU 进程 `CommandBuffer::Flush` 串行执行 WebGL 命令
  平均 **14.4ms/次、每帧 93.8ms**，把帧间隔钉死在 ~94ms（10.6fps）。
  **Round 64 修复**：`game.html` 把 DPR 钳到 1（`?hidpi=1` 可关）+ 启动器加 `--force-device-scale-factor=1`
  → 背包切宠 **11.2→19.3fps、帧间隔 92→54ms**；连续 8 次操作压测 fps 稳定 20-21、
  最长帧 92ms（此前 15321ms，改善 166 倍）。
  **Round 68 再进一步**：渲染像素固定为原生 **960×560（538K px）**，
  相比 Round 64 的 1152×672（774K px）**再省 30.6%** 光栅化量。
  **Round 69**：显示倍率改为页面「页面大小」五档选择（100%~200%，默认 100% = 官方原生 1:1），
  倍率只影响显示 transform，渲染像素在所有档位下恒为 960×560。
  ⚠️ Round 61-63c 的「渲染提交、脚本耗时=0」结论**已被推翻**（当时 `vis=hidden`，Ruffle 根本没跑帧）。
  详见 HANDOFF Round 64 / 68 与 `client/docs/spike/bag-perf-round64-20261107/`。
- **切精灵"等 1-2 秒"（Round 65 定位，Round 67 修掉一次崩溃）**：精灵大立绘由 4 个 petmovie 分片组成
  （每片 1.5-1.7MB，内部 100% 位图，共 50 张 525×475），切换时 Ruffle 要解压 50 次 zlib、
  展开并上传约 52MB 纹理 —— 这是延迟的物理来源。网关现按 `AOLA_PETMOVIE_SCALE`（默认 0.7）
  做盒式平均降采样，单片体积 -43%。
  ⚠️ Round 65 首版漏了「调色板位图每行必须 4 字节对齐」，导致开背包崩
  （`panicked at render/src/utils.rs:339 index out of bounds` in `decode_define_bits_lossless`，
  触发点 `PetMovie5999_0`）。Round 67 修好：源读取步长与输出写出步长都按 `ceil(x/4)*4`，
  并对每个位图做长度自检，不符则**整文件放弃降采样、原样放行**。
  全量 2217 张原始 + 2217 张降采样位图逐张验证长度严格匹配。
  想关掉：`AOLA_NO_PETMOVIE_DOWNSAMPLE=1`；调比例用 `AOLA_PETMOVIE_SCALE`（0.5 更快 / 0.85 更清晰）。
  ⚠️ 端到端秒数尚未客观测量到位（WebGL canvas 读不回像素、点击坐标不稳、`player.load()`
  有 800ms 固定开销），最终以实机手感为准 —— 见 HANDOFF Round 65 §4 / Round 67。
- IAB 仍有**面板可见性分级节流**（240/60/10/1fps 四档随遮挡/失焦切换，`visibilityState` 会撒谎）；
  游戏渲染尖峰也会同步拖慢 ZCode 编辑器（Electron gpu-process 与 IAB WebView2 共享同一块集显 + DWM 合成队列）。
  仍建议用整合包启动器玩（`--disable-features=CalculateNativeWindowOcclusion` + 完整渲染路径）。
- 4V2 技能窗口的主线程卡顿已由低配特效开关大幅缓解（Round 35：特效对象树占 3/4，`lowfx.json` 可控）。
- 少量 `Unknown device font "SimSun" / "Microsoft YaHei" / "微软雅黑"(bold)` 告警，未见可见缺字
- 性能敏感点：**`fontSources` 字体数量**（14 个时切精灵阻塞 5–6s；5 个时 0.1–0.2s）。当前 **8 个**
   （Round 39 为修「达人王任务名全是 1」等中文丢字，新增 `hanyi60.ttf` / `yahei_bold.ttf`），
   **尚未在 8 个字体下重测切精灵 / 魂卡编辑帧率**——若要优化，优先减少字体数量。

---

## 6. 文档索引

| 文档 | 内容 |
|---|---|
| [docs/REPORT.md](docs/REPORT.md) | 官方客户端架构（引导链、协议、服务拓扑、安全策略） |
| [docs/PLAN.md](docs/PLAN.md) | 现代内核客户端整体方案与分阶段计划 |
| [docs/p0-log.md](docs/p0-log.md) | P0 执行日志：登录链破解、DefenseMsgSeq 逆向、票据协议 |
| [docs/HANDOFF.md](docs/HANDOFF.md) | `[2/61]` 根因与修复、战斗验证、数据版本、背包/战力/字体/性能/整合包/一键启动器/渲染与页面大小/版本同步（Round 22–70） |

---

## 7. 迁移记录（2026-11-02）

- 原散落于仓库根目录的产物已合并到 `aola/`（client / docs / assets / patches / captures / automation / investigation）
- 本地 git 仓库根 = `D:\temp\ZCode\aola`；`.gitignore` 排除可重建的大件：
  `client/cache/`（资源镜像）、`client/web/fonts/`（字体副本，用 `make_cjk_font.py` 生成）、
  `client/web/ruffle-stable/`（旧版备用运行时）、`client/docs/`（抓包/截图等工作产物，550MB）、
  `client/tools/node_modules/`
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

- `client/web/ruffle/`：内置的 [Ruffle](https://ruffle.rs) 运行时（nightly，遵循 MIT / Apache-2.0）；
  旧版备用运行时 `ruffle-stable/` 不入库，需要时从 Ruffle 官方 release 重新下载
- `client/tools/node_modules/`：npm 依赖，遵循各包许可（如 `lzma` MIT）
- 游戏客户端资源（`client/cache/` 及仓库外的官方 SWF/数据）版权归原权利人，**不在本仓库分发**
- `client/web/fonts/`（由 `make_cjk_font.py` 从 Windows 系统字体生成）同样不入库，
  使用/再分发前请核对系统字体自身的授权条款
