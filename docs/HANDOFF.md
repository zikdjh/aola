# Round 22 World Loading [2/61] Investigation Handoff

Date: 2026-11-02 18:50 CST

## ⚠️ 勘误（2026-11-02 接手时字节级验证）

本文"Root Cause (CONFIRMED)"一节**结论有误**：

- `patch_seq4.mjs` 的补丁目标本来就是 **socketserver1.swf / socketserver.swf**（DefenseMsgSeq/onLoaderDeq 类在这两个库 SWF 里，不在 play.swf）。
- 字节级验证：cache 中 `library/socketserver.swf` 与 `library/socketserver1.swf` **已含 patch_seq4 全部补丁**
  （next-arith 常量公式版 / overflow-911 / num4->911 均 FOUND，原始字节全部消失；部署时间 2026-11-01 14:03:28，
  与 `patched\socketserver1.swf` 逐字节一致）。`materialservice.swf` 补丁也在 cache（11-01 14:24）。
- 在 play.swf 上跑 patch_seq4 得到 0/7 是**目标文件搞错了**——play.swf 从来不含这些字节码。
- "Blocker: Patch Patterns Don't Match" 与 "ZWS Format Blocker" 对本问题而言均非阻断
  （ZWS/LZMA 解压在第十轮已解决：props+size 转 lzma_alone → xz，见 p0-log 第十轮）。
- game.html 已回退为 `/ruffle/ruffle.js` ✓。

**真实状态：所有已知补丁就位后，世界加载仍卡 [2/61]（STEP2_AFTER_SCENE=2）——卡点尚未定位，
下一轮应从 service init 阶段的模块装配/服务注册入手（ExtHandler dispatch 报错线索见 p0-log 第十五轮遗留）。**

## 🔧 Round 23（2026-11-02 20:20–21:00 CST）接手复现与修复

### 1. 修复：登录链路被实验开关打断（真因，非 [2/61] 本身）
`serve.mjs` 的 `transformText()` 默认把 difference.xml 的 `<isWebLogin>true` 翻成 `false`，
导致 `user/login.swf::Main::startPlay` 走「本地流程」分支（依赖 LocalStore 里的账号），
而本 profile 的 LocalStore 为空 → 停在手动登录表单，全链无 newLogin.jsp / query_role_info。

- 字节码证据：`loginmod_body.bin` 中 `startPlay` 第 45–54 字节读 `ConfigReader.isWebLogin`，为 false 直接跳转。
- `isWebLogin` 的赋值点：`loader_body.bin::mmo.config::ConfigReader::onLoadDiffXmlSuc`（`<isWebLogin>` 节点值 == "true"）。
- 修复：`AOLA_WEB_LOGIN=1`（旧）→ 现改为**默认保留官方网页登录**，只有 `AOLA_LOCAL_FLOW=1` 才翻转。
- 效果：`goto /game` → 32s 出现 AutoLoginPage → 点「进入游戏」→ newLogin.jsp → serverslist → 快速开始 → 进世界 ✅

### 2. [2/61] 已稳定复现（证据齐）
- 截图：`r25b_world_t20.png` / `r25b_world_t60.png`（3% [2/61]，40s 无变化）
- 隧道抓包：`../client/docs/spike/tunnel_capture.bin`，**301 条记录 = 22 C2S / 279 S2C**；
  S2C 含 5440/6800/14960/16320/5440/10880… 大包，客户端全部收到
- 页面 `trace()` 输出：18→120→324→732→1548→3180→6444→12972→26028→52140，
  之后 120→324 后**彻底静默**（20:55:49 起无任何日志）
- 拖拽/点击场景无效，但角色可移动 ⇒ **渲染循环活着，卡的是服务初始化/消息管线**
- Ruffle 唯一异常信号：`Encountered stub: AVM2 flash.display.ShaderJob constructor` 与
  `.start() with waitForCompletion=false`（20:55:48，连接前 1s）。全 cache 扫描确认：
  **只有 socketserver.swf / socketserver1.swf 引用 ShaderJob**

### 3. 服务索引定位
`config.xml <service>` 恰好 **61 项**，0-based 索引 2 = **ItemService**
（0 FontService / 1 DebugDataService / 2 ItemService）。
历史结论「item 5609 缺失断链」已**排除**：cached `materialservice.swf` 中该 no-op 补丁确认生效
（ABC @23222+147936 处方法体已替换为 `d0 30 47` + 180×`02` nop）。

### 4. 下一步建议（按性价比）
1. socketserver 解密/排队的第二条 `ShaderJob` 等待链（patch_seq4 只 nop 了 `onLoaderDeq` 首部）
2. 在 `ExtHandler` 分发处插桩（或给 Ruffle 打开 AVM2 异常日志），抓 ItemService 初始化等待的消息 id
3. 用 `tunnel_capture.bin` 离线解包 S2C，定位对应 ItemService 的那条消息体（是否 AMF 解码失败）

### 5. 复现命令
```
# 终端 A（默认官方网页登录 + 隧道抓包）
node aola/client/tools/serve.mjs 8700
# 需要 [2/61] 本地流程对照时：AOLA_LOCAL_FLOW=1
# 终端 B：同步票据（Cookie 失效时重打）
ego-browser nodejs -e "await import('file:///D:/temp/ZCode/aola/client/tools/round15_auto_login.mjs')"
```

## 🏆 Round 23–24（2026-11-02 21:00–22:15 CST）：[2/61] 攻破，世界完整进入

### 根因（字节码级实锤）
`ItemService.init()` → `initMyItems()` → `initItemData(params)`。round22 的
`patch_noop_inititemdata.mjs` 把**整个方法体**替换成 `getlocal0/pushscope/returnvoid + nop`，
连带删掉了末尾的 `AbstractMaterialService.onInited()` —— 服务永不上报"初始化完成"，
BootLoader 于是一直停在 `<service>` 列表第 3 项（0-based index 2 = ItemService）：
**没有异常、socket 正常、进度永远 2/61**。

### 验证该假设的判定实验
`AOLA_DROP_SERVICE=ItemService`（从 config.xml `<service>` 摘掉该服务）→ 进度立刻
`2/61 → 12/60`，并暴露出真实异常链，证明卡点确为 ItemService 的 init 未完成。

### 正确补丁（../client/tools/patch_itemservice_skipmissing.mjs）
把 `initItemData` 里「物品缺失 → throw」的分支改为 **跳到循环尾（hasnext2）**，
其余物品照常 `addMyMaterial` 注册、末尾照常 `onInited()`：
```asm
105: findpropstrict Error; pushstring "没有 "; getlocal5; add; constructprop Error; throw
  →  10 20 00 00 | 02×10     ; jump → hasnext2（offset 相对下一条指令）
```
特征串两处同构（ItemService / PlantItemService），用前置 `2a 63 08 20 14` 精确区分。
补丁后：`2/61 → 13/61`（21%）。

### 数据/版本一致性教训
- 缓存里 `library/materialdata.swf` 必须用**原 10-31 版本**（923749B）。换成官方最新
  954911B 会让 `ToteValueSeasonData` 构造参数 6 vs 调用方 5 失配（Error #1063）。
- `material/materialservice.swf` 用**官方 11-02 版本 + skip 补丁**（102939B）。
  原 10-31 版本缺 `initItemData` 原始逻辑（已被 round22 破坏），官方新版完好。
- ZWS(LZMA) 解压已解决：布局 = `[8B header][4B compressedLen][5B props][data]`，
  npm `lzma` 纯 JS 可用（装在 `%LOCALAPPDATA%\Temp\aola-lzma`）。

### 特殊账号数据缺失（非致命，逐项绕开）
测试号 26394032 带若干**客户端未定义**的数据：物品 5609/5646/353/19、头像框 666。
正确做法是 skip 而非 throw；对仍会硬抛错的服务，用 `AOLA_DROP_SERVICE` 摘除：
```
AOLA_DROP_SERVICE="PetCard3Service,HKService,HeadFrameService,ToteService,CrystalKeyService"
```

### 最终结果（全链打通）
`57/57` 装配完成 → 进入世界：场景「亚比之殿」、顶部战斗力 662908、左侧活动图标、
底部图标栏（亚比背包/好友/战队/家园/仓库）、聊天、NPC 对话全部渲染正常。
截图：`screenshots/r45_world_clean.png`（过程截图见 `../client/docs/spike/r4*.png`）。

### 现存小问题
- `baseservice/faceres/face_res` 旧版缺 `face88/face89` → 聊天表情渲染报 #1065（不阻塞）
- 5 个被摘除服务对应功能（宠物卡3/会员卡/头像框/礼盒/晶钥）暂不可用

## ⚔️ Round 25（2026-11-02 22:45–23:40 CST）：战斗验证

### 战斗入口链路（已跑通）
底部栏 `地图`(stage 480,528) → `太空竞技场` → 场景内「竞技场对战得盾皮」NPC(stage 180,365)
→ `去对战空间` → `休闲模式` → `单亚比对战` → `匹配` → `开始匹配` → **VS 对决算面**
（战斗力 64945 vs 100872）→ 战斗启动过场动画。

> 提示：UI 是 Flash 画布，坐标换算 `CSS = (240,8) + stage`；`page.screenshot({clip:{x:240,y:8,width:960,height:560}})` 可得到 1:1 画面，便于用像素坐标点 UI。

### 修复：战斗启动被异常打断
`FightData.resetDomainIfStale()` 调用 `InspectorErrorWatch.instance.tagDomain(...)`，
Ruffle 下抛 `Error #1069: Property tagDomain not found`，异常从
`StartMovie.initSendLoading` 冒出，导致战斗卡在 VS 界面不动。

- 该方法仅做错误归属标记，返回 Boolean；补丁：
  [patch_fightdata_resetdomain.mjs](file:///D:/temp/ZCode/aola/client/tools/patch_fightdata_resetdomain.mjs)
  将其方法体（42B）改为 `getlocal0/pushscope/pushfalse/returnvalue`（= return false）。
- 目标模块 `pet/petfightnew.swf`（ZWS/LZMA，解压后 6.57MB），补丁后以 CWS 回填 cache。

### 战斗结果（实锤）
战斗打完后赛季面板统计更新：**单亚比对战 当前胜场 2 / 当前连胜 2 / 秒杀 1** ——
说明战斗流程（加载 → 回合 → 结算）在本客户端内完整跑通并取得胜利。

### 遗留噪音（不阻塞）
- `onPlayerEnterRoom` 参数数量不匹配（#1063，切场景时偶发）
- `没有 68`（特殊账号物品定义缺失）
- `71_24/71_25` 偶发 `A script in this movie has taken too long`（Ruffle 脚本超时）
- `face88/face89` 缺失（faceres 旧版）
- 深夜时段休闲模式匹配偶发超时（对端不足），与客户端无关

## 🔤 Round 26（2026-11-03）：登录页角色名显示不全（中文设备字体）

**现象**：自动登录页角色名只显示首字「2」，真实全名 `2之猎人徒`（保存在 code 里）。
**排除数据问题**：facade 日志里 `query_role_info` 回包是完整的
`0,352318440,2之猎人徒,1793635052000,...` —— 字符串没问题，是**渲染丢了汉字**。

**根因**：SWF 以设备字体名「宋体 / 微软雅黑 / 方正粗圆简体」取字；Chrome 没有这些设备字体，
Ruffle 按字体**族名**匹配（系统字体族名是 `SimSun`），中文名对不上 → 回退到不含 CJK 的默认字体
→ 汉字整段渲染为空白，只剩前面的数字。

**修复三件套**（缺一不可）：
1. `client/tools/serve.mjs` 增加 `/fonts/*` 路由，直接外供 `C:\Windows\Fonts`（白名单校验）
2. `client/web/game.html`：`fontSources` + `defaultFonts`（宋体→simsun.ttc / 微软雅黑→msyh.ttc / 方正粗圆简体→simhei.ttf）
3. `client/tools/patch_fontname_simsun.mjs`：把缓存 SWF 里「宋体」(UTF-8 6B) **等长**替换为 `SimSun`(6B)
   —— 命中 8 个文件 175 处（`user/login.swf` 14 处、`pet/petfightnew.swf` 93 处、`legendpet/soul/legendsoulpanel.swf` 62 处等），
   原文件自动备份为 `*.prefont`

**结果**：登录页完整显示「2之猎人徒」，其余中文文本同步恢复。

## 🎒 Round 27（2026-11-03）：亚比背包无法打开

**现象**：世界内点击底部「亚比背包」无反应（面板不出现），客户端无可见提示。
**抓取方式**：`ego-browser` 重走登录→选服→快速开始，用 `stage.getBoundingClientRect()` 换算后
点 stage(925,525)，截图为 `r94~r101_*.png`（`client/docs/spike/`）。

**根因链（全部是「账号带 materialdata 未定义数据」→ null 解引用，逐层排除）**：

1. `AOLA_DROP_SERVICE` 摘掉了 `PetCard3Service` → `PetBattleEffHelper.getEquipTotalBE()` 空引用
2. 恢复 PetCard3Service 后，其 `initDatas` 在 `UserPetCard3/UserMaterial` 构造处抛 #1009
   （宠物卡 id 无定义）→ 服务永不 `onInited`，装配停在 13/57
3. 修好后 `getPetCard3SingleExtraEff()` 空引用（同一循环）
4. HKService 摘除 → `HKHelp.getPbiHkBattle()` 空引用；恢复后其 `initItemData` 因「没有 350」throw
   → 装配停在 52/58
5. 修好后 `getPbiHkBattle` 循环条件 `getHKDataById().wordDataAry` 仍为空引用

**修复（5 个等长字节补丁，全部保留 CCR/栈平衡）**：

| 工具 | 目标 | 做法 |
|---|---|---|
| `patch_petcard3_skipmissing.mjs` | `materialservice.swf` `PetCard3Service.initDatas` | `getPetCardById` 为 null → `iffalse` 跳到 `hasnext2` |
| `patch_hkservice_skipmissing.mjs` | `materialservice.swf` `HKService.initItemData` | 「没有 N」throw 块 → `jump hasnext2`（用前置 `setlocal 6` 与 Item/PlantItem 的 6 处同构特征区分） |
| `patch_equiptotalbe_guard.mjs` | `interfaces.swf` `getEquipTotalBE` | petCard 为 null → `pushbyte 0 / returnvalue` |
| `patch_petcard3_extra_skip.mjs` | `interfaces.swf` `getPetCard3AddByBriefInfo` | 跳过 `getPetCard3SingleExtraEff` 调用，结果置 0 |
| `patch_hkhelp_skip.mjs` | `interfaces.swf` `getPbiHkBattle` | `pop ×2 + jump`（**必须弹栈**，只跳会 VerifyError #1030） |

**服务配置变更**：`AOLA_DROP_SERVICE` 从 5 个缩到 3 个：
```
AOLA_DROP_SERVICE="HeadFrameService,ToteService,CrystalKeyService"
```
（PetCard3Service / HKService 已恢复；HK 加成与宠物卡 extraEff 按 0 计，与之前摘除时一致）

**结果**：亚比背包面板正常打开，宠物列表/队伍槽位渲染正常（截图 `r100_bag.png`、`r101_bag_settled.png`）。

**遗留**：`PetDetectInfo/setPetCarryItem()` 仍报 #1009（宠物详情页「携带物品」栏），不阻塞面板打开，未处理。

## 🔤 Round 28（2026-11-03）：背包里精灵名字显示为空白/方框

**现象**：背包底部精灵卡片的昵称（HP 条上方）只剩一个「口」形缺字框/空白，卡片上方少了一行名字。

**排查结论**：
- Ruffle 的 `Unknown device font "X"` 只按**家族名**去 `fontSources` 已加载字体里查；
  `defaultFonts`（名字→URL 映射）对设备字体请求**无效**（实测给 `Elephant`/`汉仪旗黑` 加映射后仍告警）。
- Windows 字体的家族名是英文（SimSun / Microsoft YaHei），SWF 请求的是中文名 → 永远匹配不到。
- 精灵名所在的 `newpetpackage.swf` / `petUIservice.swf` **没有**打过「宋体→SimSun」补丁，
  它们请求的正是设备字体「宋体」→ 命中不了 → 缺字框。

**修复**：`client/tools/make_cjk_font.py`（fontTools）复制 `simhei.ttf` 并改写 name 表 family，
给每个被请求的中文/拉丁家族名各生成一份 `client/web/fonts/*.ttf`：

- `songti.ttf` / `songti_b.ttf` → 「宋体」Regular/Bold（**决定背包精灵名**）
- `yahei.ttf` / `yahei_b.ttf` / `yahei_bold.ttf` → 「微软雅黑」常规/粗体字面 + 「微软雅黑 Bold」家族
- `hanyi.ttf` → 「汉仪旗黑-80S ExtraBold」；`fz_zy.ttf`/`fz_cy.ttf` → 方正综艺/粗圆简体；`heiti.ttf` → 黑体
- `arial.ttf`/`verdana.ttf`/`times.ttf`/`noto.ttf` → 动态文本默认字体（Latin 家族名也补上 CJK 字形）

配套：`serve.mjs /fonts/*` 优先本地 `web/fonts`（no-store）；`game.html` 的 `fontSources` 加入全部 13 个文件。

**结果**：背包卡片名字完整显示（「梵星音律·乾达婆」「[国民偶像]圣天伊」「镜中花意中人·梦」，
截图 `client/docs/spike/r105_cards.png`），同时「等级100」等此前只显示数字的文本也恢复。

**遗留**：`Unknown device font "微软雅黑" (bold:true)` 与 `"Elephant"` 仍会告警（对应控件暂未发现可见缺字），
如需彻底消除可再补同名粗体/`Elephant` 副本。

## 🧩 Round 29（2026-11-03）：背包属性区「晶钥 / 魂器 / 装备」空白

**现象**（用户截图）：亚比信息面板里 `晶钥`、`魂器` 空槽，`装备` 图标灰、`天赋` 显示灰环，
与官方客户端对比「展示不对」。

**根因（两层）**：

1. 上一轮为绕开数据报错仍摘除着 3 个服务：
   `HeadFrameService`（头像框）、`ToteService`（魂器/器灵赛季）、`CrystalKeyService`（晶钥）
2. 启用后发现**数据版本不配套**（两处硬报错，都会让服务永不 `onInited`、装配停在 90%）：
   - 旧 `materialdata.swf`(923749B) **没有** `ToteValueSeason` 类 → `ToteService.tryInitTote`
     在 `getDefinitionByName` 抛 `#1065`
   - 换成“最新” materialdata(954911B) 后，`ToteValueSeason$cinit` 构造
     `mmo.interfaces.material.tote::ToteValueSeasonData` 报 `#1063 Expected 6, got 5`
     ——旧 `interfaces.swf`（body 3112213）与新数据不配套

**修复**：

1. `AOLA_DROP_SERVICE` 清空（61 个服务全部启用）
2. `library/materialdata.swf` → 线上**带版本号**的文件
   `library/materialdata~261029283147051.swf`（947244B；base 路径的 923749B 是旧版）
3. `library/interfaces.swf` → 线上最新版（1118994B / body 3116181），随后重新打 3 个背包补丁：
   `patch_equiptotalbe_guard.mjs`、`patch_petcard3_extra_skip.mjs`、`patch_hkhelp_skip.mjs`
   （新版本里特征串依旧命中）
4. 旧文件备份：`materialdata.swf.old923`、`interfaces.swf.old`（均在 cache 目录）

**结果**：世界装配 61/61 正常进入；背包属性区与官方一致——`晶钥`两枚、`魂卡`7/7、
`魂器`两件、`装备`四件、`天赋`头像框图标均为实体内容（截图 `client/docs/spike/r117_attrs.png`、`r117_bag.png`）。
顺带 `头像框 id 666 未配置` 报错随新版数据消失。

**经验**：`materialdata / interfaces / materialservice` 必须**成套**升级并重打补丁；
只换其中一个会分别触发 `#1065`（类缺失）或 `#1063`（构造参数不匹配）。

## ⚔️ Round 30（2026-11-03）：战斗力偏低——魂卡/宠物卡3额外战力被清零

**现象**（用户反馈）：背包里亚比「战斗力」偏低，明确没有计算**魂卡**，怀疑**魂器**也没计入。

**字节码定位**（`pet/petdataservice.swf::PetBattleEffDataService.getPetBattleEffectiveness`）：

```
基础 pmBattleEff × xishu × (速/攻/特攻/防/特防/体力)
+ getPetCard2AddByBriefInfo
+ getPetCard3AddByBriefInfo      ← 上一轮 patch_petcard3_extra_skip 把内部子调用置 0（-3592）
+ getMiracleAdd + getCompleteMiraclePMAdd
+ getPetEffTotalExtraBE + getPetIndTotalExtraBE
+ getLegendSoulAdd + getInscriptionAdd + getAstralSpiritAdd
+ getGodcardAddByPetInfo
+ getSoulCardAddByPetInfo        ← 实现就是 HKHelp.getPbiHkBattle（被 patch_hkhelp_skip 整段跳过=0，-6000）
```

**根因**：Round 27/28 为绕开旧数据下的空引用，打了两个「整段置 0」补丁：
`patch_petcard3_extra_skip.mjs`（宠物卡 3 额外战力 → 0）与 `patch_hkhelp_skip.mjs`（HK/魂卡战力 → 0）。
数据升级到线上版本后，那些空引用已经不再发生，这两处可以恢复原逻辑。

**修复**：

1. `library/interfaces.swf` 重新拉取线上干净版，**只打** `patch_equiptotalbe_guard.mjs`
   （其余两个补丁停用）
2. `material/materialservice.swf` 回滚到 `materialservice.swf.prehk`
   （保留 ItemService / PetCard3 初始化补丁，撤销 HK 初始化跳过）
3. 重载验证：背包正常打开、无 `#1009`、世界 61/61

**结果（同一只亚比）**：

| 状态 | 战斗力 | 说明 |
|---|---|---|
| 修复前 | 41194 | 魂卡 + 宠物卡3额外 均为 0 |
| 恢复魂卡 | 47194 | +6000（`HKHelp.getPbiHkBattle`） |
| 再恢复宠物卡3额外 | **50786** | +3592（`getPetCard3SingleExtraEff`） |

巅峰战斗力 51055 不变（`getMax` 走 HKConfig 静态公式，不经过 `getPbiHkBattle`）。

**关于魂器**：`getPetBattleEffectiveness` / `getMax` 的组件里**没有 Tote 项**；
`ToteHelp.getPbiEquipToteByType` 只被 `PetBattleDetectHelper.getToteNum`（详情页数值条）和魂器面板调用。
即客户端战力公式不单列魂器，魂器加成通过属性/服务端下发的基础战力（`pmBattleEff`）体现。
若与官方客户端数值仍有差异，需要进一步比对服务端下发的 `pmBattleEff`。

截图：`client/docs/spike/r119_bag.png`（战斗力 50786 / 巅峰 51055）。

## 🐢 Round 31（2026-11-03）：背包切精灵 / 魂卡编辑严重卡顿——字体集过大

**现象**：背包内切换精灵、打开魂卡编辑时会卡住数秒。

**测量**（`requestAnimationFrame` 采样，脚本 `automation/aola_round120~125_*.mjs`）：

| 场景 | 14 个字体（旧） | 5 个字体（新） |
|---|---|---|
| 背包静止 | ~12.5 fps | 15.6 fps（预热后） |
| 切换精灵（重复） | 4.8–5.4 fps，**maxGap 5.6–6.3s** | 19.9–39.7 fps，maxGap 0.1–0.2s |
| 打开魂卡编辑 | ~13 fps | **68 fps**，maxGap 125ms |

**根因**：

1. **fontSources 字体数量是主要瓶颈**。Ruffle 的字体匹配/字形栅格化成本随已加载字体数量增长；
   14 个大体积 CJK 字体（含 17.5MB 的 `simsun.ttc` / 18MB 级 TTF 副本）让每次文字布局都变慢，
   切精灵（大量 TextField 重建）时主线程被阻塞 5–6 秒。
2. 次要：每次切精灵会重新加载 `petmovieXXXX_0..3`（每个 ~0.5MB、12–13 张 DefineBitsLossless2），
   Ruffle 解码位图有一次性的 0.8–3.5s 停顿（首次打开背包/首次见到该精灵时最明显）。

**修复**：

- 回退 8 个 SWF 的「宋体→SimSun」等长替换（`*.prefont` 备份还原），改由 `songti.ttf` 直接提供「宋体」家族
  → 不再需要加载 `simsun.ttc`
- `game.html` 的 `fontSources` 从 14 个精简到 **5 个**：`songti` / `songti_b`（宋体）、
  `yahei` / `yahei_b`（微软雅黑）、`hanyi`（汉仪旗黑）；`defaultFonts` 同步精简
- 删除未使用的字体副本（方正/Arial/Verdana/Times/Noto/黑体 等），`client/web/fonts` 160MB → **79MB**

**验证**：登录页「2之猎人徒」正常、背包精灵名正常、魂卡编辑列表文字正常；
重复切换精灵 37–40fps、魂卡编辑 68fps（见 `r125_login.png`、`r125_bag.png`）。

**遗留**：首次打开背包 / 首次切到某个新精灵仍有 0.8–3.5s 一次性停顿（Ruffle 解码 petmovie 位图），
属固有成本；若要进一步优化，可考虑对 petmovie 做本地预解码或换更轻的资源版本。

## 📊 Round 32（2026-11-03）：petmovie 轻量化 / 预加载方案评估（结论：暂不做）

**数据**（缓存 101 个 petmovie SWF，共 99.3MB；每只精灵 4 个文件约 2.1MB）：
`petmovie5158_0` 含 13 张 `DefineBitsLossless2`（fmt=3 调色板）**409×274**，
一次切换约解码 23MB RGBA、上传约 52 张纹理；重复切换 0.1–0.2s（加载结果被复用），
仅**首次**浏览某只精灵有 0.8–2.2s 停顿。

**结论**：字体裁剪后主要卡顿已消除，petmovie 只影响「首次看某只新精灵」，投入产出比低：

| 方案 | 收益 | 成本/风险 | 建议 |
|---|---|---|---|
| 降采样重封装（50%，同名同结构） | 首次 0.8–2.2s → 估计 0.3–0.8s | 需同步改 `PlaceObject` 缩放矩阵否则错位；场景（`shengyuhuapu.swf`）共用，画质全局下降 | 不做（如必须，先做单只 PoC） |
| 改用静态 `peticon` | 首次几乎无停顿 | 需改客户端加载逻辑，丢失动画 | 不做 |
| 进世界后预取 petmovie | 只省网络；解码/纹理上传仍发生在首次实例化；本机多为缓存命中 | 低，但收益接近 0 | 不做 |
| facade 对 SWF 命中缓存放开 `cache-control` | 刷新/重进页面减少重复下载 | 低；需防版本更新后缓存击穿 | 可选、非必要 |
| 维持现状 | — | 0 | **推荐** |



## Symptom

World loading stuck at `3% [2/61]` after clicking "Quick Start".
All 58 world module SWFs fetched (cache hit), socket alive, server responding,
no ERROR in Ruffle logs. Progress stays at [2/61] indefinitely.

## Root Cause (CONFIRMED)

**play.swf in cache is UNPATCHED original from 2026-10-31 14:01.**

p0-log.md (Round 12/13) already identified the exact cause:

> onLoaderDeq: shader completion callback, never fires in Ruffle
> (ShaderJob is a stub, wait never completes)

The fix tool `../client/tools/patch_seq4.mjs` was created on 2026-11-01 14:03 but the
patched SWF was never saved back to cache (or cache was refreshed).

Second patch also needed:
`../client/tools/patch_noop_inititemdata.mjs` (2026-11-01 14:22) - patches
materialservice.swf to no-op ItemService.initItemData because server item 5609
is missing from client item table, causing dispatch chain break.

## Blocker: Patch Patterns Don't Match

Running `patch_seq4.mjs` on current play.swf: `only 0/7 patched - abort`.

The byte patterns (e.g. `d0 66 02 5d 01 66 01 66 03 d0 66 04 46 07 02 29`)
are NOT present in the current play.swf body (2361396B decompressed from
`../client/cache/aola.100bt.com/play/play.swf` version suffix `261031358096721`).

Searches performed:
- `DefenseMsgSeq` / `onLoaderDeq` in play_body.bin pool: NOT FOUND
- `DefenseMsgSeq` / `onLoaderDeq` in play_body.bin classes: NOT FOUND
- `DefenseMsgSeq` / `onLoaderDeq` as raw string in ALL cached SWFs: NOT FOUND

Possible explanations:
1. play.swf was updated on 10/31 and class/method renamed
2. The class moved to a different SWF not in cache
3. The original patch targeted a different play.swf version
4. DefenseMsgSeq might be in a ZWS (LZMA) compressed SWF that we can't search

## ZWS Format Blocker

Many SWFs use ZWS (LZMA compression, not zlib). Tool
`scripts/aola_round22_extract_zws.mjs` was created but inflateRawSync fails:

```
Error: invalid stored block lengths
```

ZWS header layout for `config.swf`:
```
5A 57 53 12  D9 B6 05 00  FF A7 00 00  5D 00 00 00 01 00 ...
ZWS +ver18   uncomp=374489  comp=42751   LZMA props(5B)
```

Needs proper LZMA decompression (not zlib). Node.js lacks built-in LZMA.
Consider: lzma-native npm package, or 7z CLI, or Python lzma module.

## Other Findings

### Ruffle version comparison
- `/ruffle/` (nightly 682KB): world loads to [2/61] stuck
- `/ruffle-stable/` (465KB): shows "Create Character" dialog instead of
  entering world, completely different behavior, not useful
- game.html currently points to `/ruffle-stable/ruffle.js` (changed during
  this investigation), needs revert to `/ruffle/ruffle.js`

### Socket communication
- 22 C2S commands sent as burst (~15ms)
- Server responds with large packets (12.6KB getStartInfo, 22.4KB 61_6/61_7)
- Connection alive, honor messages streaming
- No missing command responses detected

### Module loading timeline
- Boot to 84 SWFs: ~18 seconds (all cache hits)
- BootLoader counts [2/61]: initIndex=2, totalService=61
- STEP0_ALL_NEED=0, STEP1_NEWBIE_NOT_NEED=0, STEP2_AFTER_SCENE=2
- Stuck at STEP2_AFTER_SCENE (service init phase)

### via parameter
- Both via=web and via=null reach the same stuck state
- via parameter is NOT the cause

## Files Changed This Session

| File | Change |
|------|--------|
| `../client/web/game.html` | ruffle.js -> ruffle-stable/ruffle.js (NEEDS REVERT) |
| `../client/web/game.html.bak` | Backup before ruffle switch |
| `scripts/aola_round22_screenshot.mjs` | Screenshot helper |
| `scripts/aola_round22_click_enter.mjs` | Click enter button |
| `scripts/aola_round22_click_quickstart.mjs` | Click quickstart + timed screenshots |
| `scripts/aola_round22_tunnel_full.mjs` | C2S+S2C tunnel parser (dir=2 for S2C) |
| `scripts/aola_round22_extract_zws.mjs` | ZWS extractor (INCOMPLETE, LZMA needed) |
| `scripts/aola_round22_inspect_avm.mjs` | Ruffle player API inspector |
| `scripts/aola_round22_debug_player.mjs` | debugPlayerInfo caller |
| `scripts/aola_round22_reload_via_null.mjs` | Reload without via param |
| `scripts/aola_round22_via_null_enter.mjs` | via=null enter flow |
| `scripts/aola_round22_test_stable.mjs` | ruffle-stable test |

## Next Steps (Priority Order)

1. **Revert game.html** to `/ruffle/ruffle.js`
2. **Solve ZWS/LZMA decompression** to search inside compressed SWFs
3. **Find DefenseMsgSeq/onLoaderDeq** in current SWF set (may be renamed)
4. **Recreate byte patterns** for current play.swf version
5. **Run both patches** (patch_seq4.mjs + patch_noop_inititemdata.mjs)
6. **Save patched SWFs to cache** (replace originals)
7. **Reload and verify** world loads past [2/61]
8. **Battle verification** (P0 final milestone)

## Key Reference

- `p0-log.md` Round 12: original patch documentation
- `../client/tools/patch_seq4.mjs`: 7-patch sequence (patterns outdated)
- `../client/tools/patch_noop_inititemdata.mjs`: item 5609 fix (needs ms_body.bin)
- Test account: 26394032 / 19811103
- Facade: port 8700, `AOLA_TUNNEL_DEBUG=1`, non-sandbox required
