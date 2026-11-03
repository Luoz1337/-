# 无广课程表

一个无广告手机课表。周课表、日程待办、教务系统导入、空教室、校历等等。

名字就是需求，不要开屏广告，不要"猜你喜欢"，不要几把一堆推送，打开就是课表。


<p align="center">
  <img src="docs/screenshots/timetable.png" width="240" alt="课表">
  <img src="docs/screenshots/agenda.png" width="240" alt="日程">
  <img src="docs/screenshots/tools.png" width="240" alt="工具">
</p>

## 内容

导入本学期的课之后按周推进。

- 周课表 20 周（可在学期设置里改成 16–24），横向周次条、左右滑动切周、一键回本周，今天高亮、当前时间一条红线，时间重叠的课自动分成两栏，点空白格可以直接加课。
- 课程字段有课程名、老师、地点、星期、节次、周次（单双周和任意周次组合都行）、颜色、备注，加的时候实时提示冲突。
- 日程页是今天的课程时间轴（含晚自习）+ 待办清单 + 未来六天的课。
- 工具页：空教室推算、校历（教学周 + 有课标记）、分享码、CSV / ICS / JSON 导出和备份恢复。
- 还有深色模式、上课提醒（Android 系统通知；网页端走浏览器通知）、PWA 离线可用。数据全部在本地 localStorage，键名 `supertable.state.v1`。

<p align="center">
  <img src="docs/screenshots/import-preview.png" width="240" alt="导入预览">
  <img src="docs/screenshots/calendar.png" width="240" alt="校历">
  <img src="docs/screenshots/dark.png" width="240" alt="深色模式">
</p>



## 武汉纺织大学外经贸学院导入（本人学校已适配）

学校的正方 V9 我直接做成了预设，选学校 + 学号密码就能导：

| 项目 | 值 |
| --- | --- |
| 教务系统 | 正方 V9 教学管理信息服务平台 |
| 地址 | `http://jw.whcibe.com` |
| 登录页 | `/xtgl/login_slogin.html`（RSA + Base64 公钥） |
| 课表接口 | `/kbcx/xskbcx_cxXsgrkb.html?gnmkdm=N2151` |
| 网络 | 公网能访问，不用校园网 |

校历和作息也按学校内置了：

- 第 1 周周一 = 2026-09-07（2026-09-10 周四进校），所以 2026-10-21 是第 7 周。
- 一天 10 节，每节 45 分钟：

| 节次 | 时间 | 节次 | 时间 |
| --- | --- | --- | --- |
| 第 1 节 | 08:15 - 09:00 | 第 6 节 | 14:20 - 15:05 |
| 第 2 节 | 09:05 - 09:50 | 第 7 节 | 15:25 - 16:10 |
| 第 3 节 | 10:10 - 10:55 | 第 8 节 | 16:15 - 17:00 |
| 第 4 节 | 11:00 - 11:45 | 第 9 节 | 17:45 - 18:30 |
| 第 5 节 | 13:30 - 14:15 | 第 10 节 | 18:35 - 19:20 |

- 晚自习默认周一到周四 19:30 - 21:30，名字和显示内容在「我的 → 学期设置」里能改。课表上和上课时间重了显示课程，没重合才显示晚自习。


如果哪天学校升级把接口改了，在导入向导里换成「粘贴课表网页」：登录教务系统，`Ctrl+U` 看源码，全选复制粘进去就能解析；也可以在开发者工具里找到课表接口返回的 JSON，直接粘贴导入。

<p align="center">
  <img src="docs/screenshots/import-school.png" width="260" alt="学校预设">
</p>

## 怎么把课导进来

入口有三个：课表页右上角的 ⤒、「我的 → 导入课表」、「工具 → 导入课表」。

**1. 网页登录导入（最推荐）**

App 里点「网页登录导入」，用内置浏览器打开自己学校的教务系统，你自己输学号密码登录（或扫码），密码不经过 App 保存。进到课表查询页，点页面下面的「导入当前课表」就行。App 先读当前页面已经渲染出来的表格，页面结构特殊的话，会拿 WebView 的登录 Cookie 调学校课表接口兜底。导入后先预览，再选合并或覆盖。

电脑上的网页版没有内置浏览器，用「账号导入」，或者登录后复制源码用「粘贴课表网页」。

**2. 正方账号导入**

| 版本 | 地址示例 | 说明 |
| --- | --- | --- |
| 新版（jwglxt / V9） | `http://jw.whcibe.com` | 自动取 RSA 公钥（Base64 或十六进制）加密密码，登录后调 `kbcx/xskbcx_cxXsgrkb.html`，兼容 `sjkList` 实践课 |
| 旧版（ASP.NET） | `https://jw.example.edu.cn` | 解析 `__VIEWSTATE` 登录，抓 `xskbcx.aspx`，支持验证码图片 |

流程：选学校（或填系统类型和地址）→ 学号、密码、学年学期 → 开始导入 → 要验证码就输图片验证码 → 预览 → 合并或覆盖。

各校部署差别很大，接口路径、要不要教学评价、限不限校园网、有没有双因素，都可能不一样。自动导入失败时，点错误提示下面的「改用粘贴课表网页」，或者自己登录后复制源码。适配器是拿不到学校账号的情况下写的，以你们学校实际系统为准。

**3. 自定义 JSON 接口**

给一个返回 JSON 的 URL（Cookie 可选），下面两种形状都认，也能直接写中文键名 `课程名称 / 教师 / 地点 / 星期 / 节次 / 周次`：

```json
{ "kbList": [ { "kcmc": "高等数学", "xm": "张伟", "cdmc": "教一101",
  "xqj": "1", "jcs": "1-2节", "zcd": "1-16周" } ] }
```

```json
{ "data": [ { "courseName": "大学物理", "teacherName": "刘洋",
  "classroomName": "理科楼401", "dayOfWeek": 2,
  "classTime": "5-6节", "weekDescription": "1-14周" } ] }
```

**4. 兜底：粘贴 / 文件 / 分享码**

- 粘贴课表网页：登录教务系统，课表页 `Ctrl+U`，全选复制粘贴，解析器认「星期 × 节次」表格，也认列表式表格。
- CSV：表头 `课程名,教师,教室,星期,节次,周次,备注`。星期写 `周一 / 星期一 / 1` 都行，节次 `1-2节` 或 `第1-2节`，周次 `1-16周`、`1-15周(单)`、`1-8,10-16周`。
- ICS：本应用导出的日历文件，带周次和节次描述。
- 分享码：`ST1.` 开头的一串，同学在「分享码导入」里粘一下就好，不含账号信息。


<p align="center">
  <img src="docs/screenshots/android.png" width="260" alt="Android App">
</p>


编译：

```powershell
# 需要 JDK 17 + Android SDK（platforms;android-34、build-tools;34.0.0）
cd android
$env:JAVA_HOME = "C:\Program Files\Java\jdk-17"
$env:ANDROID_SDK_ROOT = "E:\AndroidSdk"
powershell -ExecutionPolicy Bypass -File .\build.ps1
```


## 数据在哪

- 课表、待办、设置都在浏览器 `localStorage`（`supertable.state.v1`），不往任何第三方服务器送。
- 教务账号密码只在一次导入请求里用，存在内存会话中，**不写磁盘、不写日志**，会话 10 分钟过期。
- 导入服务只向你自己填的教务地址发请求，学校系统的使用条款自己确认。
- 公共电脑上用完，「我的 → 清空课表」再把站点数据清一下。

## 代码

```
super-timetable-github/
├── index.html                 单页应用外壳
├── css/style.css              全部样式（移动优先 + 深色）
├── js/
│   ├── app.js                 入口：路由、顶栏、底部导航、提醒
│   ├── schedule.js            周次 / 节次 / 日期 / 冲突 / 布局（纯函数）
│   ├── importers.js           JSON / CSV / ICS / 分享码的解析与导出（纯函数）
│   ├── zf-html.js             教务课表网页解析（DOMParser）
│   ├── store.js               localStorage 状态和业务动作
│   ├── ui.js                  图标、弹层、确认框、Toast
│   ├── install.js             PWA 安装支持
│   └── views/                 timetable / detail / editor / agenda / tools / me / import
├── server/
│   ├── index.js               静态站点 + /api/import 代理
│   ├── api.js                 会话管理、适配器调度
│   ├── adapters/              zfsoft / zfsoft-old / custom
│   └── lib/                   Cookie 罐、RSA 公钥加密（Base64 / Hex 都兼容）
├── desktop/                   Windows 启动器、图标、快捷方式脚本
├── test/                      单元测试（Node 内置 test runner）
├── scripts/                   CDP 端到端脚本（开发用）
└── manifest.webmanifest, sw.js, icons/
```

纯函数都在 `schedule.js` / `importers.js` 里，UI 只负责渲染，所以测试好写。

## 开发 & 测试

```bash
npm test                          # 25 个单元测试：周次、节次、冲突、车道布局、JSON/CSV/ICS/分享码、RSA（Hex/Base64）、导入会话
node scripts/check-modules.mjs    # 检查前端模块能不能正确链接
```

端到端用 CDP 驱动真实页面，服务先起好，Edge/Chrome 带 `--remote-debugging-port=9333` 启动：

```bash
node scripts/e2e.mjs      # 加课 / 改课 / 删课、学期设置、深色模式、工具弹层、CSV 导入、切周
node scripts/ui-shots.mjs # 生成各页面截图
```

## 一些问题

- 教务适配器是尽力而为的：不同学校、不同年份的系统版本都可能不一样，不保证开箱即用。失败就用粘贴网页 / CSV / 分享码。
- 武汉纺织大学外经贸学院这条我实测了登录，课表抓取还是要用本人账号走一遍；学校要是改了接口或者加了教学评价，导入向导里换粘贴网页。
- 没有成绩查询、考场查询、校园资讯这些要额外接口的东西，也没做桌面小组件。
- 空教室是按已导入的课推出来的，不代表学校全部教室的实时占用。
- 分享码就是明文 Base64，只适合同学之间传课表，别往里塞敏感信息。
- 和「超级课程表」之类的商业 App 没有任何关系，没用它们的商标、图标和代码。

## License

MIT。示例数据和文案随便改。

Built by Luoz1337
