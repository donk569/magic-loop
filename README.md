# 魔音循环（网页版）

一段停不下来的循环音频。打开网页就尝试自动播放，播完自动循环。
纯静态页面，无依赖、无框架、无后端、不采集任何数据。

## 目录结构

```text
magic-loop-web/
├── index.html          # 页面结构 + <audio> 元素
├── style.css           # 深紫底 + 橙黄波形 + 响应式布局
├── script.js           # 自动播放 / 循环 / 状态机
├── assets/
│   └── prank.mp3       # 实际播放的音频（当前是占位音，见下文）
└── README.md
```

## 本地运行

必须用 HTTP 打开，不要直接双击 `index.html`（`file://` 下部分浏览器会拒绝加载媒体或行为不一致）：

```bash
cd magic-loop-web
python -m http.server 8000
# 浏览器打开 http://127.0.0.1:8000
```

或者：

```bash
npx serve .
```

> 本机有系统代理时，`curl 127.0.0.1` 会被代理拦成 502，加 `--noproxy '*'` 即可；浏览器访问本机地址不受影响。

## 部署到 Cloudflare Pages

### 方式一：控制台直接上传（最快）

1. 打开 <https://dash.cloudflare.com> → Workers & Pages → Create → Pages → Upload assets
2. 把 `magic-loop-web` 里的 **全部文件**（`index.html`、`style.css`、`script.js`、`assets/`）拖进去
3. 部署后得到 `https://<项目名>.pages.dev`

**要点**：`index.html` 必须在站点根目录，`assets/prank.mp3` 必须一起上传，否则页面会显示"音频加载失败"。

### 方式二：命令行（wrangler）

```bash
npm i -g wrangler
wrangler login                       # 或设置 CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID
cd magic-loop-web
wrangler pages deploy . --project-name=magic-loop
```

首次会自动创建项目并输出 `https://magic-loop.pages.dev` 之类的地址。

## 自动播放：先说清楚会发生什么

浏览器的自动播放策略不是网页能绕过的：

| 场景 | 实际表现 |
| --- | --- |
| 桌面 Chrome/Edge（用户经常访问该站点、有交互历史） | 通常会直接出声 |
| 桌面 Chrome 首次访问、无任何交互 | 多数会被拦截，页面显示"当前浏览器限制了自动播放" |
| **iPhone Safari** | 基本都会拦截。静音自动播放允许，但静音就等于没声音，不符合本项目的恶搞目的 |
| **Android Chrome** | 视站点参与度（Media Engagement Index）而定，首次访问通常被拦截 |

项目按需求处理：**不假装播放成功**、**不弹窗反复索权**、**不做隐藏播放器或静音起播再偷开声音**、
**不提供手动播放按钮**。被拦截时只显示真实提示。这是需求 2.4 / 5.6 明确要求的行为。

如果需要"被拦截后也能出声"，最简单的做法是加一个点击区域（点击后 `audio.play()`），
但这与需求"不提供手动启动按钮"冲突，所以默认没有做。

## 换音频

把自己的 mp3 命名为 `prank.mp3` 覆盖 `assets/prank.mp3` 即可，**不需要改任何代码**。

- 当前 `assets/prank.mp3` 就是实际要用的那段录音：**15.8 秒、立体声、128 kbps、约 248 KB**
  （由用户提供的 320 kbps 原始录音转码而来，体积压掉一半以上，移动端加载更快）。
- 替换后如果线上仍是旧声音，是浏览器/CDN 缓存，给文件名加版本号（如 `prank-v2.mp3`）
  并同步改 `index.html` 里的 `src` 最省事。
- 音频体积建议控制在 1 MB 以内，移动端流量友好、加载更快。

## 实现要点

1. **唯一播放实例**：全程只使用 `index.html` 里的那一个 `<audio>`，不 `new Audio()`，
   所以不可能出现声音叠加。脚本里还会把 `audio.loop` 显式设为 `true`（需求 5.3）。
2. **状态只信真实事件**：`play()` 的 Promise resolve 并不代表已经出声，
   页面文案由 `playing` / `waiting` / `pause` / `ended` / `error` 事件驱动，杜绝"假播放成功"。
3. **波形只在真正播放时动**：`.wave.is-live .bar` 才 `animation-play-state: running`，
   暂停/缓冲/被拦截时柱子静止且变暗。
4. **错误分层提示**：`MEDIA_ERR_*` 四个错误码分别给出人话解释（文件不存在 / 格式不支持 / 解码失败 / 网络中断）。
   脚本在绑定监听后会补查一次 `audio.error`，覆盖"错误发生在脚本执行之前"的情况。
5. **不做的事**：不加按钮、不隐藏播放器、不循环重试、不劫持返回键、不写 localStorage。

## 已验证 / 未验证

**已实测（Chromium 无头，390×844 移动视口，本地 HTTP）**

| 场景 | 结果 |
| --- | --- |
| 资源可达性 | `index.html` / `style.css` / `script.js` 均 200；`assets/prank.mp3` 200 + `audio/mpeg` |
| 自动播放被拦截 | 状态栏"当前浏览器限制了自动播放"（warn 色），波形静止，`paused=true`，无 JS 报错 |
| 自动播放放行（`--autoplay-policy=no-user-gesture-required`） | 状态"正在循环播放"（ok 色），波形运行，`paused=false`，`currentTime` 正常推进 |
| 循环 | 19 秒后 `currentTime=2.85s`（总长 15.79s）→ 已自然回绕，且 `audio` 元素数量仍为 1 |
| 音频文件缺失 | 状态"音频加载失败"（error 色）+ 提示"找不到音频文件，或这个浏览器不支持 MP3" |
| 控制台 | 无 error、无 pageerror、无失败请求 |

**未验证（不能算已通过）**

- iPhone Safari / Android Chrome **真机**浏览器测试
- Cloudflare Pages 线上环境（HTTPS、CDN 缓存行为）
- 真机听感：mp3 循环接缝、音量

## 已知限制

1. **被拦截后无法自动恢复**：iOS / 安卓首次访问基本都会被拦，页面只提示不重试。刷新页面会重新尝试一次。
2. **切后台/锁屏不保证播放**：移动端浏览器会在切后台时暂停甚至释放媒体，项目不做任何保活处理（需求 2.4 明确不承诺）。
3. **MP3 循环点可能有极轻微缝隙**：取决于编码器填充，网页侧无法完全消除；要求绝对无缝需换 `.wav`/`.ogg`（体积会变大）。
4. **不支持拖动/无控制条**：`<audio>` 不加 `controls`，页面不提供播放器 UI。
5. **自动播放策略随时可能变**：Chrome 的 Media Engagement Index、iOS 的低电量模式都会影响结果，验收标准里的"能够自动播放"依赖具体设备和用户历史。
