# 奥拉星 Flash 客户端架构调查报告

> 调查日期：2026-10-31 ｜ 方法：线上端点实测 + SWF 二进制解压 + 常量池字符串分析
> 证据文件目录：`D:\temp\ZCode\aola\investigation\download\`

## 1. 总体结论

奥拉星页游（2010 年上线，至今仍在运营更新）的 Flash 客户端是一个**多级引导 + 增量版本清单 + 服务总线式模块化 SWF** 架构：

```
play.html (IE/非IE双写 <object>，960×560，Flash 10.1+)
   │  无 Flash 插件时 JS 自动 302 → /h5/（H5互通版，共享资源管线）
   ▼
start~2107300001.swf        引导器（2.5KB，ZWS/LZMA，SWF v18，AS3/AVM2，25fps，960×560）
   │  包名 mmo.checkversion：读 start.xml → 显示内存表(txtMemory/MemoryWatch) → 加载 loader.swf
   ▼
start.xml                    增量更新清单：<t>open</t><v>总版本</v> + <f n="路径" v="版本"/>
   │
   ▼
loader.swf                   主加载器（145KB 解压后，CWS/zlib）
   │  GameBootLoader / LoaderFacade / ResScheduler / DownloadManager
   │  + ConfigReader 读 config.xml（468KB 区服/模块/运营配置）
   │  + difference.xml（登录/服务网关拓扑）
   │  + versiondata.swf（3.5MB 全量版本库，49,555 条模块路径）
   ▼
loader_res.swf + play.swf + 模块化 SWF（library/ scene/ pet/ task/ ... 按 <init> 清单装配）
```

## 2. 加载链各环节（实测证据）

### 2.1 入口页 `aola.100bt.com/play/play.html`
- 经典双写 `<object>`：IE 用 `clsid:D27CDB6E-AE6D-11cf-96B8-444553540000`，非 IE 用 `application/x-shockwave-flash`；`allowScriptAccess=always`
- 主 SWF：`start~2107300001.swf`（文件名内嵌版本）
- JS↔AS 双向桥：`closeSocket/openVoice/showWebLogin/addCookieFromAs/showPayDialog/getUserAgent` 等（`js/aola.js`）；页面卸载时主动调 `closeSocket`
- 无可用 Flash 插件时：`location.href = "http://aola.100bt.com/h5/"`（Flash/H5 同入口分流）
- 引入 `normalize-flash-launch.js`（Chrome 80+ Flash 兼容垫片）与百田统计 SDK（BTDC）

### 2.2 引导器 `start.swf`（mmo.checkversion）
- 头 `ZWS` = LZMA 压缩 SWF v18；解压后 3921 字节
- 引用的 API 面：`URLLoader/Loader.loadBytes/ApplicationDomain/ExternalInterface/MemoryWatch`
- 关键常量：`start.xml`、`loader.swf`、`start~`、`mmo.checkversion.Load`、`showmethememory`
- 职责：读版本清单 → 拉起 loader.swf → 附带内存监控浮窗

### 2.3 版本清单 `start.xml`（当次实测）
```xml
<r><t>open</t><v>20261029761034522</v>
  <u><f n="play" v="261031358096721"/>
     <f n="library/materialdata" v="261029283147051"/>
     <f n="pet/gqkillbigmovie/..." v="..."/> ... </u></r>
```
- `v` 为时间戳式版本号（如 261031358096721 ≈ 2026-10-31），每周五更新节奏
- 仅列**当期有变动的模块**；全量映射在 versiondata.swf

### 2.4 主加载器 `loader.swf`（mmo.loader.*，源码树保留在调试信息中）
- 编译路径 `E:\vstsworkspace\project2009\source\as\loader\mmo\...`（TFS/VSTS 持续构建，源码包结构完整可见）
- 核心类：
  - `GameBootLoader`（启动装配：pushFiles/init）
  - `LoaderFacade`（阶段编排：loadLogin → loadLibsAndLogin_ForRegister → loadYunyingStart → loadRegister → loadSelectAvatar → loadPlay/closeLoadPlay）
  - `ResScheduler/ResManager/DownloadManager/CustomLoader`（并行下载调度、优先级 ResPriority、域隔离 ResDomain/ApplicationDomainGetter）
  - `ConfigReader/IconConfigReader`（config.xml/iconfig.xml 解析）
  - `WebLoginChecker/WebLoginUtil`（网页登录态校验，`&loginTimestamp=&webLogin_site=&fromGame=aola`）
- 安全/反逆向：`MD5Util`、`Encrypt/encryptBytes/MAX_ENCRYPT_COUNT/KEYCONST/LOADER_KEY_FIGHT`、`YiDunTokenUtil`（网易易盾）
- 本地存储：`localstore.100bt.com/btlocalstore/btlocalstore.swf`（跨域本地仓库 BtLocalStoreService）
- CDN 容错：`aola.100bt.com/play/do_not_delete/CDNaccelerationerror.txt`（CDN 加速失败上报/回源标记）

### 2.5 全量版本库 `versiondata.swf`（mmo.versiondata:VersionData）
- ZWS/LZMA，解压 3.59MB；XMP 元数据：Adobe Flash CS4 制作，创建于 2012-10-12，**最后修改 2026-09-10**（同一工程文件持续维护 14 年）
- 收录 **49,555 条**资源路径，分布 Top：activityres 20,971 ／ fightassets 7,337 ／ skinview 4,055 ／ peticon 1,929 ／ scene 1,555 ／ pet 1,357 ／ baricons 1,177 ／ skin 1,111 ／ tasknpc 978 ／ petcard 977 …
- 加载 URL 形如 `<模块名>~<版本号>.swf`；实测服务器**忽略版本后缀**（`socketclient~999999.swf` 也返回 200 同一文件）→ 版本号仅用于击穿浏览器/Flash 缓存

### 2.6 模块清单（config.xml `<init>`）
- 基础库：`library/socketserver, library/util, library/materialdata, library/interfaces, library/uiskin, library/common, library/socketclient, library_res/common_res_dialog, library_res/common_res_membericon, material/materialservice, material/avatarservice, font/font`
- play 必载模块：config、pet/petdataservice、shoot、init/badwordsdat、baseservice/*（notify/scenetalk/face/movestate/userstate/effect/icon）、msg/notifyinit、buddylist、talk、pet/pmservice、summoner、miraclepet、control/controlv2、iconbar、petdictionary、petskillmes、levelup、task/*（npc/barrage/init/extmanager/defines）、house/housecommon、skin/a000001、sounds/*、fighttalk、dailyland/dailyqueueservice、sceneicon、trainer、**physicsengine/box2d**（物理引擎内嵌）
- 服务白名单（Service 总线注册表）：`TalkService, TeamService, MoveStateService, PetFightService, MailboxService, ...` 约 50 个服务
- 架构含义：**每个模块是独立 SWF，启动时按清单并行下载并挂载到服务总线**；场景/活动模块再按需懒加载（`<r nm="..." weight="3"/>` 按权重分配房间）

## 3. 网络层

### 3.1 Flash 安全策略（实测）
| 域名 | crossdomain.xml |
|---|---|
| aola.100bt.com | `allow-access-from domain="*.100bt.com"` |
| resource.a0bi.com / www.100bt.com | `*.100bt.com` |
| account.100bt.com | `domain="*"`（全开放，供各游戏域登录态读取） |

### 3.2 服务端拓扑（difference.xml）
| 端点 | 用途 |
|---|---|
| `dispatch.aola.100bt.com/isp.txt` | ISP 调度（选线路） |
| `login-aola.100bt.com/` (+login2 备用) | 登录网关（newLogin.jsp、captcha.jsp、uc.jsp、ZoneInfo.jsp、redirect.jsp） |
| `service-aola.100bt.com/` (+service2 备用) | 业务 HTTP 服务 |
| `clientlog-aola.100bt.com/` (+union 备用) | 客户端日志收集（clientlogcollect.jsp） |
| `account.100bt.com/game/auth/login.html` | 网页登录 |
| `up.aola.100bt.com/snapshot.jsp` | 截图上传 |
| `yxkf.100bt.com/user/enterUserRoom.do` | 客服聊天 |
| `183.61.254.215:8050/pushErrorMessage.action` | 错误上报（硬编码 IP） |

### 3.3 Socket 协议（library/socketclient.swf + socketserver.swf 解析）
- config.xml 声明：`<socket><debug>false</debug><protocol>binary</protocol><exProtocol>binary</exProtocol></socket>` —— **自定义二进制协议**（非 AMF/XML）
- socketclient：`flash.net.Socket` 之上分域客户端（`mmo.framework.comm.{game,house,live,corps,bastion,...}:*Client`），命令式消息（`cmdReportBulletin/cmdReportFamily...`）
- socketserver：`BinaryMsgReader/BinaryMsgWriter/DownCmd/ExMsgCodec/IMsgReader/IMsgWriter`，处理器分 `SysHandler/ExtHandler/ExtBHandler`，房间模型 `data:Room/data:User`，`SeqLoader` 排队
- **加密实现于 Pixel Bender 字节码**：`encrypt.pbj`（`mmo/socketserver/encrypt.pbj`，符号 `__Z16encryptByteArrayv` 系 C++ 交叉编译 mangling）——把加解密放进 GPU/独立 VM 执行域以对抗反编译；配合 `Encrypt/encryptPart1..4/encryptCode`、易盾 token、MD5 校验（`collectValidateMd5Fail`）
- 连接状态机：`CONNECT_ERROR/LOST/READY/SUC`，心跳与排队（`isSkipDailyQueue`、`getServerIdMsec`）

## 4. 运行时演进（Flash 停服应对）
- **H5 互通版** `/h5/`：LayaAir 引擎（`<meta name="laya">` + `laya.*` 类），webpack 三段分包（vendors/core/bundle + gamemain 29MB 主逻辑），数据层 AMF3（与 Flash 同构），DragonBones/Spine 骨骼动画，`start.json/version.json` 增量清单——**与 Flash 版共用同一套资源路径**（start.xml 与 start.json 出现相同条目如 `library/materialdata`）
- **微端**：`百田游戏安全管家`（guanjia.100bt.com，Vue SPA），当前 **v7.2.2**，版本历史 API `/api/v1/getHistory/`；独立窗口运行（内嵌 Flash 运行时），跨平台（更新日志提及"非 Windows 平台"）、默认 HTTPS、支持"回源模式"、全屏等比缩放——即官方 Flash 停服后的容器方案

## 5. 架构评价
- **优点**：16 年持续运营验证；模块化+服务总线让功能增量发布无需发整包；增量清单 + 版本库双轨更新稳定；Flash/H5 双端共享资源管线降低了 H5 迁移成本；登录/服务/日志多线路+备用网关高可用
- **技术债/风控**：调试信息（源码树路径、方法偏移）随包发布；加密依赖 PBJ 这一非常规手段（本质仍是客户端侧对称加密，可被提取）；`account.100bt.com` crossdomain `*` 过宽；错误上报硬编码 IP；服务器忽略 SWF 版本后缀（弱校验）

## 6. 证据文件清单（investigation/download/）
| 文件 | 大小 | 说明 |
|---|---|---|
| play.html / aola.js | 10.6KB / 11.7KB | 入口页与 JS-AS 桥 |
| start.swf / swf_body.bin | 2.5KB / 3.9KB | 引导器（LZMA 已解） |
| start.xml | 1.2KB | 当期增量清单 |
| loader.swf / loader_body.bin | 69.9KB / 145KB | 主加载器（zlib 已解） |
| config.xml / difference.xml / iconfig.xml | 468KB / 1.2KB / 28KB | 区服+模块清单 / 网关拓扑 / 图标配置 |
| versiondata.swf (+body) | 258KB / 3.59MB | 全量版本库（49,555 条） |
| close.swf / loader_res.swf | 303KB / 431KB | 关服页 / 加载器资源 |
| library/socketclient.swf (+body) | 105KB / 256KB | Socket 客户端库 |
| library/socketserver.swf (+body) | 86KB / 239KB | Socket 协议/加密层 |
| library/util.swf | 158KB | 工具库 |
| guanjia*.html/js | — | 微端「安全管家」页面与 JS |
