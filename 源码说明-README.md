# 小杜 · 完整源码与迁移说明

这份目录就是线上跑的全部前端代码，原样复制到任何静态服务器上都能 100% 还原现在的样子（界面、功能完全一致）。

---

## 一、文件清单

| 文件 / 目录 | 作用 | 能不能删 |
|---|---|---|
| `index.html` | **整个应用**（约 1.3 MB，前端代码、样式、逻辑全在这一个文件里） | 不能删 |
| `sw.js` | Service Worker：离线缓存 + 消息通知 | 不能删 |
| `manifest.webmanifest` | 让浏览器"添加到主屏幕"时显示的名称/图标/颜色 | 不能删 |
| `version.json` | 版本号，用来让用户自动更新到新版本 | 不能删 |
| `icons/` | 应用图标、默认头像 | 不能删 |
| `apk/` | 打包好的安卓安装包，供用户下载 | 可以不放 |
| `download/` | 下载引导页 | 可以不放 |
| `.nojekyll` | GitHub Pages 专用（防止忽略下划线文件） | 其它服务器可删 |

**注意：`index.html` 是全部代码，改任何功能都在这一个文件里改。没有后端源码，后端在 Supabase（见第五节）。**

---

## 二、换一台服务器怎么部署（前端）

任意静态网站托管都行，不需要数据库、不需要 Node、不需要构建（没有 npm install，没有打包步骤）。

**做法一：GitHub Pages（现在用的）**
1. 新建仓库，把本目录全部文件传上去
2. Settings → Pages → Source 选 `main` 分支 → 保存
3. 等 1 分钟，访问 `https://你的用户名.github.io/仓库名/`

**做法二：任何虚拟主机 / 宝塔 / 服务器**
1. 把文件上传到网站根目录（如 `/www/wwwroot/你的域名`）
2. Nginx 配置里加一句（必须是 HTTPS，否则通知、麦克风、摄像头都不能用）：
   ```nginx
   location / { try_files $uri $uri/ /index.html; }
   ```
3. 用 HTTPS 域名访问

**做法三：Cloudflare Pages / Vercel / Netlify**
直接拖文件夹上传，框架选 "None / 静态"，一步到位。

---

## 三、迁移时必须改的地方（很重要）

整份代码里写死了当前后端地址和公钥，一共 **4 处网址 + 2 处公钥**（都在 `index.html` 里）：

搜索 `dxibubacwhdsibiggqgg.supabase.co`，替换成你自己的 Supabase 项目地址（4 处）；
搜索 `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`，替换成你的 anon key（2 处）。

不改这两项，换了服务器也还是连旧后端，数据照旧；只有你想连新后端时才需要改。

**版本号三处必须同步改（每次改完代码都要改，否则用户看不到新版本）：**
1. `index.html` 里的 `<meta name="lg-build" content="1794814600">`
2. `version.json` 里的 `build`
3. `sw.js` 里的 `const CACHE = 'xiaodu-v39'`（把 v39 往后加 1）

数字随便写，只要比上一版大即可。

---

## 四、安卓 App（APK）怎么来的

`apk/` 里是已经打好的包，本质是"套壳 WebView"，里面加载的就是上面这个网址。想让 App 指向新服务器，需要重新打一次包（把壳里加载的网址改成新域名），打包工具任选：Android Studio（WebView 项目）或 Median / WebViewGold 这类在线打包。

想彻底解决安卓返回手势卡住的问题，需要在这个壳里加原生返回处理，这部分属于壳的代码，不在本目录里。

---

## 五、后端清单（Supabase）

后端不是代码，是 Supabase 云项目（数据库 + 账号 + 文件存储）。**换前端服务器不影响后端，数据不会丢。**

如果哪天要连新的 Supabase 项目，需要把这些对象建好（否则功能会缺）：

**数据表：** `profiles`、`chats`、`chat_members`、`messages`、`moments`、`moment_likes`、`moment_comments`、`call_signals`、`blocked`、`friend_requests`、`group_requests`、`app_config`、`ai_config`

**存储桶：** `media`（聊天图片/视频/语音）、`site`（应用图标等公开资源）

**必须存在的函数（RPC，共 47 个）：**
admin_delete_comment、admin_delete_moment、admin_delete_user、admin_disband_group、admin_list_groups、admin_list_users、admin_rename_group、admin_set_app_config、admin_set_disabled、admin_stats、admin_toggle_pin、admin_update_profile、block_user、bootstrap、cancel_account_deletion、clear_call_signals、create_group、create_moment、create_moment_ext、delete_message、delete_moment、get_ai_config、get_app_config、get_messages、group_add_members、group_dissolve、group_leave、list_blocked、list_group_requests、list_moments、list_my_moments、mark_read、open_direct、purge_deleted_accounts、recall_message、remove_friend、request_account_deletion、request_join_group、respond_group_request、respond_request、search_group、search_user、send_friend_message、send_message、set_ai_config、set_friend_remark、set_join_mode、set_moment_visibility、set_privacy、toggle_moment_like、touch_presence、unblock_user

（这些函数的定义在 Supabase 后台的 Database → Functions 里，可以在那里逐个复制导出备份。建议你现在就去后台把每个函数点开、复制成 `.sql` 文件存起来，这是唯一还没备份的部分。）

**安全提醒：** 前端只能放 anon key（公开密钥）。`service_role` 这个私钥绝对不能出现在前端文件里。

---

## 六、免费额度（别踩坑）

| 项目 | 免费额度 | 大约能撑多久 |
|---|---|---|
| 存储（图片/视频/语音） | 1 GB | 图片约 2 万张，视频约 100 分钟 |
| 数据库 | 500 MB | 纯文字消息很多很多 |
| 带宽 | 5 GB / 月 | 够几十人日常聊天 |

满了会传不上文件，届时要么清理旧内容，要么升级（约 $25/月）。

---

## 七、日常备份建议

1. 这份源码压缩包**存一份到网盘/电脑**，不要只留在服务器上
2. Supabase 后台 → Database → Backups，每周手动导出一次数据
3. 上面第五节列的函数，导出成 SQL 文件一起存着
