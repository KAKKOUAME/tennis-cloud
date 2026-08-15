# 🎾 网球技术问答投稿台（云端版）

面向小红书网球博客的**云端投稿 + 博主逐条回复**工具。客户扫码进入、做一道网球小测验、提交文字/图片/短视频；博主在后台逐条回复，回复后自动生成**匿名问答卡片**展示在首页；新投稿实时推送提醒，**管理员离线也能收到**。

纯 Node.js 实现，**零 npm 依赖**，单文件后端 + 静态前端，可一键部署到任意云服务器 / VPS / 容器平台。

## 功能对照（需求 → 实现）
| 需求 | 实现 |
|---|---|
| ① 云端部署、可网络访问 | `server.js` 提供 HTTP 服务；`Dockerfile` 一键上云；或 `node server.js` 跑在任意主机 |
| ② 免注册，做题验证进入 | `/api/quiz` 随机出题（热门选手 / 四大满贯 / 用品品牌，低难度），服务端校验答案才放行 |
| ③ 内容填写与提交 | 昵称 + 问题类型（技术/战术）+ 细分方向（底线/中场/网前 或 单打/双打）+ 图片/视频上传 + 文字描述 |
| ③(6) 新投稿推送提醒（离线必达） | 提交即向 **ntfy.sh** 发消息；ntfy 服务端暂存，管理员手机上线后送达（Store-and-Forward） |
| ④ 后台回复 + 首页卡片 | 管理员后台回复（文字 + 示范图），回复后自动生成匿名卡片；所有访客可翻阅，支持隐藏/删除 |
| 附：扫码入口 | 页面内置**纯 JS 二维码**（基于 qrcode-generator），编码当前访问地址，博主可发小红书/朋友圈 |

## 本地运行
```bash
cd tennis-cloud
node server.js            # 打开 http://localhost:3000
```
首次运行自动创建 `data/db.json` 存储投稿。

## 配置（环境变量，见 `.env.example`）
| 变量 | 说明 |
|---|---|
| `PORT` | 监听端口（默认 3000） |
| `DAILY_LIMIT` | 每日投稿限额（默认 5） |
| `ADMIN_PASS` | 管理员后台密码（**务必修改**） |
| `NTFY_TOPIC` | 推送话题；固定后可在 ntfy 长期订阅 |
| `BASE_URL` | 部署后的公网地址，用于推送「点击跳转后台」 |
| `NTFY_SERVER` | ntfy 服务地址（默认官方，可换自建） |

## 管理员入口
页面左上角 **连点 Logo 5 次**，或访问 `?admin=1`，输入 `ADMIN_PASS` 进入后台。
后台顶部会显示 **ntfy 订阅话题**，手机装 ntfy 应用订阅后即收实时提醒。

## 推送到手机（离线必达）
1. 应用商店安装 **ntfy**（iOS/Android）。
2. 订阅话题：`https://ntfy.sh/<NTFY_TOPIC>`（话题在后台可见）。
3. 之后每次新投稿，ntfy 服务器推送；即使你当时离线，联网后也会立即收到。

> 不想用 ntfy？可把 `pushNtfy()` 换成邮件（SMTP）或企业微信/钉钉/飞书 Webhook，逻辑在同一函数内，改一处即可。

## 部署到云端
### 方式 A：Docker（任意云服务器 / VPS）
```bash
docker build -t tennis-coach .
docker run -d --name tennis-coach -p 80:3000 \
  -e ADMIN_PASS=你的强密码 -e NTFY_TOPIC=tennis-coach-xxx -e BASE_URL=https://你的域名 \
  -v $(pwd)/data:/app/data tennis-coach
```
再用 Nginx/Caddy 反代 80 端口并配置 HTTPS 域名即可公网访问。

### 方式 B：Railway / Render / Koyeb（免费额度）
仓库已内置平台配置文件，按需选用其一即可：
- `render.yaml` —— **推荐 Render**（免费 Web 服务，无需信用卡）
- `railway.json` —— Railway
- `koyeb.yaml` —— Koyeb
- `Dockerfile` / `Procfile` —— 通用

步骤概览：
1. 把项目推到 GitHub 仓库（详见 `DEPLOYMENT.md`）。
2. 在对应平台连仓库并部署（Render 选 Blueprint / Railway·Koyeb 自动识别 `Dockerfile`）。
3. 设环境变量 `ADMIN_PASS`、`NTFY_TOPIC`、`BASE_URL`（平台给的域名）。
4. 部署完成即获得公网 HTTPS 地址，扫码即用。

> 完整步骤、访问地址格式、免费额度限制见 **`DEPLOYMENT.md`**。

### 数据持久化
投稿存于 `data/db.json`；Docker 请挂载卷（`-v $(pwd)/data:/app/data`），云平台请挂载持久盘。
**注意**：Render / Koyeb 的**免费额度磁盘为临时盘**，重新部署会清空投稿；请改用付费持久盘，或依赖每次投稿的 ntfy/邮件推送作为记录（详见 `DEPLOYMENT.md` 第六节）。

## 目录结构
```
tennis-cloud/
├── server.js          # 纯 Node 后端：API + 静态服务 + ntfy 推送
├── public/
│   ├── index.html     # 前端 SPA（首页卡片 / 验证 / 投稿 / 管理员）
│   ├── qr.js          # 二维码 SVG 封装
│   └── qrcode.lib.js  # qrcode-generator（MIT）
├── data/db.json       # 投稿数据（运行时生成）
├── Dockerfile
├── package.json
├── .env.example
├── .gitignore
├── Procfile            # 通用启动声明：web: node server.js
├── render.yaml         # Render 蓝图配置（推荐）
├── railway.json        # Railway 配置
├── koyeb.yaml          # Koyeb 配置参考
└── DEPLOYMENT.md       # 详细部署步骤、访问地址与免费额度说明
```
