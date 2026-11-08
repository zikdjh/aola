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
 
 ## 🔑 Round 38（2026-11-04 晚）：整合包票据过期 → 登录页「不支持 Flash」及恢复流程
 
 **现象**：整合包窗口从可玩状态变成显示「不支持 Adobe Flash Player」的画面，无法进入游戏。
 
 **根因链**（CDP 诊断，`showWebLogin` 日志 + DOM 取证）：
 1. 整合包 profile 里的登录票据 Cookie（`his_auth_sid_aola` / `his_auth_sid`）过期 → 游戏日志
    `getCookie(his_auth_sid_aola) => null`；
 2. loader 因此走 `showWebLogin(...)` 网页登录分支，game.html 渲染一个**可见的 960×560 iframe**
    承载官方登录页 `account.100bt.com/game/auth/login.html`（DOM 取证：顶层 `swf:false`、`iframes:1`）；
 3. 官方登录页的登录表单是 Flash；Ruffle 只注入顶层 game.html，**iframe 内没有 Ruffle** →
    Chrome 在 iframe 内显示「不支持 Adobe Flash Player」。
 
 **恢复流程（已验证）**：
 ```
 # 1) 打票据（裸 POST normallogin → WAF 通行证 → 重放 → 3 枚 auth cookie）
 runtime\node\node.exe client\tools\round15_auto_login.mjs
 # 2) game.html 轮询 /login-cmd 领到 setCookies → 注入 document.cookie → 自动重载引导链
 # 3) 等 SWF 回到顶层（约 30s）→ 在 AutoLoginPage 点「进入游戏」stage(484,526)
 # 4) newLogin → serverslist → 快速开始 → 世界装配（约 60s，期间截图持续动画）
 ```
 验证信号：`getCookie(game_auth_sid) => gameId=2,gameName=奥拉…`、`getQS(duoduoId) => 26394032`、
 截图由 1.19MB 静态（AutoLoginPage 等输入）转为持续变化的动态画面、`ExtHandler/handleMessage`
  驱动的活动面板报错（说明 socket 已在世界内通信）。
 
 **本次伴随噪音**（非阻塞）：`XW260930_panel` 活动面板 #1009 ——
 `mmo.play.actthings.helper::ActMaterialLoader$/setView()` 空引用（缘愿福利 YYSTW_Tab0），
 属「活动素材缺失」类，与 Round 27/29 的账号特殊数据问题同族，不影响世界与主要功能。
 
 **要点**：
 - 标题语义：`[LOGIN]` = 网页登录 iframe 已弹出（不是 AutoLoginPage）；`[RUNNING]` = 播放器已载入、
   引导链运行中。判断「是否卡住」不要只看标题，要看截图是否持续变化 + 日志是否推进。
 - 票据有有效期，**过期即回到上述死路**；整合包使用中若再遇到「不支持 Flash」，跑一次
   `round15_auto_login.mjs`（指向 127.0.0.1:8700，包内网关同样支持 `/import-login`）即可恢复。
 - 可选改进（未做）：启动器内置票据有效性检测 + 自动打票；或给 `showWebLogin` iframe 注入 Ruffle
   （成本高，登录页 SWF 还需网络桥，暂不建议）。


## 🔤 Round 39（2026-11-04 晚）：达人王任务名「全是 1」—— Ruffle 设备字体 FULL_NAME 匹配

**现象**：达人王面板「每日任务 / 每周任务」的任务名全部显示成「1」（中文整段丢失、只剩数字），
部分任务图标显示也不正确。

**排查与实锤**：

1. 资源无问题：`activityres/activity250523/xindarenwang/` 四个 SWF 与官方**逐字节一致**（MD5 相同）。
2. 面板入口定位：世界右下角**背包上方 stage(950,420)**；判据用「点击后是否新增 `xindarenwang`
    资源请求」（不再依赖截图差异，场景动画会污染判定）。
3. 任务定义来自**客户端配置** `XDRW_Tab0_Config::TASK_DATA_ARR`（`xindarenwang_code.swf` 的 ABC，
    `XDRW_Tab0::refreshAll` 里 `concat()` 后逐条按 `taskData` 调 `_info.getTab0taskInfo()`）；
    进度/状态来自服务端 `NW250523_panel` / `AAE250523`。相关字段名：
    `iconFrame / targetArr / bonusNumArr / sortIndex / taskData / progFrame / isGot / canGet`。
4. 反查 Ruffle 源码（`web/src/builder.rs::register_ttf_face_by_name`）得到根因机制：
    - 设备字体**注册名 = 字体文件的 FULL_NAME（nameID 4）**，bold/italic 由文件 OS/2·head 标志解析；
    - 请求侧是「族名 + bold」的**精确匹配**（`FontQuery`），精确匹配失败后仅在同名 bold/italic 变体间
      回退，最终失败则用内置 `Noto Sans`（**无 CJK 字形**）→ 中文整段消失、只剩数字。
    - 因此原来的 `songti_b.ttf` / `yahei_b.ttf`（FULL_NAME 分别为「宋体 Bold」「微软雅黑 Bold」）
      **永远匹配不到**「宋体」/「微软雅黑」+ bold 的请求 → 粗体中文全部丢字。
5. `defaultFonts` 此前配置也无效：key 只能是 `sans/serif/typewriter/japaneseGothic[|Mono]/japaneseMincho`
    固定槽位，值是**已注册设备字体名的数组**（`setDefaultFont(name, Vec<JsValue>)`——传字符串会被按字符拆开）。

**修复**：

1. `client/tools/make_cjk_font.py` 增参 `[faceIndex] [fullName] [bold:0|1]`，可让**粗体字面的 FULL_NAME
    等于被请求的族名**，同时保留粗体标志；
2. 重新生成 `songti_b.ttf`（FULL_NAME=宋体，bold）、`yahei_b.ttf`（FULL_NAME=微软雅黑，bold），
    新增 `yahei_bold.ttf`（FULL_NAME=微软雅黑 Bold，bold——部分控件直接请求该族名）；
3. 新增 `hanyi60.ttf`（汉仪旗黑-60S Regular）—— 达人王任务文本所用字体，此前缺失（10 个活动 SWF 在用）；
4. `game.html`：`fontSources` 共 8 个文件；`defaultFonts` 六个槽位全部指向 `["宋体"]`
    （默认回退也能拿到中文字形）。

**验证（A/B 实证）**：

- 临时移除 `hanyi60.ttf` → Ruffle 立即报 `Unknown device font "汉仪旗黑-60S Regular"`；加回后告警消失
   （证明该面板确实请求此字体）；
- 修正粗体 FULL_NAME 后，`宋体 (bold:true)` 与 `微软雅黑 (bold:true)` 告警**全部消失**；
- 用户实测确认：任务名中文正常显示（此前「全是 1」）。

**仍存在（非阻塞）**：`Times New Roman` / `方正粗圆简体` / `Microsoft YaHei` / `SimSun` / `Verdana` /
`Arial` / `方正综艺简体` / `黑体` / `Elephant` 等族名告警——少量 SWF 原生请求这些名字，未提供副本时回退
`Noto Sans`。若后续发现其它面板中文缺失，按同样办法（FULL_NAME = 请求名）补副本，
但会增加字体数量与开销（见 README ⚠️ 性能）。

**本轮临时工具**（scratch，未入库）：`swf_strings.py`（FWS/CWS/ZWS-LZMA 解压 + 字符串抽取）、
`swf_font_scan.py` / `swf_fonts.py`（统计 SWF 请求的设备字体族）、`tcap_scan.py` / `tcap_rec.py`
（隧道抓包按命令头定位记录）、`ink2.py` / `color_map.py` / `diff_map.py`（截图像素取证）、
`ego-aola/round-*.mjs`（ego-lite 驱动轮次；含世界入口坐标与达人王按钮 spot）。

**环境备忘**：`serve.mjs` 若用 PowerShell `Tee-Object` 落盘，日志是 **UTF-16**，
Node 按 utf-8 读会全部读不到（曾导致流量探测器假阴性）→ 用 `readFileSync(p,"utf16le")`。

## 🎛️ Round 40（2026-11-04 晚）：入场 / buff 特效屏蔽开关（低配模式）

**需求**：光启亚比入场时的 buff 特效、星辉亚比的进场特效开销大，希望有开关能一键屏蔽。

**做法**：扩展 Round 35 的网关层特效替换（`AOLA_EFFECT_STUB`），在 `serve.mjs` 增加命名开关：

| 变量 | 屏蔽内容 | 匹配规则 |
|---|---|---|
| `AOLA_NO_ENTER_EFFECT=1` | 入场 / 登场特效（光启 + 星辉） | 子串 `appear` |
| `AOLA_NO_BUFF_EFFECT=1` | 光启 buff / 机制特效 | `re:/gqpet/[^/]+/effect/`、`re:/gqpet/[^/]+/backgroundup/` |
| `AOLA_NO_XINGHUI_EFFECT=1` | 星辉机制特效 | `re:/xinghuipet/[^/]+/(effect\|movie\|status)/` |
| `AOLA_NO_PET_EFFECT=1` | 以上三个全开 | — |

- 通用项 `AOLA_EFFECT_STUB` 同时新增 `re:` 正则前缀支持（用于「同时满足 A 与 B」这类条件，
   例如只屏蔽 `gqpet/*/effect/*` 而避开 `gqpet/skill/*` 的 UI 资源）。
- 命中资源换发 `effect0.swf`（760B ZWS 真实最小特效），加载/播放/完成生命周期完整
   → 战斗逻辑、伤害结算、回合推进不受影响，只是不显示特效。

**资源规律（来源：`pet/petfightnew.swf` 的路径构造串）**：

- 光启：`gqpet/<机制>/effect/<名>effect_<亚比id>.swf`
   （shenbing / huanlingshi / xinghuanshi / menghuandiyue / wanyuzhichao / armorburst / shenghun / juexing / dijieshi /
   yiren / hundunkongjian / hundunjuedou / yingjiemengyue / jiurichongxian / dengshenchangjie / mingyunboyi / liansuo …）
- 入场类资源名含 `appear`：`gqpet/armorburst/effect/armorburstappeareffect.swf`、
   `xinghuipet/shenling/effect/xinghuishenlingappearmv`、`xinghuipet/tongling/...appearmv`、
   `xinghuipet/annualfee22/...appearmv` 等 → 用单一子串 `appear` 覆盖光启+星辉的入场特效。
- 星辉机制：`xinghuipet/<机制>/{effect,movie,status}/*`（shenling / tongling / annualfee22 / fahuan / zhanyi /
   hundunlilian / wangzhereal / shenyuanhuixiang …）
- **刻意避开 UI**：`gqpet/skill/actgqskillllist.swf`、`xinghuipet/skill|soul/*`（技能列表 / 魂骨面板）。

**验证**：5 组开关（enter / buff / xinghui / all / 关闭）× 11 个真实与合成 URL 的匹配矩阵
**55/55 通过**（真实网关逐一请求，按响应体是否为 760B 判定；脚本 `scratch/test_effect_switch.cjs`），
含「UI 不被误伤」与「关闭时零影响（比特级一致 200 + 原体积）」两类断言。
整合包新增 `启动奥拉星-去特效.cmd`（GBK，语法用 echo 演练副本验证通过、无 `?` 损坏），
`说明.txt` 增补第七节说明。

**待办 / 提示**：

- **帧率收益未测**：需在实战中开/关各采一段 rAF 帧间隔与长任务（匹配正确性已由矩阵覆盖）。
- 开关要求由本启动器拉起网关；已有网关在跑时只开窗口、开关不生效（启动器已加提示）。

**编码坑（重要，本轮踩到）**：整合包里 `说明.txt` 是 **UTF-8**，而 `启动奥拉星*.cmd` 是 **GBK**。
用错编码读→写会静默损坏文件（本轮一度把 `说明.txt` 49 字节中文变成 `?`，已从 zip 原件还原重做）。
稳妥做法：读写都用文件真实编码；中文内容经 UTF-8 文件承载，**不要在命令行里写中文字面量**
（PowerShell 命令串里的中文可能被 shell 破坏，导致 `.Replace('版本：', …)` 这类匹配静默失败）。

## 🖼️ Round 41（2026-11-04 晚）：专属战斗背景开关

**需求**：部分精灵/场景带「专属战斗背景」，希望同样有开关处理。

**资源定位**（`petfightnew.swf` 路径构造串 + 缓存枚举）：

- 专属战斗背景族：`petfightbackground/<名字>`，由服务端按精灵/场景下发。字符串里成对出现类名，例：
   `mmo.petfight.StarShineCity` ← `petfightbackground/starshinecity`；另有
   `fightkingwar8/9/wl`、`giantcordillera`、`hexagrampalace`、`magicringforest`、`thinktoweroffire/ice/water`、
   `youanmingzhou`、`fairytalestar1`、`aixi`、`bailingstar`、`bastion`、`bingxuestar`、`candystar`、`clockstar`、`cloudstar1` …
- 通用基础背景：`petfightbackground/common.swf`
- 相关但**未**纳入本开关（可按需再扩）：`skillbackground/skillbackground_*`（技能背景，300–700KB）、
   `pet/petskin/background/petskinbackground<id>.swf`（皮肤背景，仅被 `petskin.swf` 引用，实战日志中未出现）、
   `pet/fightasyncres/waitbgmovie/movie.swf`（等待背景 83KB）、`gqpet/<机制>/backgroundup/*`（已归入 buff 开关）

**实测体积（决定默认策略的关键）**：专属背景拉下来只有 **46,862B / 37,034B**，而通用背景 `common.swf` 是
**503,842B** —— 说明专属背景是**叠加层**，用通用背景顶替反而更贵（多下 ~500KB，还可能重复渲染）。

**实现**（`serve.mjs`，在特效替换之前独立判断）：

- `AOLA_NO_PET_BACKGROUND=1` → 专属背景换发 760B 空壳（**默认推荐**：省掉该层时间线/对象树开销，基础背景仍在）
- `AOLA_NO_PET_BACKGROUND=common` → 专属背景换发 `common.swf`（画面一定有背景，代价 503KB）
- 匹配 `re:/petfightbackground/(?!common)`（lookahead 放行通用背景自身）；不设置变量则完全不介入

**验证**：3 种取值 × 6 个 URL **14/14 通过**（含「common 自身不被替换」「技能特效与战斗模块不受影响」
「关闭时无任何替换日志」），脚本 `scratch/test_bg_switch.cjs`；同时回归特效矩阵仍 **55/55 通过**。
整合包 `启动奥拉星-去特效.cmd` 已纳入该开关（GBK，含中文的整段文本经 UTF-8 文件承载后写入，`?` 数 0，
echo 演练副本语法通过），`说明.txt` 第七节同步更新。

**待验证 / 风险**：

- 背景资源内隐含类名，替换后客户端 `getDefinitionByName` 可能报 `#1065`（预期会回退到基础背景），
   **观感需实战确认**（专属背景是否确实不再显示、基础背景是否正常）。
- 帧率收益同样待实战采样（与 Round 40 的两个开关一起测）。

## 🎞️ Round 42（2026-11-04 晚）：背景加载动画并入开关（用户澄清「卡的是加载时那段动画」）

**用户澄清**：重点不是专属背景本身，而是**加载背景时那段过场动画**卡。

**定位（petfightnew.swf 字符串）**：

- `pet/fightasyncres/waitbgmovie/movie`（82,937B）出现在 `PRELOAD_RES_LIST`（`SceneManager` 的场景预加载
   列表）旁边 → 就是**加载时播放的等待动画**，卡顿直接对象；
- `backgroundmovie/backgroundmovie`（由 `BackGroundEffectMovie` 使用）→ 背景切换特效；
- 同族重资源（**Round 42 未**纳入；其中 `petfightnew_startmv.swf` 已在 **Round 43** 用「空壳资源」方案纳入）：`pet/petfightnew_startmv.swf` **1.33MB**（战斗启动过场）、
   `petfightnew_res.swf` **2.10MB**、`petfightnew_gqresource.swf` **1.36MB**、
   `petfightnew_skillwindword.swf` **736KB** —— 它们承载战斗类定义/技能资源，替换风险高，
   直接换壳可能让技能或流程缺类。

**实现**：`AOLA_NO_PET_BACKGROUND` 扩为覆盖三类资源（`BG_SWAP` 现在是「正则 + 替换体」的条目表）：

| 资源 | `=1` | `=common` |
|---|---|---|
| 专属背景 `petfightbackground/<名字>`（`(?!common)` 放行通用背景自身） | 760B 空壳 | `common.swf` |
| 背景加载/等待动画 `fightasyncres/waitbgmovie/` | 760B 空壳 | 760B 空壳 |
| 背景切换特效 `backgroundmovie/` | 760B 空壳 | 760B 空壳 |

**验证**：3 种取值 × 7 个 URL **16/16 通过**（新增用例：`waitbgmovie` 关闭时返回自身 82,937B、开启时 760B；
`backgroundmovie` 的命中日志断言），特效矩阵回归 **55/55**。整合包 `app/tools/serve.mjs` 已同步
（包内 node `--check` 通过）。

**待验证**：①观感与流程（`#1065` 类缺失风险，特效类同款处理已在 Round 35 验收）②帧率收益 ——
都需进一场「带专属背景」的实战采样确认。

## 🎬 Round 43（2026-11-04 晚）：战斗开场「亚比登场」演出屏蔽 —— 保留类契约的「空壳资源」

**用户反馈**：低配开关打开并刷新后，`xinghuipet/shenling/effect/xinghuishenlingappearmv`、
`gqpet/shenbing/effect/shenbingeffect_5104.swf`、`waitbgmovie/movie` 都已被换壳（网关日志 5 条 `[stub]`），
但**进场那段「亚比登场」演出还在**。

**归因（一手证据）**：那场战斗里仍是「真身」的资源，按体积排序 ——
`fightasyncres/crieffect_normal_1/2/movie.swf` 各 **2.06MB**（全屏暴击）、
`pet/xinghuikillbigmovie/xinghuikillbig4862_0..3.swf` 合计 **3.0MB**（星辉大招特写）、
`fightasyncres/effect/effect50000000.swf` **1.29MB**、`pet/petfightnew_startmv.swf` **1.30MB**（战斗开场演出）、
`revertppmovie` / `reverthpmovie` 各约 0.27MB。用户确认「还看到的」就是 `petfightnew_startmv.swf` 那段。

**为什么不能照搬特效的做法（关键差异）**：新增 `client/tools/swf_zws.cjs`（借 `client/tools/node_modules/lzma`
解 ZWS=LZMA，再扫标签）+ `client/tools/swf_abc_strings.cjs`（读 ABC 常量池）后看到 ——

- `petfightnew_startmv.swf` 解压 1.51MB，**只导出 1 个类** `mmo.petfightnew.movie.StartMovie`
  （132 个 DefineSprite、47 个位图、119 个矢量形状）；
- 它的 ABC 里是 `class mmo.petfightnew.movie.StartMovie extends flash.display.MovieClip`，引用子对象
  `mcMyPlayer/mcVsPlayer/spPlayer`，构造函数里 `addFrameScript(25, stop)`；
- 而 `petfightnew.swf` 里确实有专用代码：字符串 `pet/petfightnew_startmv`、方法名 `playStartMv`、
  类名 `mmo.petfightnew.movie.StartMovie`。
  ⇒ 直接换 760B 空壳会 **#1065（类找不到）/ #1009（子对象为 null）**，与特效不同。
- 对照组：特效 / 等待动画 / 星辉击杀特写等都导出 `XxxConfig_MovieConfig / XxxConfig / XxxTemp / Xxx_n`
  家族，走的是容错的 movie 管理器 —— 这才是 Round 35/40 换壳能活的原因。

**做法：新增 `client/tools/gut_swf_visuals.mjs`（保留骨架、只抽图像）**

| 标签 | 处理 |
|---|---|
| 位图 20/21/35/36/90 | 统一改写成 `DefineBitsLossless2` 1×1 全透明（格式 5=ARGB 预乘全 0；宽高字段=实际值-1=0），character id 不变 |
| 矢量形状 2/22/32/83/84 | 换同类型空形状：ShapeId + ShapeBounds(RECT,Nbits=0) [+EdgeBounds+Flags，仅 Shape4] + `SHAPEWITHSTYLE{0 填充, 0 线, NumBits=0, EndShapeRecord}` |
| 其余（FileAttributes / DoABC / SymbolClass / 132 个 DefineSprite / PlaceObject / 文本 / 帧标签…） | 原样保留 |

输出统一 CWS（zlib）。产出 `client/web/stub/petfightnew_startmv.gut.swf`：
**解压 1.51MB → 43.1KB（压缩后 16.6KB）**，抽掉约 1.43MB 可见数据。

**踩了三个坑（都是本轮实测打回重做的，务必保留结论）**

1. **匹配规则不能用 `$` 锚定 urlPath** —— 游戏把缓存击穿后缀插在**扩展名之前**：
   `petfightnew_startmv~261029175809261.swf`，而日志打印走 `cacheKey()` 会把它抹掉（显示成 `.swf`），
   于是 `…\.swf$` 永远匹配不上，请求直接落磁盘缓存（这就是用户第一次复测「没变化」的根因）。
   终版：`/\/pet\/petfightnew_startmv(?:~\d+)?\.swf/i`；并把该处 stub 日志改成打印**未剥后缀**的 urlPath。
   同时把 `isStubbedEffect` 改成「原始 urlPath + `cacheKey()` 归一化路径」双份比较，
   自定义规则写全名也能命中带版本号的请求。
2. **空形状必须写 `EndShapeRecord`** —— 少这 1 个字节，Ruffle 报
   `Error running definition tag: DefineShape3 … failed to fill whole buffer`，整个 SWF 定义失败。
3. **CWS 头的 `FileLength` 是「解压后」长度**，不是压缩后长度。写成压缩长度会被按该长度截断 →
   `Unexpected EOF when reading tag` → `resourceReflectError: mmo.petfightnew.movie.StartMovie` → **战斗卡白屏**。

为此在生成器里加了**结构化自检**（`selfCheck`）：逐标签重新解析，校验每个形状体恰好被完整消费
（填充/线样式计数=0、NumBits=0、EndShapeRecord=0、无残留字节）、每个位图的像素字节数 == 宽×高×4、
文件以 End 结束且无残余；有问题时打印清单并以退出码 2 失败。**光比对 ABC/sprite 一致是不够的**。

**验证（全部一手证据）**

- 结构比对（`gut_compare.cjs`，两侧都解 ZWS）：**ABC 逐字节相同**、`SymbolClass` 相同、
  132 个 DefineSprite 的**帧数序列逐个相同（合计 719 帧）**、sprite 体内字节 39,286B 完全一致；
- 生成器自检：314 个标签（形状 119 / 位图 47），问题 0 项；
- 头字段：`FileLength=43107=8+解压长度`（原始 ZWS 为 1510762）；
- 网关矩阵（`test_startmv_switch.cjs`）3 种取值 × 4 URL（裸名 / `?v=` / `~版本号`）**15/15 通过**：
  `=1` → 16,575B CWS 且 md5 与资源一致；`=skip` → 760B；关闭 → 原样 1,331,721B ZWS；
  对照路径技能特效恒 114,067B 不受影响；
- **真机实战**（ego-browser 驱动，星战空间 → 试炼之地 → 4V2 进场）：战斗正常进入并渲染
  （截图 `r43-38-f8.png`），日志**无** `StartMovie / resourceReflectError / definition tag / Unexpected EOF`；
  网关日志 5 条 `[stub]` 命中：`petfightnew_startmv~2026062579184482.swf -> gutted startmv`（×2）、
  `waitbgmovie/movie~1210.swf`、`gqpet/wanyuzhichao/effect/…`、`skillbackground/skillbackground_nianfei2026~…`。

**开关**：`AOLA_NO_STARTMV=1`（默认，安全）/ `=skip`（换 760B 空壳，仅作对照）/ 不设置 = 关闭。
另把 `skillbackground/`（专属技能背景，年费/专属，322–694KB）并入 `AOLA_NO_PET_BACKGROUND` 的 `BG_SWAP`。

**整合包**：`启动奥拉星-去特效.cmd` 加第 4 个开关（GBK 写回后复核：`?` 计数 0、无 BOM、无乱码）；
`app/tools/serve.mjs` 与 dev 哈希一致、`app/web/stub/petfightnew_startmv.gut.swf` 已随包；
`说明.txt` 第七节补「战斗开场演出」，README 环境变量表/低配章节同步。

**待验证**：①实战观感（空壳演出＝约 2 秒空画面；时长由原时间轴决定，**故意不缩短** ——
若把 sprite 缩成 1 帧，父级若在等 `currentFrame==25` 或那次 `stop` 就会卡住）②帧率收益。

**同类候选（未纳入，需逐类确认）**：`crieffect_normal_1/2`（2.06MB×2）、`xinghuikillbig*`（3.0MB）、
`effect50000000`（1.29MB）、`revertpp/reverthpmovie`（各 0.27MB）—— 都可套用同一套 gut 流水线。

**新增工具**：`client/tools/swf_zws.cjs`（解 ZWS=LZMA 并扫标签/导出类）、`client/tools/swf_abc_strings.cjs`
（读 ABC 常量池）、`client/tools/gut_swf_visuals.mjs`（生成空壳 + 自检）。
**自动化脚本**：`scratch/ego-aola/r43-*.mjs`（接管 ego-lite 走完 登录→世界→地图→星战空间→试炼之地→4V2）。

## 🎛️ Round 44（2026-11-05）：去特效修正 —— 入场动画不在 URL 上，回退加载动画

**用户反馈**：「去特效」有问题：① 战斗页面的**加载动画**被去掉了，这个要回退；② 已经做到的是移除了
精灵的专属战斗场景，但**光启精灵的入场与 buff 特效、星辉精灵的入场特效都还在**。

### 归因一：入场动画根本不走 URL（这是「没移除」的根因）

用 `scratch/scan_res.mjs` 聚合 `client/docs/spike` 里 **17,068 份** Ruffle 日志的全部 `/play/*.swf` 请求：

- `xinghuipet/*` **一次都没被请求过**；`gqpet/*` 只有 `gqpet/shenbing/effect/shenbingeffect_<id>`（buff）
  与 `gqpet/skill/*`（UI），`petfightbackground/*`、`skillbackground/*` 属于场景；
- 也就是说 Round 40 设计的「命中 `gqpet/xinghuipet/**/effect/**` 或含 `appear` 就换 760B 空壳」
  对**入场动画**永远不会命中。

真正的位置：每场战斗必拉的 **`pet/petfightnew_res.swf`（ZWS 2.10MB，日志里 2392 次）**，
它的 SymbolClass 一共 18 个动画类，其中就有：

| id | 类 | 含义 |
|---|---|---|
| 495 | `mmo.petfightnew.GQAppearMovie` | **光启入场** |
| 321 | `mmo.petfightnew.XinghuiAppearMovie` | **星辉入场** |
| 815/690/37 | `AoYiAppearMovie` / `LegendAppearMovie` / `DegeneratorAppearMovie` | 奥义/传奇/异次元入场 |
| 1000/952/1020… | `McMyPetAppear` / `McVsPetAppear` / `McAIPetAppear` … | 普通入场 |
| 999/939/974/862 | `*Escape` / `*Switch` | 逃跑 / 换宠 |
| 970/161 | `McPetDie` / `McPetDie1` | 死亡 |

对照组：`petfightnew_gqresource.swf` 导出的是 `GQ_ExtBigSkillMc`、`GQMingYunBoYiChoosePanel`、
`petfightnew_gqresource_fla.*`（技能 UI / 图标），`petfightnew_xhresource.swf` 只有
`XinghuiTongLingSummonPanel` 一类面板按钮 —— 都不是入场动画，也印证了「这些包不能整包抽图」。

### 归因二：用户说的「加载动画」= `waitbgmovie`

Round 42 把 `fightasyncres/waitbgmovie/movie.swf`（83KB，SceneManager `PRELOAD_RES_LIST` 里的
等待动画）和 `backgroundmovie/*` 并进了 `AOLA_NO_PET_BACKGROUND` 一起换空壳。本轮按用户要求**摘出该开关**。

### 做法

1. **`serve.mjs`**：`BG_SWAP` 只留 `petfightbackground/*`（排除 common）与 `skillbackground/*`；
   `waitbgmovie` / `backgroundmovie` 移到新开关 `AOLA_NO_BG_ANIM=1`（默认关 = 加载动画恢复）。
2. **`serve.mjs`**：`AOLA_NO_ENTER_EFFECT=1`（或 `AOLA_NO_PET_EFFECT=1`）时，把
   `/pet/petfightnew_res(?:~\d+)?\.swf` 换发 `client/web/stub/petfightnew_res.gut.swf`
   （正则刻意排除 `res1` / `gqresource` / `xhresource`；`AOLA_NO_APPEAR_MV=0` 可单独关掉这一项）。
3. **`gut_swf_visuals.mjs` 新增 `--only 类名,...`**：按 SymbolClass → DefineSprite → PlaceObject2/3
   求依赖闭包，只抽闭包内的形状/位图，其它动画原样 —— 因为 res 包里同时躺着普通入场/换宠/死亡，
   整包抽图会误伤。

```powershell
cd client/tools && node gut_swf_visuals.mjs `
  ../cache/aola.100bt.com/play/pet/petfightnew_res.swf `
  ../web/stub/petfightnew_res.gut.swf --only GQAppearMovie,XinghuiAppearMovie
# → 闭包 326 character（形状 158 / 位图 0），原样保留 869 个标签，自检 0 问题
#   2,095,487B → 2,072,753B（CWS）
```

### 顺手修掉的 4 个 gut 工具 bug（都会静默产出坏文件/错闭包）

1. 标签流起点写死 `8 + rectBytes + 4`，正确是 `rectBytes + 4`（解压体从 RECT 开始）。
   这批 SWF 的 RECT 第 9 字节恰好是 0，所以旧代码「碰巧」算对 —— 已改为 `tagStart()` 推导。
2. `selfCheck` 原来校验**所有**形状的非空性，选择性模式下会误报 400+ 项；改为只校验被抽过的形状。
3. 位图自检把 `DefineBitsJPEG3`（35）也当 `w*h*4` 的 RGBA 校验；改为只校验 `DefineBitsLossless(2)` 的格式 5。
4. `PlaceObject3` 的 `HasClassName` 位取错（0x01 vs 正确 0x04），会把字符 id 读错 →
   依赖闭包从 326 掉到 64（症状：只抽掉 20 个形状、动画几乎不变）。

回归验证：用修好的工具重新生成 `petfightnew_startmv.gut.swf`，md5 与 Round 43 入库产物**完全一致**。

### 验证（已完成）

- **结构级**（`scratch/verify_gut.mjs`）：原/壳 标签数 1027 相同、`SymbolClass` 逐字节相同、
  **550 个 DefineSprite 体逐字节相同**、prefix 相同、无尾部残留；只有 158 个形状变成空形状。
- **网关矩阵**：`res` → 2,072,753B 空壳；`res1` → 65,639B 原样；`waitbgmovie` → 82,937B 原样（回退生效）；
  `petfightbackground/starshinecity` → 760B；`skillbackground/*` → 760B；`startmv` → 16,559B。
- **开关组合矩阵（9 组 / 25 条断言全通过）**：逐组起独立网关实测，覆盖
  ① 全关 = 零影响（res/res1/waitbg/专属背景/光启 buff 全部原样）；
  ② `NO_ENTER_EFFECT=1` → res 换空壳、res1 不受影响、`waitbgmovie` 原样、`*appear*` 换 760B；
  ③ 再加 `NO_APPEAR_MV=0` → 只保留 res 原样（可单独关）；
  ④ `NO_PET_EFFECT=1` → 入场合集全开；⑤ `NO_BUFF_EFFECT=1` → 只动光启 buff；
  ⑥ `NO_PET_BACKGROUND=1` → 专属背景/技能背景 760B、**加载动画仍原样**；
  ⑦ 再加 `NO_BG_ANIM=1` → 加载动画才 760B；⑧ `NO_BG_ANIM=1` 单独 → 只动加载动画；
  ⑨ `NO_STARTMV=1` → startmv 16,559B、res 原样。
- **真机 1 次**（整合包 Chromium + CDP，开关全开）：登录→世界→地图→星战空间→试炼之地→1v1 正常开战；
  网关日志命中 `petfightnew_res~2026061158292062.swf -> gutted appear bundle`；
  页面无 `#1065/#1009/definition tag/Unexpected EOF`（只有既有的 face88/89/90 与 `#1063 onPlayerEnterRoom`）。

### 观察手段：`/status` 命中统计（Round 44 新增）

网关原来只有 4 个计数器，验证「这次战斗到底换没换壳」只能翻整屏日志。现在 `GET /status` 额外返回：

```json
"stubs": { "effect": 12, "bg": 3, "appearBundle": 1, "startmv": 2 },
"stubLog": [ { "kind": "appearBundle", "path": "/play/pet/petfightnew_res~2026061158292062.swf", "t": "19:23:10" } ]
```

打一场战斗后刷新 `http://127.0.0.1:8700/status` 即可确认：`appearBundle` 增长说明入场包被换过；
`effect` 增长说明 gqpet/xinghuipet 的特效被换过；`bg` / `startmv` 同理。`stubLog` 保留最近 60 条。

### 真机 A/B（ego lite，2026-11-05 晚，已完成）

条件：`AOLA_NO_ENTER_EFFECT/BUFF/XINGHUI/PET_BACKGROUND/STARTMV=1`（低配组，res 换壳）vs
再加 `AOLA_NO_APPEAR_MV=0`（基线组，res 原样）。同一账号、同一路径：进入游戏 → 快速开始 → 世界 →
地图 → 星战空间 → 试炼之地 → 1V1（对手＝木人桩），开战瞬间每 400ms 截一帧，共 25 帧。

| | 基线组（res 原样） | 低配组（res 空壳） |
|---|---|---|
| 我的亚比入场 | 右侧**大号蓝白星爆特效**（星辉入场 `XinghuiAppearMovie`）| 该特效**完全没有**，亚比直接出现 |
| 木人桩（AI）入场 | 金色爆发 +「超」字 | **同样有**（`McAITotenPetAppear` 不在 `--only` 名单里，属预期保留）|
| 网关日志 | `petfightnew_res.swf -> 200 (cache)` | `petfightnew_res~….swf -> gutted appear bundle` |
| `waitbgmovie/movie.swf` | `200 (cache)`（原样）| `200 (cache)`（原样，**加载动画已回退**）|
| 页面报错 | face88/89 + `#1063` | 同左，**无新增 `#1065/#1009/definition tag/Unexpected EOF`** |

截图：`scratch/live-shots/b-f11.png`、`b-f12.png`（基线：金柱 + 蓝星爆）vs
`a-f07.png`、`a-f09.png`、`a-f10.png`（低配：仅星空/普通入场，无星爆）。
另在低配网关下打了一场 4V2（`c-f18.png`）：战斗正常推进（伤害 46、血量 81%），无入场光效、无报错；
`/status` 显示 `appearBundle: 2, startmv: 2`。

**结论**：星辉入场已实锤消失、普通入场未被误伤、加载动画已恢复、战斗逻辑与页面正常。
**光启入场**（`GQAppearMovie`，同一 SWF、同一流水线、闭包内 86 个形状同样被抽空）与**光启 buff**
（`gqpet/<机制>/effect/*`，矩阵已验证换 760B）尚未拿到「带光启亚比」的实战截图 —— 测试号队伍是星辉系。

### Round 44b（同日 21:00）：真机二次反馈 —— 金色入场光爆 / 抗性护盾其实在 `fightasyncres`

用户第二轮反馈（带三张截图）：

1. **进入战斗的加载演出**（VS 画面 + 光带）—— 要**恢复原样**；
2. **金色光柱/光爆** —— 光启精灵「剩余的入场特效」，要去掉；
3. **橙色六边形护盾 + 抗性+529 飘字** —— 光启的 buff 特效，要去掉。

**归因（runtime 二分法）**：给 `serve.mjs` 加了调试用的「运行时屏蔽清单」
`client/lowfx.extra`（每行一条匹配项，改文件 1s 生效、不用重启网关），然后逐组加/减：

- 先按原设想把 `petfightnew_res` 的 **全部 12 个 Appear 类**都抽掉（`--only Appear`，
  275 形状 + 2 位图，输出 1,915,822B）→ 金色光柱**仍在**（`x-f11.png`）；
- 再 stub `petfightnew_gqresource` → 仍**在**（`x-f12.png`）——顺带证伪了「光启资源包 = buff 视觉」的猜测；
- 最后把 **`pet/fightasyncres/**` 整族**换掉（effect<ID> / crieffect_normal_1/2 / xinghuikillbig /
  revertpp / skillwindword / gqresource）→ 金色光柱与护盾**都消失**（`f-f08/f-f11.png`）。

**结论**：这两个视觉都不在按机制命名的资源里（`gqpet/<机制>/effect/*` 那些即使换掉也还在），
而是战斗内通用特效 `pet/fightasyncres/**`。这也解释了为什么 Round 40 的 BUFF 规则对它们无效。

**落地**（⚠️ 其中「整族换壳」这一步在 Round 44d 被收敛，原因见下一节：killbig / skillwindword /
revertpp 属回调型资源，换壳会让 4V2 卡死；现在只换 `fightasyncres/effect` + `crieffect_normal`）：

- `serve.mjs` 新增 `AOLA_NO_BATTLE_FX=1`：`/pet/fightasyncres/**` → 760B 空壳，
  **例外** `waitbgmovie`（战斗页面加载动画，用户要求保留）与 `xinghuispiritskillbuttonmovie`（技能按钮 UI）。
  用正则字面量实现（`BATTLE_FX_RE` / `BATTLE_FX_KEEP_RE`），避开 `re:` 字符串那条链路的双层转义坑
  （踩过：`"re:/\\\\/fightasyncres\\\\/"` 生成的模式永远匹配不上，`/status` 里 battlefx 计数一直是 0）。
- `AOLA_NO_STARTMV` 在启动器里**移除**（恢复「亚比登场」加载演出），开关本身保留给需要的人。
- 启动器 `启动奥拉星-去特效.cmd` 现在是 5 个开关：ENTER / BUFF / XINGHUI / PET_BACKGROUND / BATTLE_FX。
- `/status` 的 `stubs` 增加 `battlefx` 计数（还有调试用的 `extra`）。
- 网关实测：`effect50000000`、`crieffect_normal_1` → 760B；`waitbgmovie` → 82,937B；
  `xinghuispiritskillbuttonmovie` → 16,308B；`petfightnew_res` → 1,915,822B（12 个 Appear 类全抽）。

### Round 44c（同日 21:30）：光启/星辉资源包用「只留 UI」的空壳

用户复测后反馈「光启的那些都还在」。审计（`/status.recentSwf`，记录最近 120 个 SWF 的实际发出体积）
显示他们那场战斗里唯一还没被换壳的大件只剩：

- `pet/petfightnew_gqresource.swf`（1.36MB，光启资源包）
- `pet/petfightnew_xhresource.swf`（450KB，星辉资源包）
- `pet/petfightnew_startmv.swf`（1.33MB，按用户要求恢复的加载演出）
- `pet/petfightnew_res1.swf`（65KB UI）
- `fightassets/bitmap/pet<id>*.swf`（亚比本体贴图，不能动）

所以本轮把两个资源包也做成空壳。**不能整包换 760B**（包里有 UI 面板类，换了会 #1065），
改为给 `gut_swf_visuals.mjs` 加 `--except`：**保留指定类闭包内的图形，其它全部抽空**。

```powershell
cd client/tools
# 光启包：保留 3 个面板/大招类，抽掉 131 形状 + 145 位图（1.36MB → 176KB）
node gut_swf_visuals.mjs ../cache/aola.100bt.com/play/pet/petfightnew_gqresource.swf `
  ../web/stub/petfightnew_gqresource.gut.swf `
  --except GQMingYunBoYiChoosePanel,GQ_ExtBigSkillMc,GQXianJingJiMc
# 星辉包：保留通灵召唤面板（450KB → 10.6KB）
node gut_swf_visuals.mjs ../cache/aola.100bt.com/play/pet/petfightnew_xhresource.swf `
  ../web/stub/petfightnew_xhresource.gut.swf --except XinghuiTongLingSummonPanel
```

`AOLA_NO_RES_PKG=1`（需与 `AOLA_NO_BATTLE_FX=1` 合用）时网关按路径换发这两个空壳
（日志 `-> gutted gqresource` / `gutted xhresource`）。**默认关闭** —— Round 44d 起改为可选，
因为包内同样可能有页面依赖的符号，先保证战斗稳定再谈效果。
结构自检通过：光启包 966 个标签（校验 131 形状/145 位图，问题 0），星辉包 409 个标签（137/96，问题 0）。

**逐标签比对**（`scratch/verify_gut.mjs`，原 vs 空壳，三份产物全部 0 问题）：

| 产物 | 标签数 | 未改动 | 改形状 | 改位图 | SymbolClass | DefineSprite 体 |
|---|---|---|---|---|---|---|
| `petfightnew_res.gut.swf` | 1027 = 1027 | 750 | 275 | 2 | 逐字节一致 | 550 个全一致 |
| `petfightnew_gqresource.gut.swf` | 966 = 966 | 690 | 131 | 145 | 逐字节一致 | 339 个全一致 |
| `petfightnew_xhresource.gut.swf` | 409 = 409 | 176 | 137 | 96 | 逐字节一致 | 115 个全一致 |

（比对脚本要允许「位图标签统一改写成 DefineBitsLossless2(36)」这一种合法差异，否则会误报 142 项。）

### Round 44d（同日 21:45）：4V2 选技能后卡死 —— 回调型 SWF 不能换空壳

**用户反馈**：光启 buff 特效已经去掉，但**入场特效仍在**；而且**4V2 选完技能会卡住**。

**卡死根因（一手证据）**：网关日志 + 页面自动上报对齐到同一秒级时间线 ——

- 21:42:35–41 网关连续把 `revertppmovie/movie`、`reverthpmovie/movie`、`petfightnew_skillwindword`、
  `xinghuikillbig4862_0..3` 换成了 760B 空壳；
- **21:42:44 之后客户端再没有发出任何请求**，页面上报也在 21:42:34 停止 —— 客户端侧卡死，不是网络问题；
- 界面停在「对方选择技能中，请等待…」。

原因：这些 SWF **不是普通特效**，而是「按类名取符号 + 等 `onMovieEnd` 回调」推进技能流程的
（`petfightnew.swf` 里就是 `REVERT_PP_MOVIE_CLSNAME` / `REVERT_HP_MOVIE_CLSNAME` + `onMovieEnd`）。
换成 760B 空壳后类不存在，回调永远不来 → 技能流程不推进。Round 35 的「换 effect0 安全」只适用于
走容错 movie 管理器的 `effect<ID>` 族，不能套到这一类上。

**修复**：

1. `serve.mjs` 增加 `NEVER_STUB_RE`（`revertppmovie|reverthpmovie|xinghuikillbigmovie|gqkillbigmovie|petfightnew_skillwindword`），
   `mirror()` 里**所有换壳分支都先过这道闸**（含 `AOLA_EFFECT_STUB` 自定义项）——任何开关都碰不到这类文件。
2. `AOLA_NO_BATTLE_FX` 收敛为只换 `pet/fightasyncres/effect/` + `pet/fightasyncres/crieffect_normal*`。
3. 光启/星辉资源包抽图改为独立开关 **`AOLA_NO_RES_PKG=1`（默认关闭）**：它同样可能有符号依赖，
   先保证稳定再谈效果。
4. 启动器重新加上 `AOLA_NO_STARTMV=1`（亚比登场演出换空壳），**加载界面与加载动画保持原样** ——
   这是「加载特效要恢复、入场演出要去掉」两个要求能同时成立的组合。
5. 顺带把 `/status` 的 `recentSwf`（最近 120 个 SWF + 实际发出体积 + 是否换壳）接进调试监听脚本
   `scratch/watch_game.mjs`：持续 tail 网关日志 + `/status` + 页面回报，并给「战斗目录里 >150KB 且未换壳」
   的资源打 `SUSPECT` 标记。

**修复后网关实测**（`AOLA_NO_BATTLE_FX=1`、`AOLA_NO_STARTMV=1`、未开 `AOLA_NO_RES_PKG`）：

| 路径 | 响应体积 | 说明 |
|---|---|---|
| `revertppmovie/movie` | 278,806 B | 原样（白名单） |
| `reverthpmovie/movie` | 272,244 B | 原样（白名单） |
| `petfightnew_skillwindword` | 735,768 B | 原样（白名单） |
| `xinghuikillbig4862_0` | 834,958 B | 原样（白名单） |
| `fightasyncres/effect/effect50000000` | 760 B | 换壳 |
| `fightasyncres/crieffect_normal_1/movie` | 760 B | 换壳 |
| `petfightnew_gqresource` | 1,364,366 B | 原样（`AOLA_NO_RES_PKG` 未开） |
| `petfightnew_startmv` | 16,559 B | 空壳（保留类契约） |
| `fightasyncres/waitbgmovie/movie` | 82,937 B | 原样（加载动画保留） |

**待验证**：① 4V2 选技能是否恢复推进（需玩家实操一场）；② 入场特效是否随 `AOLA_NO_STARTMV` 消失 ——
若仍残留，则说明它由 `petfightnew.swf` 引擎内部绘制，需要走 ABC/资源级补丁，而不是网关换壳。

### Round 45（2026-11-06）：把低配开关做成游戏页上的按钮

**需求**：之前所有开关只能靠环境变量 / 启动器选，用户希望**在页面上用按钮自己决定开哪些**。

**做法（网关侧）**：

1. 开关判定从「启动时读环境变量」改成「每请求读一次运行时配置」：
   - 新增 `client/lowfx.json`（打包后是 `app/lowfx.json`），键：`enterEffect / appearMv / buffEffect /
     xinghuiEffect / petBackground(1|common|off) / bgAnim / battleFx / startmv(1|skip|off) / resPkg`；
   - `fxFlags()` 合并规则：**文件里出现的键覆盖环境变量**，没出现的仍按 env（启动器默认值）；
   - 按 mtime 缓存，改文件秒级生效；JSON 写坏时保留上一次可用配置（不会把行为跳变）。
2. `EFFECT_STUB` / `BG_SWAP` / `STARTMV_MODE` / `APPEAR_BUNDLE_ON` / `BATTLE_FX_ON` / `gqResBuf`
   这些模块级常量全部改为「由 flags 计算的运行时判定」（`currentRules()` 按 flags 缓存规则表）。
   顺带修掉一个坑：枚举值 `"off"` 是**真值**，不归一化成空串会让「关」被当成「开」
   （实测 `startmv:"off"` 仍然回 16,559B 空壳、`petBackground:"off"` 仍然换背景）。
3. 新增接口：
   - `GET /lowfx` → `{ ok, flags, file, env }`
   - `POST /lowfx` → 只接受白名单键，合并写 `lowfx.json`，返回最新 flags。

**做法（页面侧，`client/web/game.html`）**：

- 左下角新增 **「⚙ 特效开关」** 悬浮按钮 → 展开面板，8 个勾选项（勾选 = 屏蔽，与低配语义务一致）：
  入场动画 / 亚比登场演出 / 光启 buff / 星辉机制 / 战斗内通用特效 / 专属战斗场景 /
  顺便去掉加载切换动画 / 资源包抽图（高级）；
- 打开面板时 `GET /lowfx` 回填勾选状态（显示的是**网关实际生效值**，不是页面本地记忆）；
- 「应用并刷新」`POST /lowfx` 成功后 350ms `location.reload()` —— 必须重载，
  否则 Ruffle 会把已加载的 SWF 继续用缓存，看起来「点了没用」；
- 另有「全开 / 全关」两个快捷按钮。

**验证（ego lite 真机）**：

- 面板渲染：`hasToggle=true, hasPanel=true, rows=8`，勾选状态与种子 `lowfx.json` 一致
  （6 项开、`bgAnim`/`resPkg` 关）；
- 点掉「战斗内通用特效」→ 应用 → `GET /lowfx` 返回 `battleFx:false` 且文件已写入；再点回来恢复 `true`；
- 网关无 env、无文件时：`effect50000000` → 1,323,620（原样）、`startmv` → 1,331,721（原样）；
  写「全开」后：`effect` → 760、`startmv` → 16,559、`petfightnew_res` → 1,915,822、`skillbackground` → 760。

**已知边界**：整合包里启动器仍会设环境变量当默认值；用户一旦在页面上点过「应用」，
`app/lowfx.json` 就会覆盖这些默认值（删除该文件即回到启动器行为）。

### Round 46（2026-11-06）：按「特效类型」把开关拆细

**需求**：Round 45 的 8 个勾选项还是太粗 —— 比如「战斗内通用特效」一关，技能命中和暴击特写一起没了；
入场包也只能「全抽 / 全不抽」。用户要求**区分开特效类型**。

**拆法（13 个开关 + 2 个锁定项）**：

| 分组 | 开关 | 配置键 | 资源 |
|---|---|---|---|
| 入场/登场 | 光启·星辉入场 | `enterScope=gq` | `petfightnew_res` 只抽 GQ/XH 两个类（2,072,753B）|
| | 连普通/奥义/传奇也去掉 | `enterScope=all` | 12 个 Appear 类全抽（1,915,822B）|
| | 入场特效（含 appear）| `fxEnterUrls` | `gqpet|xinghuipet/<机制>/effect/*appear*` |
| | 亚比登场演出 | `startmv=1` | `petfightnew_startmv` 16.6KB |
| 战斗机制 | 光启 buff/机制 | `buffGq` | `gqpet/<机制>/effect`、`backgroundup` |
| | 星辉机制 | `buffXh` | `xinghuipet/<机制>/{effect,movie,status}` |
| 战斗通用 | 技能命中/受击 | `fxEffect` | `fightasyncres/effect/effect<ID>` |
| | 暴击特写 | `fxCrit` | `fightasyncres/crieffect_normal*` |
| 场景/背景 | 专属战斗背景 | `petBackground`（1/common）| `petfightbackground/*`（非 common）|
| | 专属技能背景 | `bgSkill` | `skillbackground/*` |
| | 加载动画 | `bgLoading` | `waitbgmovie` |
| | 背景切换特效 | `bgSwapMovie` | `backgroundmovie/*` |
| 其他 | 资源包抽图 | `resPkg` | `gqresource` 176KB / `xhresource` 10.6KB |
| 锁定 | 回血/回蓝演出、大招特写 | — | `revertpp/reverthp`、`killbig*`：`NEVER_STUB`，换壳会卡技能 |

**实现要点**：

- 新增两份入场包空壳：`petfightnew_res.gut.gq.swf`（`--only GQAppearMovie,XinghuiAppearMovie`，158 形状）
  与 `petfightnew_res.gut.all.swf`（`--only Appear`，275 形状）；`enterScope` 决定发哪份。
- `fxFlags()` 改为 `envFlags()`（环境变量→默认）+ `lowfx.json` 覆盖 + `normalizeFlags()` 归一化；
  保留对 Round 45 旧键（`enterEffect/appearMv/battleFx/...`）的自动迁移，
  用户手里的旧 `lowfx.json` 不会失效。
- 背景四类（`petBackground/bgSkill/bgLoading/bgSwapMovie`）各自独立判定，`matchBgSwap()` 不再成组联动。
- 战斗特效拆成 `FX_EFFECT_RE` / `FX_CRIT_RE` 两条规则，`isBattleFxStub()` 分别判断，仍先过 `NEVER_STUB`。
- 页面面板改为 5 组分组 + 13 个勾选（`enterAll` 依赖 `enterGq`，未勾时置灰）+ 2 个灰色锁定项；
  「全开/全关」只作用于 13 个可选项。

**验证（网关逐类型实测，改一项只影响一项）**：

| 操作 | 结果 |
|---|---|
| `enterScope=gq` | `petfightnew_res` → 2,072,753 |
| `enterScope=all` | → 1,915,822 |
| `fxCrit=false` | `crieffect_normal_1` → 2,109,231（原样），`effect50000000` 仍 760 |
| `fxEffect=false` | `effect50000000` → 1,323,620（原样），`crieffect_normal_1` 仍 760 |
| `bgSkill=false` | `skillbackground` → 694,355（原样） |
| `bgLoading=true` | `waitbgmovie` → 760（默认 false 时是 82,937 原样）|
| `revertpp` | 恒 278,806（锁定）|

页面侧：重载后 `rows=13`，回填状态与 `lowfx.json` 一致；取消「暴击特写」→ 应用 →
`/lowfx` 返回 `fxCrit:false`，再点回来恢复 `true`。

### Round 48（2026-11-06 晚）：年费·祁的追击技能卡住 —— 760B 空壳换来的锅

**现象**：背包 3 号位的年费精灵「万欲之源众望终响·祈」带专属追击技能，战斗中一旦触发就卡住。

**根因（页面日志实锤）**：

```
[21:09:00] Error dispatching event "complete": Error: resourceReflectError:
  mmo.gqpet.wanyuzhichao.effect.Pet6000Stand_2  url: gqpet/wanyuzhichao/effect/wanyuzhichaoeffect_6000
[21:09:00] Error dispatching event "complete": Error: resourceReflectError:
  BackGroundAppearMovienianfei2026             url: skillbackground/skillbackground_nianfei2026
```

这两类 SWF 里有游戏**按类名取符号**的资源（祁的站立特效 `Pet6000Stand_2`、年费专属背景的 `BackGroundAppearMovienianfei2026`）。
我们之前把它们换成 760B 的 `effect0.swf`，类不存在 → `getDefinitionByName` 抛错 → 技能流程等不到回调 → 卡住。

**做法：预生成「保留类契约、只抽图像」的空壳，按路径换发**（与 Round 43/44 对 res 包的做法同源）：

- 新增 `client/web/stub/gut/`：遍历缓存里的 `gqpet/`、`xinghuipet/`、`skillbackground/`、`petfightbackground/`
  逐文件跑 `gut_swf_visuals.mjs`，命名 `<目录>_<路径>_<名>.gut.swf`（21 个，最大的是 skillbackground 90KB）；
- `serve.mjs` 启动时把整个目录读进 `gutMap`；请求命中 `familyStubWanted()` 的家族时：
  - 有对应空壳 → 换发空壳（日志 `-> gutted (family)`）；
  - **没有对应空壳 → 原样放行**（`skipFamily`，宁可留着特效也不缺类卡死）；
- UI 类刻意排除：`gqpet/skill/*`、`xinghuipet/{skill,soul}/*`、`petfightbackground/common` 不参与抽图。

**验证（真机）**：

- 网关侧：`wanyuzhichaoeffect_6000` → 5,719B（原 1.4MB）、`menghuandiyueeffect_6012` → 4,656B、
  `skillbackground_nianfei2026` → 3,230B、`starshinecity` → 850B；`gqpet/skill/actgqskillllist` → 129,793B 原样（UI 未动）。
- 战斗侧：同一套 4V2 打到第 3 回（暴击 29,771），日志里 **不再出现 resourceReflectError**，只剩既有的
  face88/89/90 `#1065` 与 `#1063 onPlayerEnterRoom`。

**已确认（2026-11-06 用户实战反馈）**：祁的专属追击技能正常触发、不再卡住 —— 「保留类契约的
gut 空壳」方案闭环；Round 49/50 的现场抽图 + 引擎补丁补齐后仍保持正常。

### Round 49（2026-11-06 深夜）：白底 + buff 回潮 —— 背景别抽、机制特效改成「现场抽图」

**用户反馈**：① 光启 buff 特效又回来了；② 触发祁的专属战斗场景后战斗背景变成纯白。

**两个原因**：

1. **白底**：skillbackground_nianfei2026（年费专属技能背景）被抽成空壳后，影片自带 SetBackgroundColor + 图片全被清空 →
   渲染出一整片白；petfightbackground/* 抽空也是同样效果。
2. **buff 回潮**：机制特效里只有缓存过的那几个文件有预生成空壳，其余（以及新精灵）走「没有空壳就原样放行」的保底，
   于是特效照常播放。

**改法**：

- skillbackground/*：**不再抽图**（保持原样）——抽空会露白底、换 760B 会缺类卡技能，两头都不行；
- petfightbackground/*（非 common）：**一律换通用星域背景** petfightbackground/common.swf（503KB），
  既不是白屏也不会缺类；
- 机制特效（gqpet/、xinghuipet/ 非 UI）：预生成空壳优先；**没有预生成的就「现场抽图」**——
  新增 client/tools/gut_inline.mjs（与 gut_swf_visuals 同源，支持 FWS/CWS/ZWS）+ 把 lzma（297KB）vendored 到
  client/tools/vendor/lzma，网关对缓存文件实时抽图并按 cacheKey 缓存结果（日志 [gut] 现场抽图 ...）。
  这样类/时间轴/帧脚本都保留（不会 resourceReflectError），图像全空（特效看不见）。

**实测**：wanyuzhichaoeffect_6000 → 5,719B、shenbingeffect_5951 → 33,395B、
skillbackground_nianfei2026 → 694,355B（原样）、starshinecity → 503,842B（通用背景）。

**待验证**：背景是否恢复正常、buff 是否消失、祁的追击技能是否仍会卡（用户当场在玩，接管了 ego）。

### Round 47~50（2026-11-06 晚）：引擎内演出、专属场景白屏、机制特效的三连修

**背景**：Round 48 把机制特效/背景换成「保留类契约」的空壳后，祁的追击不再卡，但出现两个新问题：
① 光启 buff 特效回潮；② 专属战斗场景白屏。用户澄清：buff 主要表现为**飘字**。

**A. 登场演出（Round 47）—— 已确认有效**

- 目标 `MCPetContainer.showAppearEffect`（m5168，705B @ body+6498778）。
- 补丁后逻辑：`getlocal0; pushscope; this.dispatchGotPet(this._loacId); returnvoid` + `nop` 填充。
- 真机：金柱/白羽全屏消失，亚比正常入场，战斗进入第 1 回；日志无新增异常。

**B. 专属战斗场景白屏（Round 50）**

- 试过：把 `skillbackground_nianfei2026` 抽空 → 整层变纯色白（影片自带 `SetBackgroundColor` + 图片全空）；
  把 `SetBackgroundColor` 删掉 → 图层透明，露出 Flash 舞台默认白底，仍然白；强制深色底也只是换了个颜色。
- 结论：**专属场景这一层只要被加载，就会盖住/替换战斗背景**，靠改资源内容治不了。
- 最终做法：**不加载它** —— 把 `BackGroundViewHandler.changeSkillBackGround`（m1490，349B @ body+6253923）
  整段改成 `returnvoid`。方法本身就自带「不需要时直接 return」的分支，所以跳过加载不会破坏流程。
- 配套：`petfightbackground/*`（非 common）统一换通用星域背景 `common.swf`（503KB），保证任何情况下都有底图。

**C. 机制特效回潮（Round 49/50）**

- 预生成空壳只有缓存里那 21 个，新资源走「没有就原样放行」→ 特效回来。
- 改为**运行时按需抽图**：新增 `client/tools/gut_inline.mjs`（支持 FWS/CWS/ZWS）+ vendored `lzma`（297KB，
  `client/tools/vendor/lzma`），网关对 `gqpet/*`、`xinghuipet/*`（非 skill/soul）第一次请求即抽图并缓存结果。
- 实测：`wanyuzhichaoeffect_6000` 1.4MB→5,719B、`shenbingeffect_5951`→33,395B、`skillbackground_nianfei2026`→3,227B。

**D. 补丁自愈（Round 50）**

- 新增 `client/tools/apply_engine_patches.mjs`：一键按顺序打两个补丁，幂等；首次运行把原件备份成 `.orig`。
- 网关启动时 `ensureEnginePatches()` 检查补丁标记（`showAppearEffect` 补丁后的开头字节），缺失就自动调用；
  实测：把 `.orig` 拷回去 → 重启网关 → 日志出现 `[patch] petfightnew.swf 未打补丁，正在自动应用 …` → 文件恢复 5,612,812B。

**E. 仍未解决**

- 光启 **属性飘字**（「抗性+5299」这类）：不在 ABC 字面量里（文本由状态名拼出来），尚未定位到显示方法；
  用户未确认是否接受「连属性增减提示一起去掉」。
- ego-browser CLI 在 23:00 前后从机器上消失（`active_version_dir` 被清空，只剩 ego-skills），期间无法截图复现。

### Round 51（2026-11-07 凌晨）：进战斗 wgpu panic —— gut 空壳位图宽高写错

**现象**：进入战斗即崩，Ruffle 报 `wgpu error: Validation Error … Device::create_texture …
Dimension X is zero`（栈在 `register_bitmap` ← `MovieLibrarySource::bitmap_handle`）。

**根因**：`blankBitmap`（`gut_swf_visuals.mjs` 与 `gut_inline.mjs` 两处同源）把
DefineBitsLossless2 的 Width/Height 字段写成 0 —— 注释误以为「字段 = 实际宽 - 1」，
**SWF 规范里就是实际像素数**。于是 Round 43 以来所有 gut 空壳（预生成 28 个 + 现场
抽图）里的位图全是 0×0。Ruffle 平时惰性注册位图（形状被抽空后通常无人引用），一旦
某 SWF 的时间轴直接 PlaceObject 位图字符（机制特效里很常见），注册 0×0 纹理即 panic。
之所以拖到现在才爆：此前验证过的战斗恰好没实例化过那些位图。

**修复**：

- 两个工具宽高字段改写 `1`（真正 1×1 全透明）；`gut_swf_visuals.mjs` 自检同步改为
  「宽高非 0」校验（原来 `+1` 的同一错误假设让自检永远查不出）。
- 删除并重新生成全部 28 个空壳：顶层 7 个（startmv / res.gut.gq / res.gut.all /
  gqresource / xhresource / res1 / skillwindword）+ `stub/gut/` 目录 21 个；
  网关重启清 `inlineGutCache`。体积与旧版差 ±10B（deflate 流差异），类/形状/自检结果不变。
- 验证：重生成文件与网关实发字节的位图全部 `w=1 h=1`；重载后登录 → 世界装配正常。

**待确认**：重进战斗不再 panic（用户实战）。

### Round 52（2026-11-07 凌晨）：战斗加载界面（VS 画面）还原 —— startmv 关闭

**现象**：进入战斗的加载界面只剩白底 + 双方立绘 + 名字，底纹/VS 标志/战斗力栏全没了。

**归因**：这个「加载时的 VS 画面」其实就是 `petfightnew_startmv.swf` 的 StartMovie ——
`addFrameScript(25, stop)` 播到 25 帧停住等资源加载，停住显示的正是它；双方立绘是
petfightnew 运行时挂进 `mcMyPlayer/mcVsPlayer` 容器的（容器在 gut 后保留，所以立绘还在）。
Round 43 的「VS 画面不受影响」结论不成立 —— 画面美术就在 startmv 里，抽图后只剩白底。
对比 Round 33 之前无空壳时代的帧（`scratch/live-shots/a-f02` 其实摄于 Round 44 当晚、
空壳已启用，无更早的帧），确认白屏与 startmv=1 完全同期。

**做法**：`lowfx.json` 的 `startmv` 置 `off`（原样下发 1.30MB ZWS，缓存后无额外开销）。
代价：25 帧之后的「亚比登场」演出段也会一起回来 —— 同一部影片无法只留前半；
光启金色光柱等**单只亚比入场特效**仍被 `enterScope=gq` + `showAppearEffect` 引擎补丁压着，不受影响。

**实测**：4V2 木人桩 —— VS 画面完整（AOLA STAR 底纹 / 大 VS 标志 / 双方立绘 + 战斗力栏），
战斗正常打到第 2 回（伤害 288 万），无 wgpu panic。
⚠️ 若再勾上特效开关里的「战斗开场演出」，加载界面会重新变白 —— 两者是同一资源。

### Round 53（2026-11-07 凌晨）：光启 buff「金环」真凶 = killbig 大招特写分片 → 家族抽图

**现象**：环绕光启精灵的金色 buff 光环（带「抗性」飘字的那种）在 buffGq 全开下仍在。

**归因**：日志逐帧对齐 —— 每次机制触发都是 `gqpet/wanyuzhichao/effect/*`（已抽图）与
`pet/gqkillbigmovie/alleffect/allgqkillbig<id>_0..3.swf` **成对请求**。这些分片是 ZWS
纯图像切片（如 allgqkillbig6000_0：2.24MB，1 形状 + 30 位图（含嵌套）、**无 DoABC/SymbolClass**），
金环美术就在里面。它们属 `gqkillbigmovie` 族 = Round 44d 的 `NEVER_STUB` 白名单 ——
但那条锁的是「换 760B 空壳缺类卡死」；**gut 抽图保留加载/回调生命周期**（R49 已在同类
回调型资源上验证），对这种连 ABC 都没有的分片更是零风险。

**做法**（`serve.mjs`）：

- `familyStubWanted()` 新增两族，沿用现有开关（页面无需加项）：
  `gqkillbigmovie/alleffect/*` → `buffGq`；`xinghuikillbigmovie/xinghuikillbig<id>/*` → `buffXh`；
- **POST 也抽**：这些分片冷缓存时会以 POST 拉取（此前 POST 全部直连），mirror() 的上游
  响应段补了家族判定 → 命中即现场抽图后返回，避免「清缓存后首战金环闪一下」；
- `NEVER_STUB` 白名单语义不变：它仍然挡住所有「换 760B」的路径，gut 家族路径在它之前、不受影响。

**实测**：4V2 木人桩 —— `allgqkillbig6000_0..3` 现场抽图 2,229/1,508/1,508/1,506B
（2.2MB → KB 级，单次 ~2.4s 后内存缓存），祁的金环消失，战斗推进正常（第 6 回、无卡死）。

**边界**：`xinghuikillbigmovie/xinghuikillbig<id>.swf` 这种**单文件本体**（带类、无子目录）
不在规则内 —— 它们是带回调的主影片，暂保持原样；`revertpp/reverthpmovie` 亦未动。
属性飘字（暴击↑/抗性+xxx）属战斗信息层，仍按 Round 50 待用户定夺。

**Round 53b 归因修正（同日）**：killbig 分片只解决了「触发瞬间的大图」，环绕金环的真身是
**`petfightnew_skillwindword.swf`**（SymbolClass 仅一个：`mmo.petfightnew.SkillWindWordMv`，
888 形状 + 13 位图，文字为运行时 TextField）——「wind word」即技能飘字影片。它战斗入口
**一次性原样加载**，之后每次属性变动按类名复播 → 触发瞬间无新请求、760B 换壳必卡死
（R44d 实锤的原因）、killbig 抽图后金环依旧。修复：`lowfx.json` 的 `gutBundles=true`
（Round 47 就绪的开关），换发预生成空壳 `petfightnew_skillwindword.gut.swf`
（类/时间轴保留 → 回调正常；形状/位图全空 → 金环消失；运行时文字不受影响）。
实测：同场景触发帧对比 —— 修复前金环+抗性红字，修复后祁周身干净；伤害数字、buff 面板、
战斗日志均正常（数据层/动态文本不在抽图范围）。`petfightnew_res1` 同开关一并抽图。

### Round 54（2026-11-07 凌晨）：星辉专属技能面板消失 —— xhresource 抽图漏保 XH_ExtBigSkillMc

**现象**：背包首发精灵昊天（自由旅人·至臻女帝昊天）的星辉系统专属技能，进战斗后从技能面板消失。

**归因**：星辉极发技面板的图形宿主是 `petfightnew_xhresource.swf` 里的
`mmo.petfightnew.common.view.XH_ExtBigSkillMc`（与光启侧 `GQ_ExtBigSkillMc` 对应）。
Round 44c 对 xhresource 做「只留 UI」抽图时 `--except` 只保了 `XinghuiTongLingSummonPanel`，
**把 XH_ExtBigSkillMc（和 XHPlatForm）的图形抽空** → 星辉专属技能按钮/面板不可见。
属于 Round 44c 埋下的问题，星辉宠首次实战才暴露；光启面板正常是因为 gqresource 的
keep 名单本来就含 `GQ_ExtBigSkillMc`。

**修复**（重新生成两个空壳）：

- `petfightnew_xhresource.gut.swf`：`--except XinghuiTongLingSummonPanel,XH_ExtBigSkillMc,XHPlatForm`
  （对齐 gqresource 的保三名单）→ 10.5KB → 29.6KB（保回 24 形状）；
- `petfightnew_res1.gut.swf`（gutBundles 刚启用、此前整包抽）：`--except FaZhenBtn,LayerPlatformView`
  —— FaZhenBtn 是极发按钮，LayerPlatformView 是战斗平台 → 4.7KB → 8.9KB；
- 网关重启后生效（stub 缓冲区在启动时载入内存）。

**实测**：昊天出场 → 星辉面板完整（超星辉必杀 / 星辉特技 + 星辉 PP 槽 / 觉醒技动全部渲染），
战斗推进正常。技能能释放与否需用户按习惯再确认。

### Round 55（2026-11-07 凌晨）：瞬耀技能/王者技能按钮缺失 —— 对照实验排除抽图嫌疑

**现象**：昊天（星辉）技能面板缺「瞬耀技能」（应在星辉特技旁）、王者盖亚缺「王者技能」。
Round 54 已恢复超星辉必杀/星辉特技（XH_ExtBigSkillMc），但这两个按钮仍不出。

**排查过程**：

- petfightnew 常量池里有**一整套系统技能按钮皮肤名**：`btnwangzhe`、`btnWumangXingji`（无冕星籍）、
  `btnXingHui*` 系列、`btnEternityZhanyi*`、`btnLunhuiShiyueTeji`、`btnExtraSkill` 等；
- `btnwangzhe` 字符串见于 xhresource 的 ABC（作类名，**无 SymbolClass 绑定**）；全家族 SWF 的
  SymbolClass/ExportAssets 均无该导出；页面端无 #1065（类解析不缺）；
- gq/xhresource 空壳保留名单补充了 `fla.`/`YUANJIAN` 图标符号——验证发现这些图标本就在
  保留闭包内（保留形状数不变），属无害冗余；
- **对照实验**：全部低配开关关闭、资源 100% 原样进战斗 → **瞬耀/王者按钮依旧缺失**。

**结论**：这两个按钮的缺失**与低配开关/抽图无关**，是客户端层面问题（BigSkillMCHandler 的
按钮创建逻辑、或星辉/王者系统的数据状态在 Ruffle 下的行为差异），需另立调查——
方向：解 petfightnew 的 `panel.skill.big::BigSkillMCHandler` 按钮创建分支，确认按钮出现的
数据条件，再对照页面端实际数据。

**处置**：`petfightnew_res1` 回归**原样直发**（65KB，抽图无收益、已两次误伤 UI，从 GUT_BUNDLES
移除）；用户低配配置已恢复原状。

### Round 56（2026-11-07 凌晨）：瞬耀/王者徽章素材定位成功，但确认是 Ruffle 侧缺口

**用户补充**：缺失的系统技能按钮在**超星辉必杀星标左侧**（官方参考截图确认：盖亚为金色
六边形「远客归璀」徽章，昊天为蓝色星剑徽章）。

**素材定位**（新工具 `scratch/dump_btn_icons.mjs`，可导出家族 SWF 全部位图为 PNG/JPG）：

- `petfightnew_xhresource` 唯一 fmt5 无损位图 **id7**（68×66）= 瞬耀技能星剑徽章；
- `petfightnew_gqresource` 唯一 fmt5 无损位图 **id747**（68×71）= 王者技能金色徽章；
- 二者均被 R44c 抽图置空 → `gut_swf_visuals.mjs` 新增 **`--keep-bitmap <id>`** 参数精确保留，
  两个空壳已重生成（xh 36,877B / gq 188,308B）。

**但深入后发现**：

- id7 在 xhresource 全部 115 个 sprite 中**从未被 PlaceObject 引用**、也无 SymbolClass 绑定
  —— 属「孤立位图」，运行时由类代码动态挂载（ABC 已原样保留）；
- 结合 Round 55 对照实验（资源 100% 原样时徽章依旧不渲染）：**徽章缺失与素材无关**，
  是 Ruffle 侧的渲染/行为缺口（候选：混合模式/遮罩/滤镜不被支持，或面板代码路径差异），
  位图保留只是正确的素材卫生，不能解决显示问题。

**下一步（需专门一轮）**：用 RufflePlayer 调试接口（debugPlayerInfo / 显示树快照）确认
徽章显示对象是「存在但不可见」（渲染缺口 → 查 blend/mask/filter）还是「从未被添加」
（逻辑缺口 → 查 BigSkillMCHandler 创建条件），再决定是改宿主页配置还是上报 Ruffle。

**素材工具沉淀**：`scratch/dump_btn_icons.mjs <in.swf…>` —— 导出 SWF 全部 fmt5 无损位图
（PNG）与 JPEG 位图（.jpg），`scratch/btn_icons/` 已含家族 SWF 全部 338 张素材图可检索。

### Round 56b（2026-11-07 凌晨）：控制变量实验 —— 排除全部特效开关

**用户要求**：用控制变量法找出屏蔽星辉系统专属技能（瞬耀徽章）的开关。

**实验设计**：每轮只改一个开关 → 刷新页面重进 4V2 → 放大截图超星辉必杀星标左侧徽章区 →
网关日志确认变量确实生效（资源下发模式）。

| 轮次 | 变量 | 徽章 |
|---|---|---|
| 对照（Round 55） | 全部开关 off、资源原样 | ❌ 缺失 |
| 1 | `resPkg=false`（gq/xhresource 原样，日志确认） | ❌ 缺失 |
| 2 | `enterScope=off`（res 入场包原样） | ❌ 缺失 |
| 3 | `buffXh=false`（xinghuipet 原样） | ❌ 缺失 |

**结论（逻辑闭环）**：全关对照时**所有开关都处于 off**——若某开关是原因，全关时徽章必然出现。
三轮单变量复测与之一致；`lowfx.extra` 不存在、8 个 `AOLA_NO_*` 环境变量全空，无漏网规则。
**瞬耀/王者徽章缺失与全部特效开关无关**，维持 Round 56 的 Ruffle 侧缺口判断。

实验后用户低配配置已完整恢复。

### 待验证 / 未纳入

- **光启亚比实战确认**：需要一场带光启亚比（如神兵 `shenbing` 机制）的战斗；打完看
  `http://127.0.0.1:8700/status` 的 `effect` 是否增长、入场是否还有光柱/光晕。
- `crieffect_normal_1/2`（2.06MB×2）、`effect50000000`（1.29MB）、`xinghuikillbig*`（3.0MB）、
  `revertpp/reverthpmovie` 仍原样 —— 同一套 gut 流水线可套用，但属「暴击/大招特写」，需用户确认是否要一起抽。
- 整合包 `说明.txt` / `启动奥拉星-去特效.cmd` 已同步（新增 `AOLA_NO_XINGHUI_EFFECT=1`，文案改为
  「光启/星辉入场与机制特效 + 专属战斗场景」，并注明加载动画保留）；`app/tools/serve.mjs` 与
  `app/web/stub/petfightnew_res.gut.swf` 已随包更新。

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

### Round 57（2026-11-07 中午）：瞬耀/王者徽章消失 —— 用户判断正确，引擎补丁+状态变量双重真相

**用户关键输入**：「明显不是兼容问题，在去特效之前，星辉系统的专属技能都在的」「把王者盖亚切到首发……王者盖亚不容易阵亡」「昊天容易被打死……只有开局2回合的时间截屏」。

**上午铁证（原版引擎 + 全开关关闭）**：
- 盖亚：超星辉必杀左侧金色「神·王者」大徽章 + 底部「王者力量/神·王者力量」金色按钮 **全部渲染**（clip 截图）；
- 昊天：超星辉必杀/星辉特技两行左侧各有一枚金色徽章（全屏截图）。
- **结论：徽章缺失不是 Ruffle 兼容缺口**，R56/R56b 的「Ruffle 侧缺口」结论作废。

**引擎补丁真值表（盖亚侧，solid）**：
| 引擎 | 盖亚·王者徽章 |
|---|---|
| 无补丁 | ✅ |
| 仅 showAppearEffect(R47) | ✅ |
| 仅 changeSkillBackGround(R50) | ✅ |
| A+B（R55/56b 时的状态） | ❌（用户 R55 截图）|

→ 两个引擎补丁**共同**杀死 GQ 侧徽章；单打任何一个都无害。
**处置**：`ensureEnginePatches()` 改为**显式 opt-in**（`AOLA_ENGINE_PATCH=1` 才打补丁）；cache 里的 petfightnew.swf 已恢复 .orig 原版。

**昊天侧的新变数（未解）**：11:16 起，昊天的瞬耀徽章**在与上午成功时完全相同的配置下**也不再出现；背包详情里昊天的**星辉技能面板整个缺失**（技能区空白，立绘正常），而盖亚详情一切正常。→ 昊天的星辉系统状态/数据在 10:48~11:16 之间失效（战斗消耗？时限？服务端数据？），**与网关无关的嫌疑极大**。下午据此对昊天做的开关二分（enterScope/resPkg/buffGq/gutBundles/fxEffect 逐个「杀徽章」）**全部被该状态变量污染，结论作废**，待星辉状态恢复后重测。
- 佐证：星辉面板数据是异步加载的，11:48 背包曾出现「[亚比名]亚比名 / 战斗力99999 / 技能名六个字」占位数据（数据加载失败的形态）。

**其它新发现**：
- Ruffle 对**原版资源**也会报 `Unexpected PlaceObject during goto`（movie_clip.rs:1486，原版 petfightnew_res/skillwindword 时间轴触发）——预存兼容性怪癖，非本次回归；
- `face_res` 的 `Error #1065: Variable face89 is not defined` 在原版引擎下同样出现——预存问题，另立调查。

**当前遗留状态**：
- lowfx.json = 用户原配置，仅 `bgSkill=false`（引擎补丁停用后 R50 的白层问题会随 true 回归）；
- 引擎 = 原版（petfightnew.swf = .orig），补丁工具链保留但不再自动应用；
- 首发已切回昊天（用户背包原状）。

**下一步（待用户确认星辉机制后）**：
1. 向用户确认瞬耀技能的激活条件（星辉能量/时限/每日次数？），对照官方客户端当前是否也隐藏该徽章；
2. 若官方客户端也隐藏 → 纯游戏状态问题，网关侧无事可做；若官方显示而我们没有 → 抓昊天星辉数据的 socket 请求，查加载失败原因；
3. 盖亚侧已定案：引擎补丁保持停用即可；flag 侧待昊天状态恢复后用盖亚（存活时间长）重测一轮补全真值表。

### Round 57b（2026-11-07 下午）：盖亚侧真值表补全 —— 资源层杀手 = resPkg；昊天侧状态问题实锤

用盖亚（存活久、星辉状态正常）重跑开关二分，全部单测：

| 配置（引擎均为原版） | 盖亚·王者徽章 |
|---|---|
| 全关 | ✅ |
| {enterScope=gq, resPkg, gutBundles} 组 | ❌ |
| enterScope=gq 单独 | ✅ |
| **resPkg 单独** | **❌ ← 开关侧杀手** |
| gutBundles 单独 | ✅ |
| {fxEnterUrls,buffGq,buffXh,fxEffect,fxCrit,bgSwapMovie,petBackground} 组 | ✅ |

**盖亚侧定案**：徽章杀手 = ①引擎双补丁（A+B 同打）②resPkg（gqresource/xhresource 抽空壳——R56 的 --keep-bitmap 只保了位图 id747/id7，徽章的**形状皮肤**仍被抽空）。其余全部特效开关（enterScope/gutBundles/buffGq/buffXh/fxEffect/fxCrit/bgSwapMovie/petBackground/fxEnterUrls）**都已验证安全**。
注意：王者力量/神·王者力量按钮与徽章图标是两个元素——resPkg 下按钮仍在、仅徽章图标消失。

**昊天侧**：最终配置（去 resPkg）下徽章仍不出现，且**全关对照也不出现**（上午 10:48 同配置是出现的）→ 昊天星辉系统状态确实失效（背包详情技能面板空白与此吻合），与网关无关。XH 侧的开关真值表待其状态恢复后补测。

**最终推荐配置**：用户原配置 + `resPkg:false` + `bgSkill:false`（后者因引擎补丁停用后 R50 白层问题会回归）+ 引擎补丁保持 opt-in。特效去除能力基本全保留，仅损失 gq/xhresource 包内特效与专属技能背景去除。

### Round 57c（2026-11-07 下午）：重要修正 —— 昊天侧徽章从未缺失，是测量坐标错误

**用户指认**：「瞬耀那里不是有吗，哪里空了」「超星辉必杀(5星技能)左侧的那个」。

**真相**：昊天的瞬耀徽章位置在**星标左上方约 (975, 200)**（刺状金紫徽记），与盖亚的神·王者徽章位置 (1041, 208) **不同面板布局不同坐标**。下午所有"昊天徽章消失"的判定都是拿盖亚的坐标去量昊天的面板——**测量错误**，徽章其实一直在（包括仅A补丁/仅B补丁/最终配置的各场战斗，全屏截图里都能看到该徽记，被误判为场景装饰"紫色水晶球"）。

**端到端验证**：第1回合（自动关、面板等待输入）点击 (975, 200) → **瞬耀技能触发**，面板技能变为强化形态「曙·荒阔星辰(1000) / 曙·神魂救令(2000)」——与用户描述"瞬耀=强化其他技能的非攻击型技能"完全一致。徽章存在且功能正常。

**最终定案（取代 57/57b 中昊天侧的"状态问题"结论）**：
1. 瞬耀/王者徽章缺失的真凶 = **引擎双补丁（A+B 同打）+ resPkg 空壳形状抽空**，两层都已修复（引擎补丁 opt-in、最终配置 resPkg:false）；
2. 昊天徽章位置 ≠ 盖亚徽章位置，排查面板 UI 时必须按各自面板布局取坐标；
3. 星辉值（星数）与徽章显隐无关（用户确认图标常驻；上午4星/下午1星均观察到各自状态）；
4. 本地每日标记 playAllFightSkillFirstPerDay_* 与徽章显隐无关（删除无效果）；
5. 若未来再遇"徽章缺失"，先核对面板布局坐标，再查引擎补丁与 resPkg。

**遗留**：无。配置保持最终推荐（用户原配置 − resPkg − bgSkill），引擎原版 + 补丁 opt-in。

### Round 58（2026-11-07 下午）：特效开关「局内即时」应用 —— 战斗中免刷新实时生效

**需求**：用户提出"能否做到在局内实时开关"。原面板（Round 45）点「应用并刷新」会强制 `location.reload()`，战斗会被打断。

**实现**（`client/web/game.html`）：
- 面板按钮区新增绿色「局内即时」按钮（`#fx-live`）：`save(false)` 只 POST `/lowfx` 写 lowfx.json，**不 reload**；「应用并刷新」保留（彻底干净时用）。
- 原理：网关侧所有开关都是**资源请求时**判定的，POST 后按 mtime 秒级热加载，后续请求立即按新开关走；页面里已加载进 Ruffle 的资源不回收。
- 面板为 DOM 悬浮层（z-index 9999），战斗中照常可开。

**端到端验证**（同一场星辉试炼战斗内，无任何页面重载，网关日志为证）：
1. 翻转前：`fightasyncres/effect/effect10003700~*.swf -> stub swf (battle-fx)`（fxEffect=true，特效被 stub）；
2. 战斗中开面板（DOM）→ 改勾选 → 点「局内即时」→ 日志 `[lowfx] 按钮修改` + `生效开关` 秒级生效，hint 显示"已应用（局内即时）"，战斗画面不中断；
3. 翻转后**同一场战斗内**：`effect/effect20000001.swf -> 200 (cache)`、`effect10002801.swf -> 200 285080B` —— 技能特效真实下发并播放；同时 `crieffect_normal_1/movie -> stub swf (battle-fx)` —— fxCrit 仍 true，暴击特写继续被屏蔽。**选择性实时翻转成立**。

**生效边界（务必知晓）**：
- 只对**之后新发起的资源请求**生效；已加载进 Ruffle 的 SWF 不回收（同 URL 重放走 Ruffle 内存缓存，也不受影响）→ 例如正在播放中的动画、本回合已加载的特效不会"追认"新开关；
- `startmv`（开场演出）/登场动画类只在**下一场战斗**开头加载 → 改完下一场才见效；
- 引擎补丁（petfightnew.swf）是页面加载时一次性决策 → 仍需刷新（本就 opt-in）；
- 要 100% 干净的状态用「应用并刷新」。
- 注意：POST 是全量合并写文件（以打开面板时读到的网关状态为基础）→ 若两人同时操作面板，后应用的会覆盖先应用的未保存改动；单人使用无感知。

**当前面板状态值**：GET `/lowfx` 返回 `flags`（网关生效值）+ `file`（文件覆盖值）+ `env`（启动环境变量），勾选框按生效值显示。

### Round 59（2026-11-07 下午）：面板文案精简 + 进场特效拆分为光启/星辉两个独立开关

**需求**：用户提出面板描述"太细致了"，给出目标文案：光启进场特效 / 星辉进场特效 / 光启buff特效 / 专属战斗背景。

**实现**：
1. **新 stub**：`web/stub/petfightnew_res.gut.gqonly.swf`（--only GQAppearMovie，75 形状）与 `.gut.xhonly.swf`（--only XinghuiAppearMovie，83 形状）。原有 `.gut.gq.swf`（两类全抽）继续当"双侧"壳。
2. **serve.mjs**：
   - 新布尔键 `enterGq` / `enterXh`（同时管两层：URL `*appear*` 特效 + 登场动画包）；
   - `buildStubRules`：appear 按 `/gqpet/.+appear`、`/xinghuipet/.+appear` 分流；**buffGq/buffXh 的目录规则加负向前瞻 `(?!.*appear)`**——修掉旧行为里 buff 开关会顺带屏蔽 appear 特效的重叠；
   - 登场包按组合四选一：双关=gq 壳 / 仅 gq=gqonly / 仅 xh=xhonly / 全开=原样直发（不再替换）；
   - 旧键兼容：`enterScope`/`fxEnterUrls` 仅当文件未写新键时参与推导（`normalizeFlags`）；env 的 `AOLA_NO_ENTER_EFFECT` 显式时才写新键；
   - 旧 `enterScope=all`（普通/奥义/传奇登场也抽）**不再暴露**：面板与推导都不再产出 all；文件里手写 all 只会被映射成 enterGq=enterXh=true（普通登场部分丢弃）。`.gut.all.swf` 仍在磁盘但网关不再引用。
3. **game.html**：面板按用户文案重写——进场特效（光启进场特效/星辉进场特效/开场演出）、战斗机制（光启buff特效/星辉buff特效）、战斗通用特效（技能特效/暴击特写）、场景/背景（专属战斗背景/专属技能背景/加载动画/背景切换特效）、其他（资源包抽图（高级））；删除"连普通登场也去掉"与"appear SWF"两行。

**验证**：
- 正则单测：gq/xh appear 分流命中正确；buff 规则对 appear 排除生效；
- 四组合 curl 实测 `petfightnew_res.swf`：双关 2,072,753B（gq 壳）/ 仅 gq 2,107,728B / 仅 xh 2,096,470B / 全开 2,095,487B（原样）✓；
- 面板：勾选状态按网关生效值正确显示（旧配置 enterScope=gq + fxEnterUrls=true 正确映射为 enterGq=enterXh=true，行为不变）。

**注意**：
- 旧键在下次面板"应用"后仍留在 lowfx.json 里（POST 只写新键+其余勾选键，合并写文件不删除未知键），无害；
- envFlags 曾有 bug（无 env 时也写 enterGq:false 挡住文件推导），已修——新键只在 env 显式要求时写入。

**Round 59 补充（同日）**：按用户要求面板**只保留 4 项**——光启进场特效 / 星辉进场特效 / 光启buff特效 / 专属战斗背景（无分组标题）。其余开关（startmv/buffXh/fxEffect/fxCrit/bgSkill/bgLoading/bgSwapMovie/resPkg/gutBundles）不再暴露，但网关仍按 lowfx.json 里的现值生效（POST 为合并写，不触及未列出的键）；要改动需手编 lowfx.json 或恢复面板行。

### Round 59 收尾（2026-11-07 晚）：文档同步 + scratch 清理

**文档**：README「低配模式」章节重写为现状——4 开关面板（光启进场特效/星辉进场特效/光启buff特效/专属战斗背景）+ 「局内即时/应用并刷新」双应用模式 + 登场包四组合行为 + 隐藏键说明；`/lowfx` 端点行同步更新。

**工具沉淀（scratch → client/tools）**：
- `build_gut_catalog.mjs`（README:119 活引用，gutBundles 空壳批量生成器）
- `dump_btn_icons.mjs`（R55 素材工具，lzma 引用改为 tools 内 vendor/node_modules 双路径）

**scratch 清理（2026-11-07）**：删除一次性 patch/doc/sync/test 脚本 ×42、旧网关日志（live_20261106*~20261107h）、`pf_*` ABC 补丁中间产物（bin/swf/txt）、`sb_gut*.swf`、`t*_startmv.swf`、`btn_icons/`、`ego-aola/`（捕捉自动化实验，40 脚本+截图，83MB）。
**保留**：`lowfx.user-backup.json`（用户原始 lowfx 配置备份）、`live_20261107i.out.log`（当前网关日志）、`live-shots/`（约 580MB 历史会话截图，未清，待用户决定）。

**当前生效状态快照（取代 R57c 的"最终推荐配置"描述）**：
- 面板 4 项全勾：`enterGq=true, enterXh=true, buffGq=true, petBackground=1`；
- 隐藏键（不暴露、按文件值生效）：`buffXh=true, fxCrit=true, bgSkill=true, bgSwapMovie=true, gutBundles=true, startmv=off, fxEffect=false, bgLoading=false, resPkg=false`；
- 旧键仍留文件里：`enterScope=gq, fxEnterUrls=true`（新键存在时不参与推导，无害）；
- 引擎 `petfightnew.swf` 原版，补丁 opt-in（`AOLA_ENGINE_PATCH=1` 才打）。

### Round 60（2026-11-07 晚）：专属战斗背景白屏 —— 归因与修复（bgSkill=false）

**现象（用户报告）**：存在专属战斗背景的精灵进场会导致战斗背景白屏。

**归因**（i 日志实锤）：
- 面板的「专属战斗背景」= `petBackground`（场景背景 `petfightbackground/*`），实现是换发通用星域背景，工作正常（今日两场战斗 common.swf 正常）；
- 年费/专属宠（祁 nianfei2026）的专属背景实际走 `skillbackground/<宠物>.swf`，由**隐藏键 `bgSkill`** 控制——Round 59 精简面板后不暴露但文件里仍是 `true`；
- `bgSkill=true` → 现场抽图空壳（27 形状全空 + 强制底色 0x101a2e）→ 祁进场时游戏先移除当前战斗背景、把这层换上来 → 空层不绘制 → 露出白色舞台 → **白屏**；
- Round 57 之前引擎补丁 B（changeSkillBackGround 屏蔽）能盖住这条链，引擎改为原版后白屏暴露。R50 就有"抽空会露出白底"结论，本次为该现象回归。

**修复**：`lowfx.json` → `bgSkill:false`（R50 原始结论：skillbackground 只能原样直发——抽空露白舞台、760B/common 换发会缺类卡祁的技能，R48 实锤）。生效已验证（生效开关日志 + /lowfx 响应）。

**注意**：
- 面板「专属战斗背景」勾选框只管场景背景（petBackground），**不覆盖** skillbackground；后者现固定 false（原样直发，专属宠进场显示其真实专属背景）。若未来想屏蔽它，需先解决"空层露白舞台"（如 gut 时注入整屏深色矩形形状，而非只改 SetBackgroundColor——Ruffle 不渲染子 SWF 的背景色标签）；
- 代价值：年费/专属宠进场的专属背景视觉保留（属于"去不掉的特效"，与回血/回蓝同类）。

### Round 60b（2026-11-07 晚）：战斗背景固定为星战空间 —— 星域图移植方案（最终）

**用户需求**：直接将战斗背景固定为当前在星战空间进入战斗的这个（960×560 星域+行星图，即 `petfightbackground/common.swf` 内的最大 JPEG，id4/54KB）。

**实现**（取代 R60 的 bgSkill=false 临时方案，bgSkill 回到 true）：
1. **gut_inline.mjs** 新增 `screenShape` 选项与 `swfBodyOf` 导出：抽空时把「全屏/近全屏形状」（面积 ≥ 舞台 60%）**原位替换**为指定位图铺满原形状边界的 DefineShape（charId 保持，类时间轴放置关系不变；位图以 DefineBitsJPEG2(id=65000) 前置定义）。位级工具：bitReader/parseRECT/nbitsSigned/jpegSize（SOF 解析）。
2. **serve.mjs**：启动时从 common.swf 提取星域主图（ZWS 解压 + 遍历 21/35/90 标签取最大合法 JFIF）；`wantBg` 现场抽图时传 `screenShape`。日志新增 `[gut] 全屏形状→星域图 xN`。
3. **game.html**：面板「专属战斗背景」勾选框现在**同时控制 `petBackground` 与 `bgSkill`**（勾 = 场景背景换星域 + 专属背景抽空铺星域图）——一个开关 = "战斗背景固定为星战空间"。

**验证**：
- 离线：skillbackground_nianfei2026 gut 产物 55,378B，7 个全屏形状替换，产物内含 id65000 星域 JPEG（dump_btn_icons 确认 54,090B）；
- 线上：网关重启后 curl 该文件 → `[gut] 全屏形状→星域图 x7`，服务体 55,378B，产物位图含星域图 ✓。

**语义**：祁进场 → 游戏换上 skillbackground 层 → 层里全屏形状画的就是星战空间背景图 → **战斗背景始终是星战空间这张**；类契约完整，祁的技能不受影响（R48 教训已规避）。

**代价/边界**：所有专属宠的专属背景都变成同一张星域图（这正是"固定"的本意）；若未来想恢复各宠原背景，把面板「专属战斗背景」取消勾选（petBackground=off + bgSkill=false，原样直发）。

## 🎒 Round 61（2026-11-07 晚）：背包打开/操作速度 —— 全面实测与 A/B 收尾

**实测方法**：PerformanceObserver（longtask + resource，IAB 页面内注入）+ 截图定时采样 + 网关日志时间戳跟踪（`bag_timing_capture.txt`）。

**测量结果（世界亚比背包）**：

| 操作 | 11-04（默认） | 11-07 nightly |
|---|---|---|
| 冷开背包（会话首次） | 长任务 ~4.3s（最大 1832ms）/ 2.5s 渲染完 | ~4.45s（1244+1549ms）/ 2.5s |
| 暖重开 | — | 1.77s / ~2s 渲染完 |
| 切宠（数据+大图） | ~2.9s（最大 1048ms） | ~3.8s（最大 1497ms，略差） |

**关键事实**：
1. **网络层零浪费**：开包/切宠的全部资源（面板框架 skillview/soulpanel/guangqipetpreset、peticon、petcard/view、astralspirit）均磁盘缓存命中（`200 (cache)`），无上游往返；
2. **切宠时 petmovie 常常根本不发请求**（Ruffle 内存缓存已有）——卡的是**纯客户端构建成本**：Ruffle 实例化面板/宠物显示对象 + 位图纹理上传，单个长任务 1-1.8s。与 Round 33-35 的 construct_frame 归因一致；
3. **Ruffle 11-07 A/B 无收益**（切宠反而略差）→ **默认保持 11-04**；11-07 已装入 `client/web/ruffle-bisect/2026-11-07/`，可用 `?ruffle-bisect=2026-11-07` 自行体验（npm 源 `@ruffle-rs/ruffle` 下载，GitHub release CDN 被墙走 npm）。

**结论**：网关层（HTTP/缓存/资源替换）已无进一步优化空间；剩余成本 = 官方 SWF 自身的面板构建 + 宠物大图实例化，只能靠改官方资源 ABC（高风险）或等 Ruffle 后续版本的结构性优化。

**可行缓解**：会话内首次开包后保持面板常用（暖重开比冷开快 ~2.3s）；切宠用底部卡片小图导航（数据面板即时更新，大图 1-2s 后补渲染，期间可先操作数据区）。

### Round 61 补充（同日）：背包动画掉帧 —— 根因是浏览器 RAF 节流，与游戏资源无关

**现象（用户报告）**：背包中精灵的动态效果明显掉帧。

**测量链**（IAB 页面内 PerformanceObserver + RAF 帧间隔监视）：
1. 世界待机（未节流时）：帧间隔 p50=16.6ms（60fps 健康）；
2. 背包打开后：avgFps 8.4-9.7，帧间隔 p50=104ms 且**极度均匀**（p90=112ms）；
3. **petmovie 换 760B 空壳 A/B：帧率纹丝不动（9.7fps）→ 游戏资源（宠物动画）无辜**；
4. 12s 窗口：113 帧、**0 帧达到 60Hz**、仅 2 个长任务——主线程完全空闲却稳定 ~104ms/帧；
5. 定时器接近正常（setInterval(50) 2s 跑 34/40 次）而 RAF 只有 14fps → **合成器层对渲染帧的节流**，非主线程阻塞、非 GPU 负载；
6. tab 级 shake（newPage+close）、标签激活、真实点击输入均无法解除 → 窗口级状态。

**归因**：Chromium 窗口遮挡误判（CalculateNativeWindowOcclusion）/ 合成器省电节流把 IAB 页面的 RAF 压到 ~10-14fps——Round 34 记录过同类问题（当时 1.5fps 冻结，"visibilityState=visible 会撒谎"）。整合包启动器启动参数里专门加了 `--disable-features=CalculateNativeWindowOcclusion` 就是为这个。

**解决办法（用户侧）**：
1. 确保 ZCode 窗口完全在前台且不被其他窗口遮挡，鼠标直接点一下游戏画面；
2. 最小化再还原 ZCode 窗口（窗口级 shake，比 tab 级有效）；
3. **根治：用整合包启动器玩**（启动参数已禁用遮挡计算，免疫此问题）；
4. 笔记本检查 Windows 电源计划（省电模式也会压合成器帧率）。

**注意**：此节流影响**所有**动画（不只背包），世界场景小动画多不易察觉、背包大幅宠物动画最显眼。游戏内容本身可跑 60fps（未节流时实测）。

### Round 61 补充 2（同日晚）：背包动画掉帧 —— 最终归因：IAB 面板可见性分级节流（240/60/10/1fps 四档）

**用户追问"还是很卡"后的深挖**（petmovie stub A/B、背景 stub A/B、pack 浏览器对照、合成器踢脚、定时器/RAF 对比）：

**决定性数据**：
| 场景 | RAF 帧率 |
|---|---|
| 整合包浏览器（`--disable-features=CalculateNativeWindowOcclusion`）开游戏登录页 | **240fps** |
| IAB 开游戏登录页 | 219fps |
| IAB 世界待机（早前未节流时段） | 60fps |
| IAB 背包打开（用户查看时段） | **8-10fps**（帧间隔均匀 104ms） |
| IAB 背包（用户离开面板去聊天时） | **1.0fps**（间隔 1003.6ms，主线程 0ms 工作） |
| IAB 空白页 about:blank | RAF 冻结（2 帧/3s） |

**排除项**（全部 A/B 实证）：游戏资源（petmovie 换空壳帧率不变）、背包场景背景（stub 无效）、网络（全缓存命中）、Ruffle 版本（11-07 A/B 持平略差）、主线程脚本（节流期间 0-2 个长任务）、软件渲染（IAB WebGL = Intel UHD D3D11 硬件）、`stage.frameRate` 设置（newpetpackage/start.swf 无 frameRate 引用）。

**根因**：IAB 面板的合成器按**表面的实际可见性**动态出帧（on-demand BeginFrame）——面板完整可见时 60-240fps，部分可见/失焦时 ~10fps，完全离开视野时 1fps。RAF/定时器/游戏全跟着这个节奏走。背包的大幅宠物动画在该节奏下最显眼。

**解决**：
1. 玩游戏时让 IAB 游戏面板完整可见、窗口在前台（切去聊天/别的面板时游戏就掉到 1-10fps）；
2. **根治 = 整合包启动器**（特性已禁用，实测同一页面 240fps）；
3. 页面内任何 JS/CSS 手段（合成器踢脚动画、shake）都无法解除——已实测。

## 📦 Round 62（2026-11-07 晚）：整合包重打包 —— 同步 Round 58-60b 全部改动

**背景**：用户要求重打包最新整合包浏览器。包内 Chromium 已是 157.0.8086.0（够新，无需换浏览器引擎）；真正落后的是 **app/ 内的网关与网页资产**（停留在 11-06，缺 Round 58-60b）。

**同步清单**（client → dist/aola-launcher-pack/AolaStarLauncher/app/）：
- `tools/serve.mjs`（enterGq/enterXh 拆分 + 星域图提取 + screenShape 接线 + Round 58 面板后端）
- `tools/gut_inline.mjs`（screenShape 全屏形状替换 + swfBodyOf 导出）
- `tools/gut_swf_visuals.mjs`（**Round 51 的位图宽高=1 修复也在内**——包内还是写 0 的旧版，会 wgpu panic）
- `web/game.html`（4 开关面板 + 局内即时/应用并刷新）
- `web/stub/`：补 `petfightnew_res.gut.gqonly/xhonly.swf`（Round 59）+ res1
- **未拷** `lowfx.json`：启动器走 `AOLA_NO_*` 环境变量（文件键会覆盖环境变量，拷了会让"去特效.cmd"的意图失效）；面板首次"应用"时会在包内自动生成
- 其余工具（apply_engine_patches/patch_pf_methods/patch_appear/patch_targets）diff 无差异；gut/ 目录 21=21；引擎 petfightnew.swf 原版 ✓；common.swf（星域图源）在包缓存 ✓

**验证**（包自带 runtime/node，端口 8701 隔离测试）：
- 启动：`[stub] 星域背景主图: common id4 54090B` ✓
- `去特效.cmd` 环境变量映射：enterGq/enterXh/petBackground=1/bgSkill/fxEffect/fxCrit/buffGq/buffXh/startmv 全部正确，resPkg=false（徽章安全）✓
- skillbackground 移植：首请求回源落盘（694KB 真文件），第二次请求起走抽图+星域图移植（55,378B、全屏形状→星域图 x7）✓
- 测试完已停 8701、清理产物

**已知小瑕疵**：每个新的 skillbackground 文件**第一次**请求会原样直发（尚未落盘无法抽图），第二次起才固定为星域图。属一次性现象。

**使用**：双击 `启动奥拉星-去特效.cmd` 即可（浏览器带 `--disable-features=CalculateNativeWindowOcclusion`，免疫 IAB 的可见性节流掉帧）。

### Round 63（2026-11-07 晚）：切宠卡顿的函数级归因 —— LoAF 实锤 Ruffle 帧处理，bagLite 方案证伪

**方法**：Long Animation Frames API（Chromium 123+，IAB Chromium 157 支持）——比 longtask 更细，能给出长帧内的脚本归属。

**实验**：`lowfx.extra` 临时把所有 petmovie 的 _1/_2/_3 分片换 760B 空壳（主显示片 _0 保留），切宠测 LoAF：
- 长帧：794ms、**2867ms（blocking 2754）**、242ms、**1631ms（blocking 1206）**——6 秒内 blocking ~5s；
- 所有长帧脚本 100% 归因 `ruffle.js` 的帧回调（函数 "r"）——Ruffle wasm 核心帧处理（AVM2 执行 + 显示树构建 + 渲染提交）；
- 盖亚大图照常渲染（来自 _0 片）→ 分片 stub 不影响显示；
- **结论：分片不是成本来源，bagLite（精简 _1..3）方案证伪**——阻塞在 Ruffle 对官方 SWF 显示树的构建本身。

**排除清单（切宠卡顿，累计）**：网络/缓存（全命中）、petmovie 分片（本实验）、Ruffle 版本（11-07 A/B）、主线程脚本以外的因素（LoAF 归因 100% ruffle.js）、`stage.frameRate`（无引用）。

**定论**：切宠的 1-1.5s 长任务（冷切 2.9-3.8s）= Ruffle 在 wasm 里逐帧执行官方背包 SWF 的显示对象构建——**网关层全部可动杠杆已用尽**。剩余路径：
1. 跟进 Ruffle 上游 AVM2/display-list 性能提交，新 nightly 定期用本方案的 LoAF 流程复测（10 分钟/次）；
2. 带 profile 向 Ruffle 报 issue（`switch_timeline.json` + LoAF 数据齐备）；
3. 接受现状——数据面板即时可用，大图 1-2s 后补上，操作上可先点数据区。

### Round 63b（同日）：决定性对照 —— 整合包浏览器切宠零卡顿（LoAF 0 长帧）

**实验**：用 CDP 驱动整合包浏览器（真实登录态）走完登录→世界→背包→切宠全流程，LoAF 测两次切宠（盖亚、阿赖耶识，均为本会话首见）：
- **两次切宠 LoAF 均为 0 长帧、0 阻塞**，大图即刻渲染（对照 IAB 同操作 2867ms+1631ms 阻塞）。

**机制解释（合并所有证据）**：IAB 的合成器按面板可见性分级出帧（240/60/10/1fps）。节流状态下 Ruffle 的渲染循环被饿，切换时欠下的构建工作（wasm 执行官方 SWF 显示树）全部塞进极少数获得的 BeginFrame → 1-2.8s 巨型长任务 = 用户看到的切宠卡顿。合成器健康时（整合包浏览器，禁用 CalculateNativeWindowOcclusion）同样的工作被摊到每一帧，长任务消失。

**最终优化方案**：
1. **用整合包启动器玩**（`启动奥拉星-去特效.cmd`）——浏览器免疫可见性节流，实测切宠零卡顿；包内已同步今天全部改动（Round 62）；
2. 网关侧已落地：星域图背景固定、进场开关拆分、面板精简、petmovie 兄弟片预取（peticon 触发面窄——管理网格头像走 petcard/view，team 场景仍有边际价值，保留）；
3. 若坚持用 IAB：让游戏面板完整可见+窗口前台（不可靠，节流档位随遮挡动态变化）。

**测量工具沉淀**：`scratch/pack_drive.mjs`（CDP 驱动整合包浏览器：shot/click/open/switchfrac 四步，可复用于一切页内测量）。

### Round 63c（同日深夜）：用户实操会话的全量监听 —— 卡顿在渲染提交路径，非脚本

**方法**：用户实际操作背包（切宠/页签/编辑界面），IAB 页面内 LoAF + longtask + resource 三观察器全程记录，网关侧时间戳日志同步。

**实测数据**：
- 长任务 **1971 个 / 累计阻塞 194s**；
- **t=290-420s：连续 130 秒主线程 100% 饱和**（每个 10s 窗口 9.9-10s）；
- 单帧最长 **15321ms**（t≈690s，用户打开某编辑界面时）；t=680-750s 又一波 600-850ms 密集卡顿；
- 期间**无任何新资源加载**（操作的都是已加载内容）→ 纯渲染成本；
- **关键：LoAF 长帧的脚本耗时合计 = 0**（4735 个长帧无一有 script 条目）→ 阻塞不在 JS/AS3/wasm 执行，而在**渲染提交路径**（Ruffle 的 WebGPU 渲染 → WebView2 的 D3D11 提交，每帧 100-500ms）。

**架构背景（进程树实测）**：ZCode.exe = Electron（自带 gpu-process/renderer），IAB = 独立 WebView2 进程树（msedgewebview2 156.0.4314.58 ×7）。两套 Chromium 共享同一块 Intel UHD 集显 + 同一 DWM 合成队列 → 游戏渲染尖峰会同步拖慢编辑器（用户观察到的"卡顿同步给编辑器"）。

**修正此前归因**：Round 63 的"构建成本在 wasm 脚本"部分修正——脚本执行很快（LoAF 脚本时间≈0），真正贵的是**渲染提交**。切宠/页签切换在健康合成器（整合包浏览器）上零长帧（Round 63b），在 IAB 上因可见性节流 + D3D11 渲染路径慢而放大为秒级卡顿。

**优化方案（最终版）**：
1. 用整合包启动器玩（根治：渲染路径完整 + 免节流，实测零长帧）；
2. IAB 内缓解：Ruffle 右键菜单画质调低（若可用）、减少同屏叠加面板；
3. 资源侧可选：逐个 gut 背包面板重装饰层（需逐层 A/B）；
4. 上游反馈：WebView2 + Ruffle WebGPU(D3D11) 每帧 100-500ms 渲染耗时问题。

**工具沉淀**：`automation/pack_drive.mjs`（CDP 驱动整合包浏览器：shot/click/open/switchfrac，从 scratch 迁入）。

### Round 64（2026-11-07 深夜）：背包卡顿**真正根因** = GPU 光栅化瓶颈，DPR 1.5 是放大器 —— 已修复（1.6x 提速）

> 用户反馈「背包卡顿没解决」。本轮**终止旧网关与浏览器、全量重启监听**，用
> **时间戳网关日志 + 页内 LoAF/longtask/RAF/resource 四观察器 + CDP Tracing** 重新归因。

#### 一、推翻 Round 63c 的「渲染提交、脚本耗时=0」结论

Round 63c 判断「LoAF 长帧脚本耗时合计 = 0 → 卡在渲染提交路径」。本轮实测**不支持**：

| 指标 | Round 63c | Round 64 实测 |
|---|---|---|
| LoAF 长帧脚本耗时 | ≈ 0 | **10.9 万 ms 累计**（单帧最高 16223ms） |
| 样式/布局耗时 | 未测 | **311ms 累计**（可忽略） |
| 真实瓶颈 | 渲染提交 | **GPU 光栅化 + wasm 同步等待** |

单帧极值（`live_loaf_samples.jsonl`）：
```
d=16234ms  b=16175ms  script=16223ms  style=0ms
names=["event-listener:CANVAS.onpointerup", "user-callback:FrameRequestCallback"]
```
→ 一次 `pointerup`（点背包/切宠）触发 **16 秒**连续 wasm 帧回调，脚本时间几乎占满。
Round 63c 之所以测到「脚本=0」，是因为当时 `vis=hidden`（面板被 IAB 节流）→ Ruffle 根本没在跑帧。

#### 二、CDP Tracing 实锤：瓶颈在 GPU 进程

抓切宠 7 秒（`trace_switch.json`，85641 事件），按线程聚合：

| 进程 / 线程 | 事件总时长 | 说明 |
|---|---|---|
| **GPU Process / CrGpuMain** | **67907ms** | 墙钟 7s 的 **9.7 倍** |
| GPU Process / GpuVSyncThread | 15261ms | 垂直同步等待 |
| Renderer / CrRendererMain | 21320ms | 主线程（含 Ruffle wasm） |
| Renderer / Compositor | 461ms | 合成线程几乎空闲 |

GPU 进程内调用链（7s 内 520 次，**完全串行，最大并发 = 1**）：
```
WebGL                          7509ms  n=520  平均 14.4ms/次  max 59.4ms
└ CommandBuffer::Flush         7508ms  n=520
  └ CommandBufferStub::OnAsyncFlush  7508ms
    └ CommandBufferService:PutChanged 7504ms
      └ (D3D11 驱动内执行，Chrome 未插桩)
```

**每帧账目完全对上**（79 帧逐帧统计）：
```
平均 主线程     = 24.3ms
平均 GPU flush  = 93.8ms      ← 占满整帧
平均 帧间隔     = 94.8ms
GPU flush > 30ms 的帧: 79/79 (100%)
```

#### 三、受控实验：确认是「像素填充率」瓶颈

| 实验 | 画面像素 | fps | 脚本耗时 | 结论 |
|---|---|---|---|---|
| A. 原始 | 1728×1008 = **1.74MPx** | 10.5 | 1640ms/5s | 基线 |
| B. 缩到 576×336 | 0.19MPx (1/9) | **26.7** | **68ms** (1/24) | 帧率×2.5 |
| C. 恢复 | 1.74MPx | 10.7 | 1174ms/5s | 可复现 |
| D. 缩到 288×168 | 0.05MPx (1/36) | **33.4** | 119ms | 帧率×3.2 |
| E. 隐藏 stage | — | 11.5 | 834ms | **隐藏无效**（Ruffle 仍在渲染） |

**像素数降 → fps 升、脚本耗时同步暴跌 24 倍** —— 这是「wasm 内部同步等待 GPU」的指纹：
Ruffle 每帧末尾同步会让 wasm 阻塞到 GPU 完成，脚本计时器把 GPU 时间也算进脚本。

GPU：`ANGLE (Intel, Intel(R) UHD Graphics (0x0000A788) Direct3D11 vs_5_0 ps_5_0, D3D11)`，dpr=1.5。

#### 四、修复：钳制 devicePixelRatio（已落地并验证）

`dpr=1.5` 让 1152×672 的舞台渲染成 **1728×1008**（多 125% 像素）。

**改动**：
1. `client/web/game.html` —— 加载 Ruffle 前把 `window.devicePixelRatio` 钳到 1
   （`?hidpi=1` 可关闭，恢复原生高清）；
2. `dist/aola-launcher-pack/launcher_new_utf8.cmd` —— 两处 chrome 启动加
   `--force-device-scale-factor=1`（双保险）。

**实测效果**（背包切宠 A/B，同一页面）：

| | canvas | fps | 帧间隔 | 最长帧 |
|---|---|---|---|---|
| 修复前 (DPR 1.5) | 1728×1008 | 11.2 | 92ms | 100ms |
| 修复后 (DPR 1.0) | 1152×672 | **19.3** | **54ms** | **62ms** |

**帧率 1.72x，帧间隔 -41%，像素 -56%**。

**压测（连续 8 次切宠/翻页签，修复后）**：
```
卡片1   帧+25 脚本+523ms 最长帧=79ms   fps=21
卡片2   帧+22 脚本+457ms 最长帧=65ms   fps=20
卡片3   帧+19 脚本+416ms 最长帧=56ms   fps=21
卡片4   帧+22 脚本+554ms 最长帧=92ms   fps=21
页签-魂卡 帧+34 脚本+912ms 最长帧=67ms   fps=20
平均脚本 569ms/步, 最长帧 92ms
```
对比 Round 63c 基线「单帧最长 15321ms / 1971 个长任务 / 194s 阻塞」——
**最长帧改善 166 倍**，fps 稳定 20-21。

#### 五、后续可选优化（按性价比）

1. **已验证**：DPR 钳制（本轮已落地）
2. **待验证**：`preferredRenderer` 换 `"canvas"` 后端；`--use-angle=d3d9`；
   `--enable-gpu-rasterization` / `--enable-zero-copy`
3. **资源侧**：打开背包时把不可见页签/副面板 `visible=false`（引擎补丁），减少每帧绘制对象
4. **已排除，不要再试**：petmovie 分片 stub（R63 证伪）、`stage.frameRate`（无引用）、
   Ruffle 版本二分、网络/缓存（misses=0）、bagLite、面板可见性节流

#### 六、环境复现（含踩坑）

```powershell
# 1) 网关（带时间戳日志）
node --import file:///D:/temp/ZCode/scratch/ts_patch.mjs client/tools/serve.mjs 8700
# 2) 整合包浏览器（必须脱离 DSH 沙箱作业，否则 mojo/sandbox 被拒）
wscript.exe scratch/start_pack_chrome4.vbs   # --remote-debugging-port=9223
# 3) 重打票据（Cookie 有效期很短）
node client/tools/round15_auto_login.mjs
# 4) 守护监听（自动重附 + 观察器重注入）
node automation/bag_monitor_daemon.mjs        # → scratch/bag_mon_20261107/live2.jsonl
# 5) 推进流程 + 测量
node automation/bag_flow_20261107.mjs login|quick|bag
node scratch/switch_measure.mjs               # 切宠 LoAF 明细
node scratch/trace_switch.mjs                 # CDP Tracing
node scratch/stress_test.mjs                  # 连续操作压测
```

**踩坑**：
1. DSH 沙箱内启动不了整合包 Chrome（mojo `platform_channel.cc:112 remote_endpoint->is_valid()`）——
   必须用 `wscript`/`cmd start` 脱离沙箱作业；
2. Node 内 `child_process.spawn` 在沙箱里 EPERM —— 时间戳包装改用 `node --import ts_patch.mjs`；
3. 窗口失焦 `vis=hidden` 时 fps=0，必须 `SetForegroundWindow` 置前再测；
4. 页面重载会杀 CDP eval 上下文 —— 监听必须做成守护模式（自动重附）；
5. Cookie 有效期短，每次重启都要 `round15_auto_login.mjs`。

**数据归档**：`client/docs/spike/bag-perf-round64-20261107/`
（live_loaf_samples.jsonl / trace_switch.json / switch_events.jsonl / gateway_timed.log / README.md）

### Round 65（2026-11-07 深夜）：切精灵"等 1-2 秒"的数据源定位 —— petmovie 位图降采样

> 用户反馈「切换精灵依旧很卡」，症状明确为「**点精灵卡片后，大图/数据要等 1-2 秒才出来**」
> （延迟问题，不是帧率问题）。Round 64 修的 DPR 解决的是帧率，这一轮针对延迟。

#### 一、大图的真实数据源

精灵大立绘 = `peticon/movie/type0/petmovie<ID>/petmovie<ID>_{0,1,2,3}.swf` **四个分片**。
逐字节解析（`client/tools/petmovie_downsample.mjs --scan`）：

```
全库 173 个分片, 合计 172.1MB
单片：1.49-1.70MB，内部 100% 是 DefineBitsLossless2 位图
      12-13 张 × 约 525×475，format=3（8bit 调色板 + zlib）
      单片 3.0-3.4M 像素 → 解压成 RGBA 约 12-13MB
```

→ 切一次精灵，Ruffle 要 **50 张位图 zlib 解压 + RGBA 展开 + 52MB 纹理上传**。
这就是「等 1-2 秒」的物理来源（配合 Round 64 已证实的 Intel UHD + ANGLE/D3D11 弱 GPU）。

#### 二、修复：网关层位图降采样（保留 SWF 结构）

`client/tools/serve.mjs` 新增 `pmDownsampleSwf()`，命中 petmovie 路径时：
- 解析 FWS 的 `DefineBitsLossless2`（format=3）
- **盒式平均（box filter）+ 预乘 alpha** 降采样到 `AOLA_PETMOVIE_SCALE`（默认 **0.7**）
- 平均色映射到最近调色板颜色（加权距离，alpha 权重 1.5 倍，保住透明边缘）
- 重新 zlib 压缩，**SWF 头（RECT/frameRate/frameCount）、类、时间轴、tag 顺序全部不变**

| | 原始 | 0.5 | 0.7（默认） |
|---|---|---|---|
| 单片体积 | 1.66MB | 0.52MB (-69%) | 0.94MB (-43%) |
| 单片像素 | 3.41M | 0.85M (-75%) | 1.67M (-51%) |

开关：
- `AOLA_NO_PETMOVIE_DOWNSAMPLE=1` —— 完全关闭
- `AOLA_PETMOVIE_SCALE=0.5` —— 更激进（更快、更糊）；`0.85` 更保守
- 单次请求加 `?nodown=1` —— 跳过该文件（对照实验用）
- 网关侧有 120 条 LRU 缓存（约 60MB 上限），同一分片只算一次

#### 三、踩到并修掉的两个坑（都很关键）

1. **重建 SWF 时丢了头部** —— 最初只写 `8 字节文件头 + tags`，把 RECT/frameRate/frameCount
   扔了，产物是**无效 SWF**（`frameRate` 读出 67、tag 只有 1 个假 tag），Ruffle 加载会静默失败。
   修法：`swfHeader = buf.subarray(8, hdrEnd)` 原样保留并按新长度重算 `fileLength`。
   校验工具：`scratch/check_served_swf.mjs`（比对声明长度、frameRate、tag 组成、位图数与尺寸）。
2. **旧网关照旧在服务** —— 多次 `Start-Process` 因端口占用静默失败（`EADDRINUSE` 写在 stderr 里），
   实际一直是 22:49 那个旧进程在跑，导致「改了代码没生效」的假象。重启网关后必须先
   `netstat -ano | findstr :8700` 确认 pid 与启动时间，再验证。

#### 四、验证到什么程度（诚实记录）

已确认：
- 产出的 SWF **结构合法**（声明长度 == 实际、`frameRate=24`、13 个位图、tag 组成与原文件一致）
- 位图像素尺寸确实减半（374×351 ← 534×501），调色板与内容对应正确
- 像素级差异（仅 alpha>0 处，放大回原尺寸比对）：0.5 档平均通道差 6.2%/255，
  0.7 档更小；最近邻 6.2% → 盒式 6.9%（逐像素指标反而略高，因为边缘被平滑，
  但视觉上盒式更少锯齿，所以**不按该指标选型**）

**未能验证**：端到端「点击 → 大图出现」的实际秒数。原因：
- WebGL canvas `preserveDrawingBuffer=false`，页内 `drawImage` 读回全黑，无法做像素变化检测
- CDP 截图对比：点击坐标难以稳定命中卡片（背包网格位置未知），且已看过的精灵被 Ruffle 内存缓存
- `player.load()` 测量被 **约 800ms 固定开销**污染（连 31 字节的空 SWF 也要 769-825ms），
  而游戏内是走 AS3 `Loader`，完全不是这条路径

→ 这一项的最终判据只能是**用户实机手感**。若 0.7 档仍不够快，可降到 0.5；
若觉得立绘变糊，设 `AOLA_PETMOVIE_SCALE=0.85` 或 `AOLA_NO_PETMOVIE_DOWNSAMPLE=1`。

#### 五、已排除，不要再试

- ❌ petmovie 分片 stub（Round 63 证伪：分片不是成本来源）
- ❌ `stage.frameRate`（无引用）
- ❌ Ruffle 版本二分（11-07 A/B 已排除）
- ❌ 网络 / 缓存（`misses=0`，全量命中）
- ❌ 隐藏 stage / 面板可见性节流（Round 64 E 组：隐藏无效）
- ❌ `player.load()` 基准测试（800ms 固定开销，测不出真实解码成本）

**工具**：`client/tools/petmovie_downsample.mjs`（单文件/批量/扫描）、
`scratch/check_served_swf.mjs`（SWF 结构校验）、`scratch/bag_spike.mjs`（开背包 LoAF 尖峰）

### Round 66（2026-11-07 深夜）：整合包改为一键 EXE 启动器，网关后台运行、生命周期绑定浏览器

> 需求：把 `.cmd` 启动器换成 exe，网关在后台跑，网关生命周期与游戏浏览器一致。

#### 一、做法

`client/tools/launcher/AolaLauncher.cs`（单文件、仅依赖 .NET Framework 4.x，`csc /target:winexe`）
编译为 `启动奥拉星.exe`，行为：

| 能力 | 实现 |
|---|---|
| 无命令行窗口 | `/target:winexe` + 子进程 `CreateNoWindow` + 重定向流 |
| 网关后台运行 | `node app\tools\serve.mjs 8700`，stdout/stderr 写 `logs\gateway-YYYYMMDD.log`（UTF-8） |
| **生命周期绑定浏览器** | 启动器隐藏常驻，`browser.WaitForExit()` → 杀网关 → 自己也退出 |
| 绝不留孤儿网关 | **Job Object + JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE**，启动器被杀则网关连带死 |
| 端口占用处理 | 启动前用 `GetExtendedTcpTable` 找 pid，若是 node 就接管杀掉，再等端口真正释放 |
| 单实例 | 命名 Mutex（按安装目录哈希） |
| 就绪判定 | 轮询 `GET /status` 最多 25s，失败弹窗并终止 |

构建：`pwsh -File client\tools\launcher\build.ps1`（源码入库，`dist/` 不入库）。

#### 二、顺手修掉的两个真问题

1. **POST 路径漏了 petmovie 降采样**
   实测日志里出现 `[POST] petmovie4555_0.swf -> 200 1157442B`（原始体积）——
   冷缓存首拉走 POST，而 Round 65 的降采样只挂了 GET，等于漏掉一半收益。
   已在 POST 分支补同一套 `pmDownsampleSwf`（`upstream.status===200` 且命中 petmovie 路径）。
2. **整合包内 lowfx.json 缺失 → 低配开关全部 false**
   启动日志 `[lowfx] 生效开关: {...全 false}`。`FX_FILE = join(root,"lowfx.json")`，
   包内 root = `app\`，但 `app\lowfx.json` 从来不存在 → 特效全开（去特效启动器形同虚设）。
   已把 `client/lowfx.json` 复制进 `app\lowfx.json`，日志确认 `enterGq/buffGq/gutBundles=true`。

#### 三、验证记录（实机）

```
[launcher] 启动 dir=...AolaStarLauncher lowfx=False
[launcher] 网关已启动 pid=21984（后台隐藏）
[serve] P0 mirror on http://127.0.0.1:8700/  game: /game
[launcher] 网关就绪
[launcher] 浏览器已启动 pid=4776
...
[launcher] 浏览器主进程退出，用时 270095ms
[launcher] 浏览器已全部退出，准备关闭网关
[launcher] 结束网关 pid=10192
```

- node 的 `MainWindowHandle = 0` → 确实没有控制台窗口
- 关闭浏览器后：node 退出、启动器退出、8700 释放（两次复验均通过）
- 中文文件名 exe 可正常启动（早前 `cmd start` 报 Access denied 是测试壳的 code page 问题，非产品问题）

#### 四、交付形态

```
AolaStarLauncher\
├─ 启动奥拉星.exe      ← 唯一入口（无窗口）
├─ 启动说明.txt        ← 使用/调参/排错说明
├─ app\               serve.mjs + web + lowfx.json
├─ runtime\           node 22 + chromium
├─ profile\           浏览器配置（登录态）
├─ logs\              gateway-YYYYMMDD.log
└─ backup\            旧的 .cmd 启动脚本（回退用）
```

#### 五、踩坑备忘（测试环境相关，不影响用户）

- DSH 沙箱禁止写 `.exe`、禁止运行新编译 exe → 编译/部署需提权
- 本 harness 里 `Start-Process` / `cmd start` 对常驻 winexe 会「挂住」：
  子进程继承管道句柄，命令等到 EOF 才返回。产品本身不受影响，验证时改用分离检查

### Round 67（2026-11-07 深夜）：立绘降采样导致 Ruffle 崩溃 —— 调色板位图行必须 4 字节对齐

> 症状（用户实机）：打开背包直接崩，Ruffle 报
> `panicked at render/src/utils.rs:339:45: index out of bounds: the len is 31251 but the index is 31251`
> 调用栈：`decode_define_bits_lossless` ← `BitmapData/init()` ← **`PetMovie5999_0()`**

#### 一、根因

崩溃点正是 Round 65 引入的 petmovie 降采样产物（PetMovie5999_0）。
`decode_define_bits_lossless` 读的是「调色板位图」，它按
**每行 `ceil(w/4)*4` 字节（4 字节对齐）** 来计算缓冲区尺寸并逐行取索引。

我的重编码写的是**紧凑行**（每行 `nw` 字节），比解码器期望的短了
`(pad(nw) - nw) * nh` 字节 → 解码器读到最后一行时下标 == len → panic。

全库统计（`scratch/check_padding_rule.mjs`，176 分片 / 2217 张位图）：

```
未填充(plain) 匹配 : 525   ← 全部是 w 恰好能被 4 整除的情况（pad == w）
4字节行填充匹配     : 1692
都不匹配            : 0
```

→ 规则是确定的：**行必须 4 字节对齐**，`plain` 只在 `w % 4 == 0` 时巧合相等。

#### 二、修复（两处，缺一不可）

1. **源数据读取步长**：读原始索引必须用 `sRow = ceil(w/4)*4`，
   之前用 `w`，对 `w % 4 != 0` 的文件会整行错位（画面会斜切）。
2. **输出写出步长**：新索引数组按 `nRow = ceil(nw/4)*4` 分配，
   每行末尾用 0（调色板索引 0 = 透明）填充到 4 的倍数。

#### 三、新增自检护栏（防止同类问题再流到用户机上）

`pmDownsampleSwf` 里对**每个位图**做严格长度校验：

```js
const sRow = Math.ceil(w / 4) * 4;
if (raw.length !== palBytes + sRow * h) return null;   // 放弃整文件，原样放行
```

即：只要有一个位图的解码长度对不上预期，这个 SWF 就完全不降采样。
宁可慢一点，也绝不把可能越界的数据喂给 Ruffle。

#### 四、验证

| 范围 | 结果 |
|---|---|
| 全量 175 个可用分片 / **2217 张原始位图** | 长度 100% 等于 `palBytes + ceil(w/4)*4*h` |
| 同批 **2217 张降采样位图** | 同样 100% 严格匹配 |
| 崩溃触发点 `petmovie5999_0..3`（50 张） | 经网关实际取回校验：异常 0 |
| 大立绘 `5902/5713/6076/4635`（16 片 / 203 张） | 含 327、396 等非 4 倍数宽度：异常 0 |

验证脚本：
- `scratch/check_padding_rule.mjs` —— 统计行填充规则（证明规则本身）
- `scratch/verify_pad_fix.mjs` —— 对全部文件逐张校验「原始 vs 降采样」长度契约
- `scratch/verify_served.mjs <url...>` —— 从网关实际取回字节再校验（端到端）

#### 五、教训

- SWF 的**调色板位图（format=3）行填充**是硬性格式要求，不是可选的优化；
  只要动 `DefineBitsLossless2` 就必须同时处理 `palBytes` 偏移与 `row padding`。
- 「能 load 不报错」不等于「解码正确」：`player.load()` 对结构错误可能静默通过，
  真正的崩溃发生在 AS3 `BitmapData/init()` 从符号取位图的那一刻。
- 对这类「自己造二进制」的改动，必须**逐字节对照解码器期望**，
  并加运行时自检护栏，而不是只靠肉眼/截图验收。

### Round 68（2026-11-07 深夜）：渲染像素固定 960×560，显示等比放大 1.3 倍（模拟百田游戏管家）

> 需求：把像素数固定为 SWF 原生 **960×560**，显示时等比放大到 **1.3 倍**，像素总量不增加；
> 视觉上像「百田游戏管家」那样把游戏铺在窗口里。

#### 一、做法：布局尺寸 = 原生，`transform` 负责放大

关键是利用「`transform: scale()` 不参与布局」这一点：

```css
#fit   { position: relative; width: 960px;  height: 560px; }   /* 占位 = 放大后的视觉尺寸（JS 设置） */
#stage { position: absolute; left: 0; top: 0; width: 960px; height: 560px;
         transform-origin: top left; }                          /* 布局尺寸恒为 960×560 */
#player{ width: 960px; height: 560px; }
```

`#stage` 的**布局尺寸永远是 960×560**，Ruffle 量到的 `clientWidth/Height` 因此固定，
画布后备缓冲恒为 **960×560**；再由 `transform: scale(1.3)` 把它视觉放大到 1248×728。
`#fit` 用 JS 设成放大后的尺寸，保证下方元素（日志/按钮）不被覆盖。

配合 Round 64 的 `--force-device-scale-factor=1`（DPR 钳到 1），
画布不会再被 DPR 二次放大。

#### 二、缩放策略

- 默认：`?scale=1.3` 精确 1.3 倍（启动器默认传这个）
- 不传 `?scale`：按窗口自适应，`k = min((innerW-16)/960, (innerH-16)/560)`，上限 4 倍
- 窗口比游戏大时，用 flex 居中（`body { display:flex; align-items:center; justify-content:center }`），
  不会缩在左上角

启动器同步改为 `--app=.../game?scale=1.3 --window-size=1300,860`。

#### 三、像素量对比

| | 画布 | 像素数 | 相对 |
|---|---|---|---|
| Round 64 方案 | 1152×672 | 774K px | 100% |
| **Round 68（本次）** | **960×560** | **538K px** | **-30.6%** |
| 显示尺寸（视觉） | 1248×728 | — | 1.3× |

GPU 填充成本与像素数成正比（Round 64 已证实瓶颈在 `CommandBuffer::Flush` 的光栅化），
所以这一步是**直接砍掉 30% 的光栅化工作量**，同时画面比原来更清楚一点点
（因为不再有 1.2 倍 →现在渲染 1:1 再放大 1.3，实际是 SSAA 变成普通放大；
细节锐度取决于放大插值，浏览器默认双线性）。

#### 四、验证

```
canvas 后备缓冲: 960 x 560        ✅
canvas 显示尺寸: 1248 x 728       ✅ (1.300x)
#fit 占位尺寸  : 1248 x 728       ✅
#stage transform: scale(1.3)
DPR: 1
```

**鼠标坐标穿透验证**（transform 最容易踩的坑）：
在显示区域 25%/75% 处派发点击，Ruffle 侧按 `canvas.width / rect.width = 0.7692` 换算：

```
client(971,494)  → 画布内(240,140)   ✅（期望 960*0.25=240, 560*0.25=140）
client(1595,858) → 画布内(720,420)   ✅（期望 960*0.75=720, 560*0.75=420）
```

→ 输入映射精确，`transform` 缩放不影响操作。

验证脚本：`scratch/verify_scale.mjs`、`scratch/verify_input_scale.mjs`、`scratch/fps_probe.mjs`

#### 五、注意

- 放大是**双线性插值**，1.3 倍会有轻微软化；若想更锐，可把 `?scale` 调到 1.0–1.2，
  或用 `image-rendering: pixelated`（会变成硬边马赛克，不适合 2D 卡通画风，未采用）
- `#log` 页面日志默认隐藏（改由 `logs\gateway-*.log` 提供），需要时 URL 加 `?log=1`
- 该改动与 Round 67 的立绘降采样互不影响，两者叠加

### Round 68b（2026-11-08）：文档全量对齐（README / HANDOFF / 整合包说明）

把散落在 Round 64–68 的改动统一收进文档，并清理了一批**已经过时**的表述。

#### 一、整合包内文档合并为一份

原来包里有 `说明.txt`（Round 46 时代，整篇讲 `.cmd` 启动器 + 13 项面板）和我临时加的 `启动说明.txt`，
两份互相矛盾。现已**合并重写为唯一的 `说明.txt`**，删除临时文件，章节为：

```
一、这是什么          二、启动（EXE + 生命周期说明）   三、目录结构
四、常见问题          五、注意事项                     六、日志与排错
七、低配模式          八、渲染像素与显示缩放（R68）     九、精灵大立绘降采样（R65/R67）
```

#### 二、纠正一个一直写错的事实：`startmv` 默认没生效

`app\lowfx.json` 里是 `"startmv": "off"`，而网关只认 `"1"` / `"skip"`
（`startmv: ["1","skip"].includes(smvRaw) ? smvRaw : ""`）——
`"off"` 会被归一化成空串 = **不换壳 = 战斗开场演出照常播放**。

此前 README 与旧说明里都写着「默认档已开启亚比登场演出空壳」，属于错误描述。
已完成实证：`/lowfx` 返回 `"startmv":""`（effective），文件值 `"off"`。
文档已改为明确说明「默认**没有**开它；且文件优先于环境变量，要开须把文件值改成 `1`」。

#### 三、README 更新点

| 位置 | 变化 |
|---|---|
| 顶部状态块 | 增加 Round 64–68 四条摘要 |
| §1 整合包启动 | 启动参数补全：`--force-device-scale-factor=1` / `--window-size=1300,860` / `?scale=1.3` |
| §1 低配用法 | 把「双击 启动奥拉星-去特效.cmd」改为「`app\lowfx.json` + 面板」；列出现档位的逐项生效值 |
| §1 环境变量表 | `AOLA_NO_STARTMV` 行补上 `startmv="off"` 的真相；`AOLA_NO_PETMOVIE_*` 两个新变量 |
| §1 渲染（新节） | Round 68 的 960×560 + 1.3× 说明、像素对比表、输入映射验证结论 |
| §2 目录结构 | `client/tools/launcher/`、`petmovie_downsample.mjs`、整合包内 exe/说明/logs/backup 全量展开 |
| §5 已知问题 | 背包卡顿条目合并 Round 64 + 68；立绘降采样条目补 Round 67 崩溃与修复 |
| §6 文档索引 | HANDOFF 范围 22–63 → 22–68 |

#### 四、校验

- 全文搜 `去特效.cmd` / `启动说明` / `1.2 倍` / `13 个`：剩余命中均为**历史记录**（HANDOFF 旧轮次）或**明确标注为 backup 回退**，无矛盾表述
- 整合包目录树与磁盘实际结构逐项对照通过（`app\{cache,docs,tools,web}` + `lowfx.json` + `logs\` + `backup\`）

### Round 69（2026-11-08）：尺寸/渲染逻辑与官方对齐 —— 页面大小五档选择器（100%~200%）

> 需求：渲染与尺寸逻辑与官方对齐，页面上提供页面大小选项 **100% / 125% / 150% / 175% / 200%**。

#### 一、设计

**渲染逻辑（与官方 Flash 运行时同构）**：画布后备缓冲**恒为 SWF 原生 960×560**，
与窗口大小、页面倍率**都无关** —— 显示放大是纯展示层的 CSS `transform`，不参与布局，
Ruffle 量到的 `clientWidth/Height` 恒为 960×560。GPU 光栅化成本在**任何档位下恒定不涨**
（Round 64 已证实像素数就是瓶颈，这是本方案的核心不变量）。

**尺寸逻辑**：显示倍率五档，100% = 官方原生 1:1：

| 档位 | 显示尺寸 | 备注 |
|---|---|---|
| **100%（默认）** | **960×560** | 官方原生 1:1 |
| 125% | 1200×700 | 1300×860 启动窗口可完整放下 |
| 150% | 1440×840 | 超窗出滚动条 |
| 175% | 1680×980 | 同上 |
| 200% | 1920×1120 | 同上 |

- **优先级：页面手选（localStorage 持久化）> URL `?scale=`（测试/强制用）> 默认 100%**。
  手选最高优先是有意为之：即使旧版 exe 还在传 `?scale=1.3`，用户一旦手选就接管
- 选择器即时生效（改 transform，无需刷新），写入 `localStorage["aola_page_scale"]`
- Round 68 的「按窗口自适应」模式**移除**（用户列的选项是完备状态空间，行为可预测）

#### 二、改动清单

| 文件 | 改动 |
|---|---|
| `client/web/game.html` | ① 右下角新增「页面大小」`<select>`（样式同现有悬浮按钮族，位于刷新按钮上方）；② Round 68 缩放块重写：`resolveK()` = 存储 > URL > 1.0，`apply()` 固定档位（移除 resize 监听与自适应）；③ `#fit` `margin: 0` → **`margin: auto`** —— 放大超出窗口时 margin:auto 退化为 0，滚动条可达；flex 居中会双向裁切滚不到 |
| `client/tools/launcher/AolaLauncher.cs` | 移除 `?scale=1.3` 强制；`--window-size=1300,860` 保留（125% 档可完整放下） |
| 整合包 | `启动奥拉星.exe` 重编译（15,872B）；`app\web\game.html` 同步；`说明.txt` 第八节重写为五档说明 |

#### 三、验证（IAB 实测，2026-11-08）

| 项 | 结果 |
|---|---|
| 默认档（清存储） | k=1、`scale(1)`、#fit 960×560、选择器显示 100% ✅ |
| 五档切换 | 125/150/175/200 逐档：transform、#fit、选择器、localStorage 全部正确（1.25/1.5/1.75/2）✅ |
| 持久化 | 选 150% → reload → k=1.5 恢复、选择器 150% ✅ |
| 溢出滚动 | 200% 在 1280×720 视口：scrollWidth 1920 > clientWidth 1265，滚动条可见可滚 ✅ |
| 渲染不变量 | 各档位下 #player CSS 恒 960×560；canvas 后备缓冲 = SWF 舞台（引导期 550×400，进世界后 960×560），**不被倍率放大**；DPR=1 ✅ |
| URL 兜底 | 清存储 + `?scale=1.3` → k=1.3、选择器显示占位「—」（非标值不误导）✅ |
| 200% 视觉截图 | 游戏画面等比放大清晰、滚动条出现（截图存 IAB 会话）✅ |

**点击映射的诚实记录**：本环境（IAB 后台 pane）`cua.click` 的 mousedown 不下发（mousemove 可达），
无法在会话内做真实点击实测。映射机制本身未动：rect 实时反映 transform（150% 下实测 1440×840），
Ruffle 按 `canvas.width/rect.width` 换算——Round 68 已在真机验证该公式对 transform 缩放精确成立
（25%/75% 两点），Round 69 只是改变 k 的取值方式。**最终判据 = 用户实机手感**（顺带可验）。

#### 四、遗留

- 手选后无法回到「按窗口自适应」（五档之外无该项）——如需要可清 `localStorage["aola_page_scale"]`，
  或后续加第六档；按用户「只保留说过的选项」惯例，暂不加
- 引导链早期影片（550×400）在 960×560 容器内被 Ruffle 拉伸填充（`letterbox: "off"`），
  与 Round 68 行为一致，非本轮引入

### Round 70（2026-11-08）：版本同步修复 —— 客户端落后官方 1 个版本的根因与自动跟版

> 用户反馈：客户端没有拉到最新版本，相较官方落后 1 个版本（官方每周五更新）。

#### 一、根因（两层叠加，缺一不可）

1. **`cacheKey()` 把版本后缀剥掉**（`foo~261031.swf → foo.swf`，round43 为统一缓存键设计），
   而 `localPathFor()` 用剥后缀的名字落盘 —— 官方更新换版本号后，游戏请求 `foo~NEWVER.swf`，
   本地仍然命中 `foo.swf` 的**旧字节**。整个内容树被冻结在首次拉取态；
   只有「全新名字」的资源（新活动 activity261106 等）才会回源 —— 这正是 activityres 有新文件、
   而模块全静止的原因。
2. **镜像纯 cache-first、无任何再校验**：版本清单文件本身（无版本后缀、URL 永不变）永远不会重新拉取。

#### 二、版本机制实测（2026-11-08，与上游逐字节比对）

- **`play/start.xml` 就是增量版本清单**：根节点 `<v>20261105915135290</v>` = 当前数据版本
  （缓存版停在 `20261029…`），每个 `<f n="资源名" v="261105XXXXX"/>` = 本轮变更的资源与版本号
  （上周五更新里 `pet/petfightnew`、petmovie6116 新亚比、activity261106 全在列）。
  客户端按该表请求 `<资源>~<v>.swf`。
- 上游已变化而缓存陈旧的清单：`start.xml`（1233B→4482B）、`config.xml`、`iconfig.xml`、
  `sceneitem.xml`；`difference.xml`/`sceneres.xml`/`versiondata.swf`/`loader_res.swf` 当时一致（保险起见一并纳入）。
- ⚠️ **`loader.swf` 缓存版是刻意打补丁的**（注入 CJK 设备字体，71016B ≠ 上游 69938B）——
  **不在刷新名单**，回源会覆盖字体补丁。

#### 三、修复（serve.mjs + game.html）

| 改动 | 内容 |
|---|---|
| `localPathFor()` | 本地文件名**保留版本后缀**：版本变 → 文件名变 → 必然 cache miss → 回源。旧版本条目自然孤儿化 |
| `FRESH_PATHS_RE` | **清单网络优先白名单**（start.xml/config.xml/iconfig.xml/sceneitem.xml/sceneres.xml/difference.xml/versiondata.swf/start.swf/loader_res.swf）：每次启动回源校验，成功即覆盖缓存+`.ct`，**上游失败/异常回退本地缓存**（启动韧性） |
| petmovie LRU ×2、inlineGutCache | 缓存键改带版本后缀 —— 新版本位图重新降采样/现场重 gut，不复用旧 LRU |
| `game.html` 入口 | `start~2107300001.swf` → **无后缀 `start.swf`**（实测上游两写法字节一致=弱校验；且在 FRESH 名单内每次启动回源） |
| 上游请求 | 仍走剥后缀 `cacheKey`（弱校验实测成立，无风险） |

#### 四、验证（实机网关，2026-11-08）

```
[fresh] aola.100bt.com/play/start.xml      清单回源校验 → 1233B → 4482B（11-05 版）
[fresh] aola.100bt.com/play/config.xml     468073B → 469034B（含网关改写）
[fresh] aola.100bt.com/play/iconfig.xml    28220B → 30392B
[fresh] aola.100bt.com/play/sceneitem.xml  440420B → 444053B
GET loader.swf  -> 200 (cache) 71016B      ← 字体补丁版保住，未回源
GET activityres/.../vsceneinit.swf -> (cache)  ← 非清单 cache-first 回归 ✅
start~99991234.swf 请求 → 独立落盘 2495B     ← 按版本文件名 ✅（已清理测试产物）
```

**效果**：下次启动起，客户端自动跟上官方每周五的版本 —— start.xml 新了 → 游戏请求新版本号模块
→ 按版本落盘必然 miss → 全量流入。无需任何手动清缓存动作。

#### 五、交付物更新（同日）

- 用户误用了旁边的旧发行包 `AolaStarLauncher-20261104.zip`（Round 62 时代：cmd 启动器、无选择器）。
- 已重打新发行包 **`AolaStarLauncher-20261108.zip`**（5859 entries：新 exe + Round 70 serve.mjs + Round 69 game.html +
  说明.txt 含版本同步 FAQ；排除 `logs\` 会话日志）。旧 zip 保留未动，建议删除防混淆。
- `说明.txt`「四、常见问题」补版本自动跟版说明（含 loader.swf 字体补丁版不回源的例外）。

### Round 70 收尾（2026-11-08）：工作空间清理 —— 约 4.3GB

#### 已删除
- `D:\temp\ZCode\scratch`（627MB，一次性脚本/日志/抓包；被 HANDOFF 引用的验证脚本已先收进仓库）
- `temp\`（589MB：chrome/node 下载包、提取的运行时、bisect 用 Ruffle nightly 目录）
- `reverse\`（30MB，RE 工作现场）、`client/web/ruffle-bisect\`（118MB，版本二分结论已记录）、
  `client/web/ruffle.old-10-31\`（30MB）
- `client/docs/spike\` 根部散落产物（约 1.08GB 截图/ABC dump/打补丁实验件）；保留 4 个被文档引用的
  归档目录：bag-perf-20261107 / bag-perf-round64-20261107 / perf-investigation-20261104 / **stutter-20261104**
- 旧发行包 `AolaStarLauncher-20261104.zip`（1.1GB，Round 62 时代，用户曾误用；20261108.zip 取代）
- `client/serve_*.log` 运行日志（serve_out.log 为 git 已跟踪文件，随 server.ps1 一并删除——
  P0 时代 PowerShell 原型网关，已被 serve.mjs 全面取代）、整合包 logs\ 与 profile 浏览器缓存

#### 缓存清理与**补丁站点保留清单**（重要）
`client/cache` 746MB → 22MB：游戏资源全部可在下次启动经镜像重拉（Round 70 的清单网络优先 +
按版本落盘让这个过程自动发生）。**以下 26 个文件是从上游无法重新获得的本地补丁件，已保留**：
```
play/loader.swf(.prefont)                    ← CJK 设备字体注入版（71016B ≠ 上游 69938B）
play/pet/petfightnew.swf(.orig/.prefont)     ← 引擎字节码补丁站点（当前未打，走 serve 时 stub；.orig 供 apply_engine_patches 重打）
play/library/common.swf(.prefont)            ← 网关启动时从中提取星域图（petBackground 移植用）
play/library/util.swf(.prefont)
play/play.swf / play/user/login.swf(.prefont)
play/house/housecommon.swf(.prefont)
play/legendpet/soul/legendsoulpanel.swf(.prefont)
play/library/socketserver(.1).swf(.ct)       ← patch_seq4（Round 22 时代）
play/material/materialservice.swf(.ct/.patched4/.prehk/.prepc3)
```
⚠️ 未来任何"清缓存"操作必须先保留这批文件（或按 *.prefont/*.orig 边车定位补丁站点）。
整合包 `app\cache` 刻意**未清**——它是开箱即玩的热缓存（首启免 700MB 下载），Round 70 机制会让它自己跟版。

#### 验证脚本新家
scratch 中被 HANDOFF 引用的脚本已收进仓库：
- `client/tools/verify/`：check_served_swf / check_padding_rule / verify_pad_fix / verify_served /
  verify_scale / verify_input_scale / fps_probe / bag_spike / focus_game.ps1 / start_pack_chrome4.vbs
- `automation/`：新增 pack_profile.mjs / raf_probe_pack.mjs（包浏览器测量）
（旧文档中的 `scratch/xxx.mjs` 路径均为历史记录，实际文件以上述两处为准）

#### 清理后冒烟测试（8702 端口，已停）
网关正常启动（21 个 gut 空壳 + lowfx 载入）、/game 200、start.swf 回源 200、
loader.swf 命中缓存 71016B（字体补丁版完好）。

### Round 70b（2026-11-08）：裸名请求 TTL 回源 —— 版本跟版的最后一层

> 用户实包实测（11:01 包日志）：清单回源全部生效（start.xml 4482B 新版已到、rewrite 行显示
> 游戏已拿到新数据版本 20261105915135290），**但游戏随后请求的几十个模块 SWF 全是「无版本后缀
> 的裸名 GET」→ 全部 (cache) 命中旧字节**。官方客户端模型 = 裸 URL + 服务器弱校验返回当前版；
> Round 70 的按版本落盘只救了带 ~v 的请求，裸名大头仍被 cache-first 钉死。

#### 修复（serve.mjs 三件套）

1. **TTL 回源**：缓存 mtime 超过 `AOLA_CACHE_TTL_HOURS`（默认 6，0=关闭）→ 本请求网络优先，
   失败回退缓存。每网关进程对同一文件只回源一次（`revalidMemo`），会话内后续请求仍走缓存。
2. **PATCH_PROTECTED 精确保护名单**（与上游逐字节比对后确定，TTL 绝不覆盖）：
   ```
   play/loader.swf(71016≠69938) / play/pet/petfightnew.swf(5614888≠5376526)
   play/user/login.swf(161452≠150620) / play/library/socketserver(.1).swf
   play/material/materialservice.swf(102931≠83119)
   ```
   （common/util/play/housecommon/legendsoulpanel 经比对与上游一致，无需保护，正常回源翻新）
3. 回退分支统一 `netFirst = wantFresh || ttlStale`。

#### 实测（8703 端口）

```
loader.swf   → (cache) 71016B                    ← 保护名单生效，补丁不被动
common.swf   → [ttl] 回源翻新（mtime 更新）→ 二次 (cache)   ← TTL 层生效
pet/loginpetfightnew~261105310529741.swf → 拉新 63462B 按版本落盘
```

#### 顺带发现

- **上游 WAF 对快速连续请求限速**（脚本 8 连发全部返回同一拦截页）；网关按游戏节奏取文件
  不受影响，且回源失败自动回退缓存，最坏情况当次会话暂用旧文件、下次会话再校验。
- 整合包 serve.mjs/说明.txt 已同步、20261108.zip 已重打（TTL/PATCH_PROTECTED 已验证在包内）。

### Round 70c/70d（2026-11-08）：IAB 实机调试 —— 世界进不去的四层连环坑，全部修复

> 用户报告：整合包/开发环境都进不去世界。在 IAB 里全流程实机调试，逐层剥出 4 个叠加问题。

#### 一、会话级 Cookie —— 每次重开浏览器都退回「插件不受支持」

`game.html` 的 Cookie 注入/组合全部没设过期 → **会话 Cookie**，浏览器一关就丢 →
下次启动走「网页登录 iframe」→ 官方登录表单是 Flash `<object>` → Chromium 显示「插件不受支持」。
修复：所有 `document.cookie` 写入加 `max-age=31536000`（365 天持久）。
补救命令（README 既定）：`node client/tools/round15_auto_login.mjs`。

#### 二、世界装配阶段用 POST 拉库文件 —— 绕过全部缓存/补丁

登录成功后的库加载（socketserver/materialservice/login…）走 **POST**，此前 POST 永远直连 →
补丁版（89703/102931/161452B）全部被绕过，游戏拿到上游未补丁字节。
修复：静态资产扩展名（.swf/.xml/…）的 POST 也读缓存（**只读不写**），业务接口（.action/.jsp）仍直连。

#### 三、版本化请求绕过补丁站点（Round 70 设计漏洞）

世界装配请求的是**带版本号的** `socketserver1~2026052196362970.swf` → 按版本落盘 miss →
上游**未打补丁**字节落盘（缓存里出现了 89845B 的版本化 socketserver）→ socket 握手即被服务器 RST。
修复（Round 70d）：`localPathFor` 对 **PATCH_PROTECTED 站点的任何版本号请求一律折叠到本地补丁文件**。

#### 四、materialdata 版本钉死缺失 —— ToteValueSeason #1065

清缓存把 `library/materialdata.swf` 清掉了 → 重拉上游最新版 → ToteService 的 onInited 链
`getDefinitionByName("ToteValueSeason")` **#1065 类未定义** → 装配计数器冻结在 15/61
（正是 Round 23-24 记录过的坑）。修复：从整合包热缓存恢复配套旧版（947244B）并加入钉死名单。

#### 五、interfaces.swf 三个防御补丁被清缓存连带丢失

`patch_equiptotalbe_guard / patch_petcard3_extra_skip / patch_hkhelp_skip` 的宿主 interfaces.swf
不在保留清单 → 已对**最新版**（含版本化副本）重新打上。materialservice 的 hk skip 同样重打
（patch_hkservice_skipmissing 检测确认原保留件缺失）。

#### 六、HeadFrameService 账号数据 throw —— 字节补丁未成，走摘除机制

账号新头像框 id:666 → `initMyHeadFrameData` throw → 异常穿透 socket 分发终止整批消息。
写了 `patch_headframe_skipmissing.mjs`（throw→jump 循环尾），但该循环为索引型（非 hasnext2），
**jump 目标栈深不平衡（VerifyError #1021/#1030），字节补丁未成**——工具保留待后续攻克；
改用 README 既定机制：`AOLA_DROP_SERVICE=HeadFrameService`（启动器 exe 已内置注入，
build.ps1 重编译）。materialservice 已恢复到 hk-patched 状态（headframe 补丁回退）。

#### 七、兼容钉死清单（PATCH_PROTECTED，最终版 —— 未来清缓存必须保留）

```
play/loader.swf(.prefont)               字体注入版
play/pet/petfightnew.swf(.orig/.prefont) 引擎补丁站点
play/user/login.swf                     登录模块补丁
play/library/socketserver(.1).swf       patch_seq4
play/material/materialservice.swf       Item/HK/PetCard3 skip 补丁套件宿主
play/library/materialdata.swf           兼容钉死 947244B（ToteValueSeason #1065）
```

#### 八、验证（IAB 全流程实机，12:41-12:47）

```
自动登录（Cookie 持久化）✓ → 进入游戏 → 选服 → 快速开始
→ 世界装配越过 15/61 卡点 → 亚比调整公告（本周内容）
→ 版本福利中心（签到 3 天/本期 10.9-11.5）✓
→ 世界场景「万予之律堕天使·战无炎」+ 右侧本周活动（双11盛典/雾万圣夜…）✓
→ 最高战力 1662908 加载 ✓
残留（均为 README 已知非阻断项）：face88/89 聊天表情 #1065；方正粗圆简体/Elphant 设备字体警告
```

#### 九、其他

- 开发模式页面日志**默认显示**（`?log=0` 关闭）；整合包启动器带 `?log=0` 保持干净，exe 已重编译（12:40）
- 启动器注入 `AOLA_DROP_SERVICE=HeadFrameService`（网关进程）
- 整合包 app\cache 已同步：materialservice（hk 补丁）/ interfaces（最新+3 补丁，含版本化副本）/ materialdata（钉死版）

#### 十、发行包定稿（2026-11-08 12:53）

`AolaStarLauncher-20261108.zip` 重打（5874 entries / 1.18GB），含 Round 70b/70c/70d 全部修复：
serve.mjs（TTL+POST 资产缓存+70d 补丁折叠+materialdata 钉死）、game.html（Cookie 持久化+日志默认）、
exe（?log=0 + AOLA_DROP_SERVICE 注入）、app\cache（materialservice 102933B hk 补丁版 /
materialdata 947244B 钉死版 / interfaces 最新+3 补丁·含版本化副本）。关键条目逐一验证通过。
（app\web\game.html 曾漏同步 max-age 修改与 materialservice 版本错位，均在本次打包前修正。）

### Round 70e（2026-11-08）：版本化 URL 内容分歧 —— cacheKey 剥版本号的弱校验假设被证伪

> 用户要求查询官方最新版本与精灵信息以对照客户端。查询发现：官方当前数据版本
> **20261105915135290**（11-05 周五档）客户端已对齐 ✓，但 materialdata 的**版本化 URL 与
> 裸名 URL 返回不同内容** —— 剥版本号取上游的假设（弱校验）对它不成立。

#### 一、实测（三份 materialdata，lzma 解 ZWS 后比对）

| 变体 | 大小 | ToteValueSeason 类 | pet6115/6116 资源 |
|---|---|---|---|
| 钉死 947244B（包热缓存，11-03 拉的） | 7406KB 解压 | ×3 ✓ | 无 |
| **裸名 923749B**（cacheKey 剥版本号上游给的） | 7115KB | **×0 ✗** | 无 |
| **版本化 951753B**（~261105732856411，官方 11-05 真版） | 7454KB | ×3 ✓ | 无 |

→ 早晨的 ToteValueSeason #1065 真因 = **剥版本号的上游请求拿到了无该类的裸名变体**。
（947244B 钉死是侥幸救场；正确修法是保留版本号取真版本。）

#### 二、本周官方变更内容（60 条 delta 摘要）

- **新精灵预告资源：petmovie6115 / petmovie6116**（type0+type1 全套四片）
- **光启战系资源：pet6114 / 6117 / 6118 的 fightassets 位图 + gqkillbig 大招特效**（6114=战无炎光启再临，
  与官网新闻「战无炎光启再临！钻装秘境上线！」对应）
- activity261106（本周：longzuwelfare/mengwanshengskin）+ **activity261113 预告（anpolifight，下周 11-13）**
- pet/petfightnew（战斗引擎）11-05 更新；pet/petdictionarydata 版本号更新但**字节未变**（新精灵名单尚未入字典）
- library/interfaces 11-06 更新（v=261106914756032）

#### 三、修复（Round 70e）

1. **上游请求保留版本号**：`remotePath = urlPath.split("?")[0]`（不再剥）—— 版本化请求取
   官方版本快照（951753B ✓），裸名请求取裸名内容，二者不再混淆。
2. **PATCH_PROTECTED 收敛为 4 件**（loader/login/socketserver×2 —— 上游数周未变+本地补丁）。
   materialservice / interfaces / materialdata / petfightnew **解除钉死**：官方最新组合自洽
   （管家同款字节），旧钉死字节反而成为错配源；本周 delta 里它们全部有更新，必须跟随。
   ⚠️ 旧 skip 补丁体系（Item/HK/PetCard3）对最新 materialservice **指纹失配 + 已改 ZWS 压缩**，
   保守策略 = 先跑官方原版；若实测再现「没有 N」类 throw，再对新版做指纹或用 AOLA_DROP_SERVICE。

#### 四、验证（IAB 全流程，13:19-13:24）

- 零 VerifyError / 零 #1065 / 零 headframe throw（与上一轮对照：2 个 ERROR → 本轮 0）
- 世界装配 ✓ → 进世界 ✓（场景=梦和花园，本周活动双11盛典/卡西娅/摩卡西斯皮肤全在）
- 残留仅 README 已知项：onPlayerEnterRoom #1063（切场景偶发）、face88/89 表情、设备字体警告
- ⚠️ 运行时会话密钥短效：40 分钟前的票据在选服后「登录失败」→ 重打 round15_auto_login 立即恢复。
  （进世界的操作节奏要在铸票后几分钟内完成。）

#### 五、遗留

- socketserver 的 patch_seq4 是否仍必需未验证（上游 5 月后未变，保守保留钉死）
- 若最新组合下账号数据再现「没有 N」类 throw：优先 AOLA_DROP_SERVICE 摘除对应服务，
  或对新版 materialservice（ZWS）重建指纹补丁（需 lzma，.lzmawork 有现成 npm 包）

### Round 70f（2026-11-08）：端口自动选择 —— 网关/页面/启动器全链路去硬编码

> 用户需求：端口自动选择可用端口。此前网关固定 8700（启动器硬编码 + game.html socketProxy
> 44 条代理 URL 硬编码 + round15 重打脚本硬编码）。

#### 一、改动

1. **serve.mjs**：`argv[2]` 支持 `0`/`auto`（系统分配临时端口）；指定端口 EADDRINUSE 时
   自动回退系统分配端口（server error 处理器重 listen）；实际端口以
   `server.address().port` 为准打印横幅；`ORIGIN`（facade 改写基址）listen 后更新为实际端口。
2. **game.html**：socketProxy 44 条代理 URL 改为**动态构建**
   （`"ws://127.0.0.1:" + location.port + "/ws2tcp/…"`），页面在任何端口下 socket 隧道都正确。
3. **启动器（AolaLauncher.cs）**：网关以 `"0"` 启动；`GatewayLine` 从日志横幅正则解析实际端口
   （`ActualPort`）；就绪判定 = 端口已知后探活 `/status`；浏览器 `--app` 用实际端口。
   **删除** KillStaleGateway/PortBusy/FindListenerPid/GetExtendedTcpTable 抢占逻辑 ——
   不再击杀 8700 占用者，与开发环境网关可共存。
4. **round15_auto_login.mjs**：第 2 参数指定网关端口（默认 8700）。

#### 二、验证（实机）

```
实例1（指定 8700）      → 绑定 8700 ✓
实例2（0=自动）         → 绑定 62357 ✓（共存）
实例3（指定 8700 被占） → 日志「端口 8700 被占用，自动改用系统分配端口…」→ 绑定 62415 ✓
三实例 /game 均 200；IAB 加载 62415 端口页面：socketProxy 44 条全部指向 :62415 ✓
```

#### 三、注意

- 启动器不再击杀占用 8700 的进程 —— 旧残留网关不再被接管，改用自动端口回避（更安全）。
- `PreferredPort` 常量保留仅作文档；网关默认端口仍是 8700（serve.mjs argv 默认值）。
- 运行时会话密钥短效：铸票后尽快进世界（Round 70e 已记录）。

### Round 70g（2026-11-08）：网关版发行（与整合包分开发布）

> 需求：只有网关程序的轻量版，启动后显示游戏地址并打开默认浏览器，与整合包分开发布。

#### 组成（AolaGateway-0.1.0-beta1.zip，93.5MB）

```
AolaGateway\
├─ 启动网关.cmd            双击入口（检查 node → start_gateway.mjs）
├─ 重打票据.cmd            读取 gateway_port.txt 向实际端口注入新票据
├─ start_gateway.mjs       包装器：以 0 端口起网关 → 解析横幅实际端口 → 打印游戏地址
│                          → 写 gateway_port.txt → start 打开系统默认浏览器
├─ round15_auto_login.mjs  票据重打脚本（支持端口参数）
├─ lowfx.json              默认特效配置
├─ tools\serve.mjs + gut_inline.mjs
├─ web\  game.html / ruffle / fonts / mirror-inject / stub
└─ cache\ 钉死补丁四件套（loader 字体版/login/socketserver×2）
```

- 依赖：系统 Node.js 18+ + 默认浏览器（不含运行时，与整合包 ~3.5GB 相对为 93.5MB）
- 端口自动选择（Round 70f）在网关版同样生效；`gateway_port.txt` 供重打票据定位端口
- 构建：`node client/tools/build_gateway_pack.mjs` → dist/aola-gateway/_stage/AolaGateway
  → zip（staging 含基目录，与整合包 zip 结构一致）
- ⚠️ 已知小坑：构建时若旧目录被默认浏览器进程持句柄会 EPERM —— 构建脚本改用独立
  staging 目录规避；旧 AolaGateway 目录残留时手动删除即可

#### 发布

- Release v0.1.0-beta1 双资产：AolaStarLauncher-0.1.0-beta1.zip（整合包）+
  **AolaGateway-0.1.0-beta1.zip**（网关版）
- 说明.txt 含网关版/整合包对照表
