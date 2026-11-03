# P0 可行性冲刺 —— 执行日志（2026-10-31）

> 项目：ruffle-client（Tauri/WebView2 + Ruffle 方案的 P0 验证）
> 本轮产出全部在 `D:\temp\ZCode\aola\client\`

## 🏆🏆 第十五轮（2026-11-01 12:40–13:40）：世界初始化命令批被服务器接受 —— RST 根除，P0 GO ✅✅✅

**最终防线攻破**：世界批发出后连接存活 90s+（原 ~5s 必 RST），S2C 持续涌入全服荣誉播报/
昵称/竞速广播等真实世界流量，游戏世界开始装配（活动横幅 + 资源进度 2/61）。
**P0 五关全部打通：boot ✅ / 登录 ✅ / 角色 ✅ / socket ✅ / 世界 ✅**（战斗待验）。

### 全自动登录链（本轮副产品）
- 桌面 `奥拉星My登录器(调试).lnk`（--remote-debugging-port=9222）+ pktmon 8000-8009 抓包
- **WAF 配方**：裸 POST normallogin 拿 `x-waf-captcha-referer`（60s 通行证）→ 带通行证
  + `ywzc_UUID/ywzc_new_UUID`（设备标识）重放 → 服务器直接下发组合 game_auth_sid（含新 token）
- **Cookie 格式坑**：服务器 Set-Cookie 是全量百分号编码（`gameId%3D2%2C...`），SWF 按字面
  `,`/`=` 切分 → 编码形态解析不出 token → newLogin 把整串 Cookie 当 token → invalid。
  修复：serve.mjs /import-login 解码规范化 + game.html composeAuthCookie 双保险
- 全链 ego-browser 自动化（tools/round15_*.mjs）：登录页表单 → 进入游戏 → 快速开始

### 🔑 DefenseMsgSeq 完整逆向（本轮核心成果）
```
神秘包谜底:   就是普通命令 11_1（module 9），transport XOR 密钥=seq(79)，种子静态所以密文静态
计数器公式:   next = 7*seq + 102 + hash31(sessionId) % 569     ← % 为 AS3 有符号余数！
溢出分支:     t ≥ 2147483647 → t % 1047483647 + 911
种子:         79（next 首调硬编码返回）
验证:         两天双会话 60+ 条链 + 40+ 溢出点零误差；hash31 = Java 风格 h=h*31+c
关键认知:     计数器同时是【线上 seq】和【消息体 body 密码本密钥】——
              隧道侧只改 seq 会导致 body(seq_client=0)/seq_wire(737) 失配 → 仍被踢
              （第十四轮隧道方案失败的真因）
onLoaderDeq:  是 shader 完成回调，在 Ruffle 永不触发 → 往它里面补常数全部无效
PBJ 内核:     (2,653,471,1) 不是真实运行值——真值 (7,?,569,911) 由 FlasCC CModule 经
              domain memory 写入（ABC 层不可见）；放弃追内核，直接改 next() 算术段
```

### 最终补丁（tools/patch_seq4.mjs，7 处等长原位替换，零结构风险）
1. onLoaderDeq enqueue 等待头 16B → nop（ShaderJob 空壳下等待永不完成）
2-4. num1-3 拷贝 → 常量（保形填充，无消费者）
5. num4 拷贝 → 911（保形）
6. **next() 算术段 21B → 常量公式版**（seq*7 + 102 + _hashSessionId%569，4 nop 补齐；
   客户端自算 _hashSessionId=hash31(sid)，与服务器一致）
7. **next() 溢出分支：getprop num4 → pushshort 911**（onLoaderDeq 不跑，num4 必须
   内联进 next）
教训：opcode 表 0xa3=divide / 0xa4=modulo / add=0xa0 / convert_d=0x75；pushshort
操作数是 u30 字面值（653=8d 05, 569=b9 04, 911=8f 07）。

### 遗留
- ExtHandler 个别服务器消息 dispatch 报错（非致命，世界装配继续）——待定位
- 世界资源 2/61 装配中；战斗场景验证（P0 最后一关）
- 隧道侧 DS 改写逻辑保留作兜底（客户端 seq≠0 时自动旁路）

## 🔓 第十四轮（2026-11-01 09:16–09:50）：DefenseMsgSeq 加密机制破解 —— RST 根因闭环 ✅✅✅

**监听配置**：My 登录器调试快捷方式（`--remote-debugging-port=9222`，桌面 `奥拉星My登录器(调试).lnk`）
+ CDP 监听器（monitor_real.ps1，抓到 boot 全链与登录页打开；newLogin 票据协议沿用第十三轮结论）
+ pktmon 区服抓包 30 分钟（tools/capture_zone_live.ps1，8000-8009 全包）。

**捕获**：完整游玩会话（163 粉星雪，115.159.197.100:8004，~25 分钟，含世界交互）
→ `zone_live.pcapng` 52,300 包（昨日 7,710 包的 6.8 倍）→ live_c2s.bin 42.5KB / live_s2c.bin 3.3MB。

### 加密机制（字节级实锤，跨两天双会话交叉验证）
```
帧格式:  [u32 len][u32 seq][payload(len-4)]     —— len 不含自身 4B
命令批:  payload[2..] 与 4 字节周期密钥 XOR（`01 27` 前缀保持明文）
密钥:    [seq.b1, seq.b0, seq.b3, seq.b2]（seq 的 4 字节按 16 位半字交换序）
计数器:  next = 7·prev + C；种子 0x4f（神秘包）；C 会话相关（昨日 319=0x13F，今日 488=0x1E8）
实锤:    真实客户端密文 "vetWearp" ^ [04 11..] = "getStartInfo" —— 与我们明文逐字节吻合
         872→6423→45280 严格 7x+319（昨日）；79→1041→7775→54913 严格 7x+488（今日）
```

### 根因闭环（第十三轮 RST 之谜的答案）
**我们的客户端 seq 恒 0（DefenseMsgSeq 未初始化）→ 密钥 [00 00 00 00] = 恒等 XOR →
方法名明文上线 → 服务器按会话密钥解不开 → 丢弃并断连。**
包结构/时序/神秘包从来无罪——只差这一层 4 字节 XOR。

### 神秘包（seq=0x4f）
两天会话（不同 sid/区服）逐字节对比**仅 1 字节差异**（0xd3→0xdb，尾部校验位），
且与我们客户端发出的完全一致——它不受本机制保护，静态可重放，服务器也照常回 privileges。

### 下一步（按序）
1. **补丁验证**：patched/socketserver*.swf（num1-4=2/653/471/1，已部署 cache）跑一轮会话，
   抓我们的 C2S 与真实密文 diff——计数器种子/递推/密文三方对齐即 GO
2. 若计数器 C 与服务器预期不符：C 大概率由 sid/loginkey 派生，解剖 FlasCC
   （CModule/encryptByteArray）拿完整派生式；密钥公式已验到 16 位，>16 位行为见 #5-#8（[K0 K1 00 K2]）
3. 战斗封包验证（今日会话含完整游玩，S2C 3.3MB 可作回包明文参考——S2C 方向无此 XOR）

### 新工具
- `tools/parse_c2s.mjs`：区服命令流解析器（帧切分 + 方法名提取）
- `tools/capture_zone_live.ps1`：可控停止的 pktmon 实时抓包（stop 标志文件触发）

## 🏆 第十二轮（16:00–17:10）：登录链全程打通，游戏进入世界 ✅✅✅

**P0 五关现状：boot ✅ / 登录 ✅ / 角色 ✅ / socket ✅（AMF 双向）/ 战斗（待验）**

### ABC 字节码全解（tools/abc_dump.mjs，完整反汇编器）
新工具 `tools/abc_dump.mjs`：method_info/traits/script_info/method_body 全解析 + AVM2 反汇编
（支持 pushstring/callproperty/getlex/分支解析，模式：m/refs/strscan/consts/slots/mi/set/pool）。

**startPlay 决策树还原**（mmo.user.login::Main，登录模块 220KB）：
```
via=getQS("via") → if (!ConfigReader.isWebLogin) 走本地流程
info = getAutoLoginInfo()  ← LocalStore("autoLoginInfo", "duoduoId_location_username")，读后即清
if (info) → Common.token/sessionId = info.* → doAutoLogin(info) → WebLogin.doAutoLoginGame
            → POST ConfigReader.loginUrl (=newLogin.jsp, 易盾 token 包裹)
elif (WebLoginChecker.webLoginData != null) →  ← newLogin 的真正数据源！
     Common.userName = webLoginData.duoduoId; Common.token = webLoginData.token
     → checkHasLoginCookie() → LoginUtil.getUserInfoByDuoduoId(showAutoLoginPage)
     → query_role_info POST → AutoLoginPage(用户数据) 渲染
```

**WebLoginData = parseObject(getCookie("game_auth_sid"))**——Cookie 按 `,` 分段、`=` 取键值！
字段：gameId/gameName/duoduoId/token/autoLogin/QQ*。
**LOGIN_COOKIE_KEY = "game_auth_sid"**（WebLoginChecker 常量，实锤）。
裸 token Cookie 解析成空对象 → Common.token=undefined → newLogin 永不触发
——**这就是此前白屏+无 newLogin 的最终根因**。

**newLogin POST 构造**（WebLogin.doLoginGame）：URLVariables{account=Common.userName,
charId, isnickname="sso", token=Common.token, content="src="+getQS(webLogin_src)+"&from="+getQS(webLogin_site),
test=getQS("testf")} → POST ConfigReader.loginUrl（config.xml `<loginUrl>newLogin.jsp</loginUrl>`）。
官方页 JS（deploy/index.js 的 W() 函数）用同一 ","/"=" 格式解析该 Cookie——双向实锤。

### 实施与修复
1. **game.html composeAuthCookie**：裸 token → 组合格式
   `gameId=2,gameName=%E5%A5%A5%E6%8B%89%E6%98%9F,duoduoId=<acct>,token=<token>,autoLogin=true`
   （实测浏览器内已有官方组合 Cookie，键值完全吻合：gameId=2/gameName=奥拉星）。
   非 ASCII 自动 ASCII 化（gameName 百分号编码）。
2. **facade Cookie 头净化**：值含非 ASCII 时 encodeURIComponent——
   **逗号分隔+UTF-8 原字节会让上游 WAF 直接 500**（newRegister 500 的根因，二分定位实锤）。
3. **socketProxy 44 端点**：从 newlogin_resp_real.xml 的 `<svr>` 提取全部 host:port 生成。
4. logLevel 降回 warn（debug 会冲掉 800 行缓冲）。

### 验证结果（ego-browser aola-ruffle-login）
```
game_auth_sid 组合 Cookie → SWF getCookie 读到 ✓
getAutoLoginInfo: getQS(duoduoId/location/username) ✓ → LocalStore 空 → null ✓
webLoginData 路径 → checkHasLoginCookie ✓ → query_role_info 366B ✓（与真实客户端同尺寸）
AutoLoginPage 完整渲染（头像/账号/进入游戏/注册多多号/其他账号登录）——#2007 白屏消失 ✓
点击进入游戏 → newLogin.jsp POST → 200 **22522B 票据**（sid/loginkey/svr/zn，与抓包同尺寸）✓
→ user/serverslist.swf 加载 → 选服页渲染（快速开始游戏/查看全部星球/快速进入）✓
点击快速开始 → socketProxy → facade WS↔TCP 隧道 → 115.159.104.40:8004 ✓
→ **AMF 加密指令双向交换**：客户端 10+ 条（getUserInscription/MaxInscription/getOneOffState/…），
  服务器回包 privileges/vipScore/isMember/rlevel（203B AMF3）✓ —— encrypt.pbj 加密层有效
→ 游戏世界完整渲染：场景/宠物/玩家角色/欢迎弹窗（in_game.png）✅✅✅
```

### 遗留
- **ECONNRESET 取证完成（第十三轮）**——见下。战斗场景验证被它卡住。

## 第十三轮（17:00–17:30）：socket 生命周期取证 —— RST 触发点锁定

### 现象（5+ 会话 100% 复现，跨 4 台服务器/3 个区服）
每次区服登录后 ~5s：**世界初始化命令批 → privileges 203B → 服务器立即 RST**。
服务器轮换：123.206.106.206:8003 / 115.159.104.40:8004,8008 / 115.159.197.100:8009 /
123.206.106.206:8000；区服：161 双刀星 / 267 特使星 / 302 海湾星（ZoneAutoConnect 动态选）。

### 区服网关协议（字节级还原，facade 隧道 tap + tunnel_capture.bin）
```
S->C  跨域策略 XML（Flash socket policy，to-ports 动态）
C->S  登录包 [len][seq=0][00][27][20][ffffffff][u16 len]"区服名"[u16]"u=352318440"[u16]"sid-UUID"
S->C  logOK（AMF3: lastLoginTime/_cmd/id/n）+ RedPoint_Update + nui(moba_1_104)
      + CE_23（区服聊天：一监/神魄121/卫士…）+ honorMsgDispatch ×N（玩家荣誉播报）
C->S  ★神秘包（headers 变体 00 00 00 4f / 31 b0 / 4f 09，~95% 跨会话静态，
       尾部 4B 变化；服务器对它的响应 = privileges 203B → 它是加密的特权查询）
C->S  世界初始化批 ×17（6ms 内突发）：getStartInfo/getCurrentTime/getUserClothes/
      14_2/61_6/61_7/61-8/80_1/61_1/81_2/61_5/2-6/getUserInscription/
      MaxInscriptionResponder_1/21_30/ASC221104_0/NC250430_panel/getOneOffState
      —— 方法名明文，body = AMF3 {data: ByteArray(23B 加密)}，跨会话密文会变（加密活着）
S->C  privileges（vipScore/vipLevel/isMember/rlevel/memberT…）
      → **~120ms 后 RST**（有时客户端先干净 close——16:44 会话）
```

### 分阶段重放结论（tools/replay_staged.mjs，Node 裸 TCP）
1. 过期票裸重放 → 服务器礼貌回"对不起，该区域不存在！"并优雅关闭——**包结构/时序无罪**。
2. 新票分阶段：只登录 → 连接健康存活（logOK+世界数据 6s+）；
   发神秘包 → privileges 回包正常，聊天继续流；
   **发第一条正式命令（getStartInfo）→ 连接被关**（clean FIN）。
3. 结论：**服务器拒绝加密命令批中的某个/某些包**——DefenseMsgSeq（encrypt.pbj/FlasCC）
   的加密状态或握手在我们客户端与服务端之间失配。这是最后一道门。

### 已排除
- 互踢/重复会话（干净单会话同样 RST；冷却 60s 无效）
- 隧道传输损坏（重放同样字节走裸 TCP 得到正常错误路径）
- 包时序（原时序重放不变）
- 被屏蔽端点（Ruffle SOCK_LINES 全量 dump：无第二次 connect 尝试、无 block 警告）

### 下一步（按性价比排序）
1. **真实客户端对比抓包**：用户启动 MY（它直连区服），pktmon/npf 抓它的区服 TCP 流，
   与我们的命令批逐字节 diff——直接暴露差异字节。
2. **encrypt.pbj 解剖**：library_socketserver1.swf 的 FlasCC 模块（com.adobe.flascc.CModule/
   DefenseMsgSeq/mmo.msgseq.encryptByteArray）——提取密钥流算法。
3. 神秘包 = 加密方法名的假设待证：解出它即可反推密钥流。


### 第六轮突破（15:20–15:40）：EI 之谜破案 + 白屏根因链闭合 ✅

**debug 日志多点采样揭示真相——EI 一直在工作**（此前 ei:0 是采样时机错觉）：
```
getCookie(game_auth_sid) => 成功读到注入 Cookie ✓✓✓
getQS(duoduoId) => null    ← loader 在要 URL 参数
getQS(username) => null
getQS(location) => null
getQS(via) => null
→ AutoLoginPage/init(text=null) → #2007 → 白屏
```

**根因链闭合**：loader 读到登录 Cookie（autoLogin=true）→ 跳过开始页直奔自动登录 →
但 AutoLoginPage 的展示文本来自 `loader_res~*.swf`（开始页资源）——**我们的 boot 从未
加载过 loader_res**（真实客户端 boot 第二步就拉它）→ 文本 null → 崩溃 → newLogin 永远不会发生。

**与真实客户端的关键分叉**：真实客户端带 Cookie 仍显示开始页（用户点了开始按钮——
CLICK_START_BTN 遥测）后才走 newLogin。我们跳过了开始页。

### 下一步实验序列（按此执行）
1. **getQS 参数供给测试**（最便宜）：game.html 的 getQS 桩对 `duoduoId/username/location/via`
   返回注入值（duoduoId=26394032, username=26394032, location=2[角色所在区], via=web），
   看 AutoLoginPage 是否渲染、newLogin 是否发出
2. **loader_res 缺失调查**：为什么真实 loader boot 第二步拉 loader_res 而我们的不拉——
   对比两轮 boot 的请求序列到分叉点为止的每一个差异
3. **newLogin 代发方案**（绕开 loader）：game.html 启动时自行 POST newLogin.jsp（token/account
   从注入 Cookie 解析），响应数据经 EI/全局变量喂给 loader
4. socket：<svr> 响应改写注入隧道（协议已全知）

## 第五轮补充（15:10–15:40）：newLogin 触发条件与下一步实验

- 门户（aola 主站/用户中心）都只是参数透传，**u/code 票据铸造在官方微端"安全管家"内部**（webpack chunk，未解出）或其私有 API——暂时绕开
- **决定性未解之谜**：带 Cookie 的 boot 全程零 EI 调用（T+3/6/12/20s 四点采样确认），无 Cookie 的 boot 有完整 EI（getQS/getCookie→null→showWebLogin）。已排除：EI 桩缺失（live 页面 stubs 全在）、RufflePlayer.config 完好
- **首选实验**：清掉 Ruffle 在 127.0.0.1:8700 的持久存储（IndexedDB/SharedObject——登录 SWF 的"记住密码"可能写过状态）后带 Cookie 重启，观察 EI 是否恢复——若恢复则 loader 流程分支依赖 SWF 本地存储状态
- **备选修复**（绕开触发条件）：game.html 启动时自己 POST newLogin.jsp（token/account 从注入 Cookie 解析，facade 已能透传）拿 sid/loginkey/svr；再把数据经 EI 桩喂给 loader；同时 AutoLoginPage 文本可由响应字段供给
- socket 动态分配：`<svr>` 列表即答案，facade 改写该响应把 host:port 指向 ws2tcp 隧道（隧道代码已就绪）

### 第十一轮（16:40–17:00）：ABC 解析器建成 + 触发方法锁定 ✅

**工具**：`tools/abc_parse.mjs`（ABC 常量池解析器：字符串索引/命名空间/多重名称，1151 字符串/1146 多重名称解析成功）

**锁定 newLogin 触发对**（mmo.user.login.Main 类，常量池邻居关系）：
- `getAutoLoginInfo` @234 —— 构造自动登录信息（_autoLoginInfo = ?duoduoId=X&loginTimestamp=Y）
- `doAutoLogin` @235 —— 执行自动登录
- 配套：`startPlay / loginByWeb / hasAccessInfo`
- **newLogin.jsp 字符串不在本模块**——URL 由 loader 域的 WebLoginUtil/WebLoginChecker 构造
  （loader_body.bin 常量池已见：`?duoduoId=`、`&loginTimestamp=`、`WebLoginUtil`）
- WebLogin 类字段：`_loginXml`（数据源）/`_userName`/`_charId`/`serversList`/`publicizeStr`

**下轮**：解析这两个方法的字节码（method_body 引用的 pushstring/callproperty）——
拿到 autoLoginInfo 的精确格式与目标 URL，然后：EI 桩直接供参 或 facade 代发。

### 第十轮（16:20–16:40）：user/login.swf 解剖（中期发现）

- ZWS 解压成功：/tmp/loginmod_body.bin（220KB，解压方法：SWF 头 4 字节长度 + props(5)+size(8) 转 lzma_alone → xz）
- 常量池关键符号：`checkHasLoginCookie` / `LOGIN_STATE_KEY`+`LoginStateKey`（Cookie 键常量，**值待 ABC 解析**）、
  `WebLogin` 类字段 `_loginXml`（**AutoLoginPage 的数据源 = newLogin.jsp 响应解析出的 XML**）、
  `_userName/_mySceneName/_charId/serversList/publicizeStr/waitTime`、
  `_autoLoginInfo`（?duoduoId=X&loginTimestamp=Y 构造器）、登录方式枚举（AOLA_NAME/DUO_DUO_HAO/MAILBOX/MOBILE/QQ/WEB）
- 协议链最终确认：normallogin → game_auth_sid(token) → **newLogin.jsp(POST token+account) → _loginXml → AutoLoginPage**
  → 角色查询 → 区服选择（<zn>）→ socket(<svr>)

### 第九轮（16:00–16:15）：token 直用验证成功 ✅ + 收口

**重大确认**：我们自己的登录 token 直接可用于票据交换——
`POST service-aola.100bt.com/newLogin.jsp` body=`isnickname=sso&content=src%3D%26from%3D&test=&token=<normallogin的token>&charId=0&wyToken=-1&account=<账号>`
→ 22.5KB 完整票据（新 sid + loginkey + svr + zn）。**票据链路 100% 复现，无任何阻塞**。

**又排除一项**：Cookie 明文形态（不编码直接注入）同样无效——newLogin 仍不触发。
（至此 Cookie 格式两形态、存储、EI、getQS 全部排除。）

**下轮第一刀（已磨好）**：解析 user/login.swf 的 ABC 字节码——
`checkHasLoginCookie` 的判定逻辑 + `newLogin` POST 的触发分支 + `_autoLoginInfo` 的构造。
解压件已备好：/tmp/loginmod_body.bin（220KB 解压体）。module 的常量池已见：
`checkHasLoginCookie / LOGIN_STATE_KEY / WebLoginChecker / _autoLoginInfo / gotoWebLogin / isWebLogin / loginSuccessAndRemoveCookie`。

### 第八轮（15:45–16:00）：boot 序列对齐确认 + 排除法收口

**最新 boot 序列已与真实客户端几乎一致**（cache 全命中）：
```
start.swf → start.xml → loader.swf → difference.xml → 机器上报(81B)
→ loader_res ✓ → versiondata ✓ → config → socketserver1 ✓ → CheckAlive ✓×2
→ socketserver/util/materialdata/interfaces/houseinterfaces/uiskin/common
→ common_res_dialog/membericon → materialservice/avatarservice → socketclient
→ font → **user/login.swf** ✓ → play.swf → query_role_info(366B ✓)
→ config/config → petdataservice → sounds...
```
唯一差异：真实客户端在 user/login 后 POST **newLogin.jsp**，我们没有。

**已排除**：Cookie 编码形态（解码明文同样无效）、SWF 本地存储状态、EI 桩缺失、
getQS 参数缺失（已注入）、XML 响应污染（已修）。

**下轮首选**：解剖 **user/login.swf**（很小）——showAutoLoginPage 的文本来源 +
newLogin POST 的触发条件与参数构造，全部在其常量池/字节码里。这是最后一道门。

### 第七轮（15:20–15:50）：#1088 根因修复 ✅ + 白屏最后一环定位

**#1088 破案**：官方对 .jsp 回 text/html content-type，facade 的 mirror-inject 注入把
`<script>` 标签插进了 **XML 响应体前面**（`<script...><r>GUID</r>`）→ SWF 解析 XML 即炸。
修复：只对含 `<html>`/`<!doctype html` 的真 HTML 文档注入。修复后 #1088 消失 ✓

**EI 全链确认工作**（debug 采样）：getCookie(game_auth_sid) 读到注入值 ✓、getQS 四参数
（duoduoId/username/location/via）注入值生效 ✓、机器上报/角色查询正常 ✓

**最后阻断点（唯一）**：`AutoLoginPage/init` text=null 仍在。关键差异对比：
- 真实 boot 第 3 步就拉 **loader_res**（开始页/登录页 UI 资源）+ **versiondata**（全量版本库）
- 我们的 boot 从不拉这两个 → AutoLoginPage 的文本资源缺失 → text=null 崩溃
- 我们却仍能拉到带版本的模块（版本来自 start.xml 而非 versiondata——部分路径可用）
- 假设：loader 显示开始页/AutoLoginPage 前需要 loader_res+versiondata 就位，取版本/资源
  的某个环节在我们环境下静默失败

**下一轮第一步**：对比我们 boot 与真实 boot 在 difference.xml 之后的逐请求差异，找出
loader 决定不拉 loader_res/versiondata 的分支条件；或直接预置这两个文件到缓存并研究
loader 的版本解析路径。

## 第四轮战报（14:40–15:10，票据协议完全破解）✅✅✅

### 真实客户端对比抓包完成（CDP 9222 监听器，响应体捕获）
真实流程：boot（含 loader_res/versiondata/socketserver1 三个我们没拉的模块）→ user/login 模块
→ **POST service-aola.100bt.com/newLogin.jsp** `{isnickname=sso, content=src=&from=, test=,
token=<登录token>, charId=0, wyToken=-1, account=<账号>}` → 350B 票据响应 → query_role_info
（duoduoId=26394032）→ 皮肤 → socket

### 票据响应已用自建会话完整复现 ✅（docs/spike/newlogin_resp_real.xml，22.5KB）
```
<c>ok</c><state>0</state><sid>UUID</sid><d>26394032</d><u>352318440</u>
<loginkey>835bab...</loginkey><time>毫秒时间戳</time>
<svr>全部服务器列表 host:port:type:域（动态 socket 端点的真正来源）</svr>
<zn>281 个区服清单</zn>
```
- 端点在 **service 网关**（不是 login-aola；之前测错域名才一路 invalid）
- `<u>` = 角色ID、`<loginkey>` = socket 登录密钥、`<svr>` = 动态服务器分配
- 实测当前 socket：123.206.106.206:8002（来自 <svr> 列表，按区服选择）

### 修复路径（已明确，待实施）
1. 我们的 loader 未发 newLogin.jsp——需确认其触发条件（token+account 的获取路径：
   真实客户端由启动器注入 Cookie/桥接；我们的 Cookie 注入等价物已就位）
2. facade 增加 newLogin.jsp 响应缓存/改写能力（<svr> 的 socket 地址改写到 ws2tcp 隧道）
3. AutoLoginPage 的 null 文本大概率来自 newLogin 未执行（无 sid/服务器数据可显示）——
   打通 newLogin 后自然解决
4. socketProxy 静态配置作废，改由 <svr> 响应改写动态注入隧道地址

### 监听工具（长期可用）
- `tools/monitor_real.ps1`：CDP 9222 全流量 + 响应体（带断线重连；UTF-8 BOM 必须）
- `tools/monitor_sockets.ps1`：原始 TCP 连接采样
- `tools/screen.ps1` / `focus.ps1` / `windows.ps1`：原生 UI 视觉自动化三件套

## 第三轮战报（13:45–14:35，进入游戏装配阶段）

### 里程碑：登录态生效，游戏以玩家身份装配 ✅
- **Cookie 注入 + duoduoId 自动补丁**（facade 从浏览器 Cookie 解析 duoduoId=26394032 回填请求体）
- `query_role_info` → 366B 角色数据返回，**游戏开始加载玩家角色皮肤**（skinview ID 与角色徽标一一对应）
- 模块装配 236+ 请求：fbteam/dailytasknew/shareservice/praiseandfeedback 等服务模块全部拉取
- ego-browser（ego lite）接替 IAB 成为标准自动化测试通道

### 当前阻断点：AutoLoginPage 崩溃 → 白屏
- `mmo.user.login::AutoLoginPage/init()` 里 `TextField.text = null` → Error #2007 → 构造中断 → 白屏
- 前置错误 #1088（XML root 后多余标记）在其前 ~20s 触发，来源待定位（已排除：config.xml/difference.xml/
  机器上报响应均结构完好；LOAD_AFTER_PAGE 官方恒回 0B 属正常上报，真实客户端不解析它）
- AutoLoginPage 预期展示的文本（服务器名/公告/GUID?）为 null——需定位其数据源

### 工具链变更
- **ego lite 已安装**（`C:\Users\z2351\.local\share\ego\active_version_dir\ego-browser.exe`，PATH 需新终端）
- 任务空间：`aola-ruffle-login`（p1 为游戏页；cookie 罐随 profile `.edgeprofile-*` 持久）
- ego-browser 用法：脚本写 .mjs 文件 + `-e "await import('file:///...')"`（中文/引号防坑）

### 下一步（按优先级）
1. **AutoLoginPage null 文本定位**：对其 init 的 TextField 赋值做 AVM2 级追踪，或对照真实客户端
   的自动登录页文本来源（公告/服务器名接口）
2. **socket 隧道实联**：AutoLoginPage 修复后进入选服/选人 → Socket.connect(115.159.104.40:8004) → 验证 ws2tcp
3. **encrypt.pbj/FlasCC** 加密验证
4. 启动参数固化：把"Cookie 注入 + duoduoId 补丁"流程写成标准启动脚本

## 第二轮战报（13:00–14:10，登录链路打通）

## 已交付的代码

| 文件 | 说明 |
|---|---|
| `tools/serve.mjs` | 零依赖 Node 镜像代理服务器（8700 端口）：静态/镜像/回源缓存/~版本后缀剥离/网关文本改写/WS↔TCP 隧道/状态上报 |
| `web/game.html` | Ruffle 宿主页：网络重写层（fetch+XHR 双补丁）、EI 宿主桩、日志面板、状态上报器 |
| `web/ruffle/` | Ruffle selfhosted nightly 2026-10-31（npm 通道下载，GitHub 直连被墙） |
| `PLAN.md` | 开发规划（本轮执行依据） |
| `docs/spike/avm2_report.json` | Ruffle AVM2 API 覆盖报告（下载失败，待补） |

## 实测结论（按引导链顺序）

1. **start.swf 装载并执行** ✅ Ruffle 0.8.0-nightly 成功加载引导器（SWF v18/AS3/960×560），
   AVM2 执行、wgpu-webgl 渲染、字体回退（宋体/Times → Noto Sans）、MemoryWatch 均正常。
2. **相对路径解析坑（已修）**：SWF 相对 URL 需显式 `base`（`player.load({url, base})`），
   否则解析到页面根 → XML 解析 #1088 崩溃。**这是 P0 第一课**。
3. **资源镜像链全通** ✅ start.xml → loader.swf → difference.xml 经镜像回源缓存全部 200。
4. **网关改写** ✅ difference.xml 内 `//service-aola.100bt.com/` 等协议相对 URL 在服务端改写为
   绝对同源 `http://127.0.0.1:8700/mirror/<host>/`（根相对路径会导致 loader 域名逻辑静默失败，必须绝对 URL）。
5. **HTTP 网关往返** ✅ `POST newRegister.jsp`（op=LOAD_START_PAGE 机器上报）经 facade 到官方
   服务器 200，返回 `<r><i>GUID</i><s>unknown</s><t>日期</t></r>` 被正常接收。UA 无关（真实 UA 也返回 unknown）。
6. **loader.swf 已接管执行** ✅ 出现第二轮 start.xml/loader/difference/POST —— 即 spike 文档
   所述"loadBytes 进 ApplicationDomain.currentDomain 替换自己"，loader 自身初始化开始。
7. **WS↔TCP 隧道已实现**（代码就绪，未被走到——loader 尚未尝试 Socket.connect）。

## 当前阻断点（P0 剩余）—— 已于 12:41 破案并部分推进

**根因定罪：`allowScriptAccess` 配置类型错误。** glue 把配置值原样传给 wasm
（`setAllowScriptAccess(A){...setAllowScriptAccess(this.__wbg_ptr,A)}`），字符串 `"always"`
经 ToInt32 变 NaN→0→false，**ExternalInterface 被静默禁用**。改为布尔 `true` 后：
- loader 立即调用 `showWebLogin(<完整登录URL>)`（含机器 GUID、redirect 回跳、action=startgame）
- 停滞点消失，接力棒交给页面层 —— 与常量池分析完全吻合

**P0-4 登录桥已实现**（server + game.html + mirror-inject.js）：
- showWebLogin 渲染 iframe 承载官方登录页（facade 代理 + 注入重写补丁）
- 镜像 HTML 注入 `<base>` 级重写：官方域名 / 根相对路径 / CSS url() / location 赋值 全部改写到
  `/mirror/<host>/`；运行时动态构造的根相对路径用 Referer 推导回退兜底
- 登录回跳两种路径都覆盖：官方页导航顶层（直接带票重载）/ 只导航 iframe（postMessage 换票）
- getQS/getCookie 改为真实实现（解析 location.search / document.cookie）

实测（headless Edge v=12）：登录页 login.html + 全部 CSS/JS（含 index.js 经 Referer 回退）200 加载，
无 404。**剩余动作：用户在窗口内完成真实登录 → 票据回跳 → loader 读取 u/code → 进游戏。**

## 其他关键发现（排查过程）

- **可见性暂停**：`document.hidden=true` 时 Ruffle 完全暂停 SWF 循环（selfhosted 默认
  `backgroundExecutionMode: "mainThread"` 未见生效）——此前所有"随机卡死"皆此伪影。
  自动化测试用 headless Edge（恒 visible 全速）+ `/report` 落盘。
- **音频自动播放门控**：首次用户手势前 AudioContext 挂起，start.swf 启动音不完成会延迟引导
  （点击画布后链路立即走通，两次复现）。产品化时宿主层需主动解锁音频。
- 机器上报响应 `<s>unknown</s>` 为正常值（直连官方+真实 UA 同样返回），排除。

## 运行环境备忘

- Node：`E:\node\version\v24.21.0\node.exe`（不在 PATH）
- 服务器启动：`node tools/serve.mjs 8700`，游戏页 `http://127.0.0.1:8700/game`
- 旧 spike（另一会话产出，未动）：`D:\temp\gpt\aola-ruffle-spike`（8642 端口进程为其遗留）
- 测试用 Edge profile：`ruffle-client/.edgeprofile`（可随时删除）
- IAB 测试标签：可见性暂停问题——自动化测试别用 IAB 前台判定，以 `/report` 落盘为准
