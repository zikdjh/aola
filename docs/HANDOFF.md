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



## 🎞️ Round 33（2026-11-04）：试炼之地技能动画卡顿诊断

**现象**：光启精灵在战斗中释放技能时，完整动画出现明显顿挫；1V1 已能复现，4V2 同屏精灵和
特效增多后放大为接近 1 秒的主线程停顿。

**复现路线**：世界地图 → 星战空间 → **试炼之地**；未使用竞技场。先测 1V1，再按用户要求测
4V2。测试中通过道具「活力豆」补充技能次数，4V2 自动轮转稳定复现。

**测量数据**（`requestAnimationFrame` 帧间隔）：

| 场景 | 采样帧数 | p50 | p95 | 最大帧间隔 |
|---|---:|---:|---:|---:|
| 1V1 战斗静止 | 413 / 8s | 12.5ms | 54.3ms | 112.5ms |
| 1V1 技能释放 | 123 / 约 9s | 75.0ms | 166.3ms | 820.7ms |
| 4V2 战斗轮转 | 474 / 14.1s | 25.0ms | 41.8ms | 1262.3ms |
| 4V2，DPR 1.0 | 337 / 10s | 24.9ms | 33.4ms | 953.9ms |

**根因**：Ruffle WASM 主线程的时间线/显示列表处理，而不是首次资源下载或 GPU 像素填充。
4V2 的 CPU profile 中：

- `MovieClip::construct_frame` self 3247.1ms（24.5%）
- `DisplayObject::run_frame_scripts` self 1767.1ms（13.3%）
- `MovieClip::enter_frame` self 1721.3ms（13.0%）
- AVM2 self 1028.3ms（7.7%）
- MovieClip/DisplayObject 帧生命周期加 `Graphic::construct_frame` 合计约 **60.6%**
- inclusive：`construct_frame` 33.9%、`enter_frame` 20.8%、`goto_frame` 20.3%

DPR 从 1.5 降到 1.0 后，像素量约降 44%，p50 仍为 24.9ms，且仍有 0.8–0.95s 长任务，
排除像素填充主导。资源调用记录中已出现 `effect10003800`、`effect10002500`、
`effect50000000`、`effect10003000`、`petfightnew_gqresource`、`crieffect_normal_*`、
`revertppmovie`、`reverthpmovie` 等，部分有重复调用记录；这些 SWF 已缓存/复用，
结合长任务位置可排除首次网络回源主导。

**技能分类边界**：用户指出光启技能分攻击、属性、特殊（灵契等）三类。本轮 4V2 已稳定覆盖
攻击类动画并确认通用热点，但没有完成三类技能各自独立的 A/B 样本，不能归因到单一技能类别。
现有 profile 表明，复杂嵌套 MovieClip、逐帧脚本和特效对象树才是差异来源。

**后续建议**：先做 Ruffle 相邻版本二分；再按资源调用序列逐个替换技能 SWF，锁定对象树贡献；
优化重点是减少嵌套 MovieClip、逐帧 `gotoAndPlay` 和无效帧脚本。短期若不能改运行时，可提供
轻量特效选项；降低 DPR 收益有限。

页面性能监控已停止（`monitorActive: false`），浏览器保留在 4V2 战斗现场。完整数据、截图和
profile 见 [FINDINGS.md](../client/docs/spike/stutter-20261104/FINDINGS.md)。

## 🔬 Round 34（2026-11-04 下午）：Ruffle 版本二分（6V1/4V2 稳态）——运行时升级 11-04

按 Round 33 建议 #1 执行版本二分；应用户要求，对比场景改用 **6V1 与 4V2**（1V1 太轻，
单窗口数据会造成假象，见"教训"）。

### 二分环境（可复用）
- `serve.mjs` 新增 `/ruffle-bisect/<version>/` 静态路由；`game.html` 支持 `?ruffle-bisect=<version>`
  查询参数切换运行时（默认仍是 `/ruffle/`），一次部署多版本并存于 `client/web/ruffle-bisect/`
- 已部署：`2026-10-24` / `2026-10-31` / `2026-11-04`（官方 selfhosted 包，gh release download）
- 实测脚本：`automation/aola_round270~279_bisect_*.mjs`（goto/login/quickstart/nav/mode/steady/profile 聚合），
  配置在 `automation/.bisect_current.json`（version + mode）；产物在
  `client/docs/spike/stutter-20261104/bisect-20261104/<版本>/`

### 方法要点（稳态协议）
入场动画后先**自动战斗预热 75s** 再采样 8s 静止 + 14s 战斗（500µs CPU profile）。
原因：6V1/4V2 的轮换会陆续实例化多只精灵的 petmovie，**首次解码是 0.5–3.3s 的一次性停顿**
（10-24 6V1 入场窗口实测 max 3312ms），不预热会污染任何窗口、得出随机结论。

### 结果（稳态战斗窗口，同一协议三版本）

| 版本 | 6V1 p50 / max | 4V2 p50 / max | 6V1 construct_frame(14s 绝对) | 6V1 主线程 busy |
|---|---|---|---|---|
| 2026-10-24 | 20.9ms / 692ms | 37.4ms / 1192ms | 3363ms | 87% |
| 2026-10-31（原默认） | 4.2ms / 429ms | 25.1ms / 796ms | 1998ms | 66% |
| 2026-11-04 | **4.2ms / 237ms** | **20.8ms** / 1046ms | **1539ms** | **46%** |

- 10-31 4V2 稳态 p50 25.1ms 与 Round 33 上午基线（25.0ms）吻合，协议可信。
- profile 聚合：6V1 时间线族（construct+enter+scripts）占比 48.9% → 31.4% → 23.3%，
  **新版把 6V1 的时间线开销砍半以上**；wgpu 占比 4.9% → 1.9%。
- **4V2 三个版本都重**：construct_frame 绝对耗时 ~3.8–4.3s/14s，时间线族 55–63%，
  秒级停顿（0.8–1.2s max）在最新版仍存在——它需要的是 Round 33 建议 #3
  （时间线结构/特效对象树优化），换版本解决不了。

### 教训
1. **1V1 单窗口会制造反向假象**：首轮 1V1 对比（10-24 max 58ms vs 10-31 max 496ms）
   曾暗示"新版回归"；6V1/4V2 稳态证明 10-24 才是最慢的。窗口太轻 + 战斗动态噪声
   （PP、技能轮换、暴击时序）会让单次 14s 采样的 max 完全不可靠，结论要以
   p50/p95 + profile 绝对耗时为准。
2. **Chrome 窗口遮挡误判会冻结 RAF**（visibilityState=visible、hasFocus=true 却只有
   1.5fps，主线程 profile 94% idle）：开关一次标签页（newPage+close）即可解除。
   长时间运行的测量会话务必在每次采样前做一次 "shake"。
3. 10-24 在导航中偶发 Ruffle 致命错误页（复现 1/2 次）；又一条不留恋旧版的理由。

### 已执行变更
- **默认运行时升级：`client/web/ruffle/` 10-31 → 11-04**（三场景实测无回归、6V1 显著受益；
  旧版备份在 `client/web/ruffle.old-10-31/`，已 gitignore）。所有补丁在缓存 SWF 内、
  字体走 fontSources，与 Ruffle 版本解耦，无需重打。
- `serve.mjs` / `game.html` / `.gitignore` 的二分支持改动（见上）。
- 未提交：以上改动 + Round 33 文档（README/HANDOFF）等，待用户确认后一并 commit。

### 补充测量（同日晚间）：入场停顿在 11-04 上未复现
- 全新页面（goto 重载）→ 直进 4V2 两次复测：**入场窗口零 ≥50ms 长任务**，长任务只出现在
  战斗轮转段（[297,172,168,156,...]，与特效归因一致）。
- 结合上午矩阵（10-24 入场 3312ms / 10-31 2321ms / 11-04 929ms），**升级 11-04 后入场停顿
  已基本消失**；上午 11-04 的 929ms 入场停顿疑似与当时的限帧/节流状态耦合。
- petmovie5158_0 结构侦察（`automation/aola_round284_pmovie_recon.py`）：13 张 fmt3 调色板位图
  （409×274，压缩合计 555KB，索引数据仅 1.5MB）+ **DoABC + SymbolClass**（AS3 代码动态构建，
  非时间线动画）——纯"解码"成本只有毫秒级，Round 32 的"解码 23MB"假设未获 profile 支持；
  真实成本大概率在纹理上传/显示对象构建，且 11-04 已不明感知。
- **降采样 PoC 暂缓**：前提机制未获证实，且今天环境（合成器限帧 + UI 坐标漂移）无法做
  可信 A/B。待机器重启恢复基线后，若入场卡顿仍存在，用 `round282/283`（工具已备好）
  先抓冷入场 profile 再决定。
- 测量坑：本页 PerformanceObserver 的 resource 类型条目始终为空（原因未明），
  资源↔停顿对齐需改用 serve.mjs 日志加时间戳的方案。

### 下一步（更新 Round 35 优先级）
1. ~~版本二分~~ ✅ 已完成并升级默认版本
2. **4V2 特效 SWF A/B**（`effect100*.swf` / `effect50000000.swf` / `crieffect_normal_*.swf`
   逐个替换禁用）——4V2 是唯一残留秒级停顿的场景，对象树归因价值最高
3. 时间线结构优化（减少嵌套 MovieClip / 逐帧 gotoAndPlay）需改官方 SWF 资源，成本高，排后

## 🎯 Round 35（2026-11-04 傍晚）：4V2 卡顿归因——特效对象树实锤，低配特效开关落地

按 Round 34 计划执行建议 #2（特效 SWF A/B）。结论先行：**把战斗特效 SWF 替换为 760B 轻量壳后，
4V2 主线程长任务总量 −76%（116 个/14.3s → 34 个/3.4s per 60s）——特效对象树就是主因**。

### 工具（可复用，已入库）
- **特效替换开关**：`serve.mjs` 新增 `AOLA_EFFECT_STUB` 环境变量，值为逗号分隔的 urlPath
  子串（大小写不敏感），命中的 GET 改发替换体。替换体 = 缓存里最小的真实特效
  `fightasyncres/effect/effect0.swf`（760B ZWS；加载/播放/完成生命周期与真特效一致），
  缺失时退回程序生成的最小 FWS。默认不设置 = 关闭。
  - 全部特效：`AOLA_EFFECT_STUB="fightasyncres/effect,crieffect_normal,revert"`
  - 仅技能特效：`AOLA_EFFECT_STUB="fightasyncres/effect"`
  - 这就是**低配特效模式**的落地形态（网关层，官方缓存不动、可随时回退）。
- 归因脚本：`automation/aola_round277/278/281_bisect_*.mjs`（进模式 → 预热 → 60s 采样 + profile）；
  配置 `automation/.bisect_current.json`；产物 `client/docs/spike/stutter-20261104/bisect-20261104/`。
- **RAF 健康助手** `automation/aola_round280_raf_helper.mjs`：RAF 被节流时帧间隔数据全部作废
  （长任务观察器不受影响）。逐级唤醒 = 保活音频（audible 标签页豁免）→ 窗口 TOPMOST →
  开关标签页 → Win32 置前；失败可抛错中止测量。

### 归因数据（4V2 稳态 60s 窗口，11-04 运行时，自动战斗）

| 配置 | 长任务数 | 长任务累计 | timeline CPU |
|---|---|---|---|
| 无替换（基线） | 116 | 14.3s | 5.2s |
| 仅技能特效族 `effect/` | 64 | 7.0s | 2.3s |
| 全部特效（+暴击/回复动画） | 34 | **3.4s** | 3.7s |

- 技能特效族（`effect1000xxxx`、`effect50000000` 等 20+ 个文件）≈ 一半长任务贡献；
  暴击 `crieffect_normal_*` + 回复 `revertpp/hpmovie` ≈ 另一半。
- 即：**特效对象树 ≈ 4V2 主线程卡顿的 3/4**，与 Round 33 profile 的
  `construct_frame` 热点互相印证。剩余 ~3.4s 来自本体战斗时间线（宠物/场景 MovieClip）。

### 测量方法与坑（重要）
1. **帧间隔 vs 长任务是两套独立信号**。本次会话机器状态多次漂移：出现"合成器把游戏页
   限到 ~21.7fps（主线程 78% idle）"、"页面级 1s 节流（跨浏览器重启持续、置顶/音频/开关
   标签页只能部分缓解）"等状态，帧间隔数据随之作废；**PerformanceObserver 的长任务计数
   与 CPU profile 时间不受影响，归因结论以长任务累计为准**。
2. **空壳 SWF（0 帧）是坏替换体**：会让 AVM2 异常/重试开销放大（avm2 占比 5 倍），
   必须用带完整生命周期的真实轻量 SWF（effect0.swf）。
3. petmovie 首次解码停顿（0.5–3.3s）会污染采样窗口——进战斗后先自动轮转预热 60s 再测。

### 下一步
1. ~~低配模式验收~~ ✅ **功能验收通过**（2026-11-04 晚）：`AOLA_EFFECT_STUB` 全开下 4V2
   完整运转——多敌同屏、自动轮转、PP、伤害累计 32130（第 4 回）、回合推进全部正常，
   仅特效光效消失；截图 `bisect-20261104/default/4v2_02_after.png`。画质取舍留用户定夺
2. 逐个特效精细归因（把 family 拆到单文件，找"最重的那一个"，可做定点优化）——可选
3. 机器节流状态未根因（同浏览器空白页 242fps、游戏页 1fps 交替），下次会话若复现，
   先跑 `aola_round280_raf_helper.mjs` 的健康检查再测量
4. 未提交变更两轮累积（Round 34/35），待用户确认后 commit

## 🩺 Round 36（2026-11-04 晚）：「入场加载首发精灵卡顿」两层根因

用户报告进入战斗加载首发精灵时明显卡顿，4V2 尤甚。专项测量（round282/283，锚定点击
4V2 → 战斗就绪的窗口，带时间戳的长任务/资源 + 全程 profile）结论分两层：

### 层 1：petmovie 首次解码（游戏侧，上午已实锤）
- 每只精灵首次实例化 = petmovie SWF（4 文件 ~2.1MB、12-13 张 409×274 调色板位图）
  解压 + 23MB RGBA 解码 + ~52 次纹理上传 + 首次时间线构造，单只 0.8–3.5s（Round 31/32 实测）。
- **4V2 开场同屏 6 只（我方 4 + 敌方 2）叠加，比 1V1（2 只）重 3 倍**——与"42 尤其明显"吻合。
- 入场窗口实测（fresh session 首战）：10-24 max 3312ms、10-31 max 2321ms、11-04 max 929ms
  （长任务 [926,266,219,215,...]）。升级 11-04 已把该项改善 2.5–3.5 倍。
- 该停顿**每会话每精灵一次性**；预热的战斗入场零长任务。

### 层 2：本机合成器限帧（环境侧，今天 13:00 起出现）
- 今天下午起游戏页帧间隔恒定 ~46ms（≈21.7fps），主线程 72–88% 空闲、零长任务——
  帧生产端（合成器/GPU 提交）被限制，游戏进程几乎无负载。
- 排除：遮挡（置顶无效）、电源（AC 100%）、音频（无关）、GPU 驱动重置（系统日志无）、
  游戏代码（空白页同浏览器 242fps；同一构建上午 60fps+）。
- 跨浏览器重启持续；上午同一环境正常。**疑似 OS/浏览器全局状态（如 Chrome GPU 进程
  降级），重启机器可验证。**
- 影响：今天所有帧间隔类测量失真（p50 被 45.8ms 地板顶住）；长任务计数与 CPU profile
  时间不受影响。今天用户感知的"入场卡顿"有相当部分是这个 21fps 幻灯片效应。

### 优化建议
1. 环境层：重启机器/浏览器恢复 60fps 基线（验证层 2 假设）
2. 游戏层（petmovie，按 ROI）：
   - **零成本立即可用**：进世界后开一次亚比背包把常用精灵翻一遍 = 手动预热 petmovie，
     之后所有战斗入场零解码停顿
   - **网关层降采样重封装 PoC**（Round 32 评估过，当时按"只影响首次看新精灵"否决；
     4V2 入场 ×6 叠加使收益场景变大了）：50% 降采样 → 解码/上传 ~4× 降，入场停顿估计
     0.8–3.5s → 0.2–0.9s；需同步修 PlaceObject 缩放矩阵，先做单只 PoC
   - 上游路线：给 Ruffle 提 issue 建议磁盘级解码缓存（每次会话重复解码是纯浪费）

### 测量工具备注
- round282 的点击命中检测被 PerformanceObserver buffered 旧条目骗过（假阳性）——
  判定"战斗已开始"要看 t≥0 的资源或截图，不要直接 some() 全量 resources。
- 窗口位置在本会话中会漂移（疑似 TOPMOST 实验残留），即取即点的 rect 在长脚本中
  也可能失效；点击前最好截图人工确认面板状态。

## 📦 Round 37（2026-11-04 晚）：整合包（内嵌内核）+ 定制浏览器 CDP 控制 + 工作空间归位

### 整合包（aola/dist/aola-launcher-pack/）
- 结构：启动奥拉星.cmd + runtime/node（便携 Node 22）+ runtime/browser（内嵌 Chromium 157 便携内核，
  816MB，locales 裁剪至 zh-CN/en-US）+ app（serve.mjs / web / 全量 cache 606MB，含全部补丁 SWF）
- 启动器生命周期：起网关（窗口标题 AolaStar Gateway）→ 等 /status 就绪 → 开 Chromium --app 独立窗口
  （隔离 profile 目录）→ **关窗自动 taskkill 网关**；端口占用分支：已有网关直接再开窗口
- 启动器为 GBK+CRLF 编码（UTF-8 批处理在中文 Windows 下解析不稳）；UTF-8 源码保留在
  launcher_new_utf8.cmd；输出文案避免全角括号（cmd 会拆行）
- **沙箱坑**：Chromium trunk 快照在本机沙箱初始化 FATAL（SBOX_ALL_OK check failed，伴随
  TEMP 不可写/注册表拒绝访问等 ACL 异常）→ 启动器统一 --no-sandbox（已实测内核正常渲染游戏），
  说明.txt 标注取舍；恢复后可去掉该参数
- **默认静音**：启动器两处均带 --mute-audio；想开声音删掉即可（说明.txt 第五节）
- zip：AolaStarLauncher-20261104.zip（1.03GB，4872 项）；profile/ 与测试残留不入包

### 定制浏览器 CDP 控制（automation/aola_round286_pack_browser_control.mjs）
- 零依赖（Node 原生 WebSocket）：启动（加 --remote-debugging-port）→ /json/list 附身 →
  Runtime.evaluate 读状态 → Page.captureScreenshot 截图 → Input.dispatchMouseEvent 模拟点击
- 实测：登录页点击推进 [LOGIN]→[RUNNING]；截图存 client/docs/spike/pack-browser/
- 注意：9222 仅显式加参数时开放，默认双击无暴露；spawn 用 detached:true 否则脚本退出会连坐浏览器
- 意义：此前 ego-browser 的全部 round 自动化能力可平移到用户机整合包上（自动登录/引导/采样）

### 工作空间归位
- 根目录只留 aola/ 与 .workbuddy/：fws+analysis → aola/reverse/；perf-investigation-20261104 →
  aola/client/docs/spike/；整合包 → aola/dist/；.bisect-dl → aola/temp/downloads/
- .gitignore 增补 /dist/ /reverse/ /temp/（本地保留不入库）；README 目录树同步更新

### 未提交变更（待用户确认）
Round 33–37 全部成果：运行时升级、serve.mjs/game.html 改动、特效开关、bisect 工具、
文档（README/HANDOFF/FINDINGS）、整合包脚本、round282–286 工具

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
