# 网球技术问答投稿台 — 云端部署指南

本项目是**纯 Node.js（零 npm 依赖）全栈应用**，已为云端部署做好准备：
已新增 `/healthz` 健康检查、`0.0.0.0` 显式绑定，并提供三大免费平台的配置文件。

---

## 一、平台选型结论

| 平台 | 推荐度 | 免费额度要点 | 持久化磁盘 | 是否需信用卡 |
|------|--------|--------------|------------|--------------|
| **Render** | ⭐ 首推 | Web 服务 $0/月，750h/月（≈常驻），自动 HTTPS，自动从 GitHub 部署 | ❌ 免费版磁盘为临时盘（重启/部署即重置） | 不需要 |
| **Railway** | 备选 | 新用户 $5 试用额度，用完需付费；支持持久卷 | ✅ 需付费卷 | 需要 |
| **Koyeb** | 备选 | 512MB 实例 + 512MB 存储，免费额度；控制台/CLI 部署 | ⚠️ 卷通常需付费计划 | 需要（验证用） |

> **结论**：零成本、无信用卡、最省心 → 选 **Render**。
> 若投稿数据必须长期保留（不丢），选 **Railway/Koyeb + 付费持久卷**，或见下文「数据持久化」方案。

---

## 二、部署前准备（一次性，本地执行）

```bash
cd tennis-cloud
git init
git add .
git commit -m "feat: 云端部署就绪（健康检查 + 平台配置）"
# 推到你自己的 GitHub 仓库（替换 <your>/<repo>）
git remote add origin https://github.com/<your>/<repo>.git
git branch -M main
git push -u origin main
```

> 之后每次改代码只需 `git push`，平台会自动重新部署。

---

## 三、Render 部署（推荐，3 步）

1. 打开 https://render.com → 注册/登录（GitHub 授权，**无需信用卡**）。
2. **New → Blueprint** → 连接上面的 GitHub 仓库 → 选中 `render.yaml` → **Create New Blueprint Instance**。
3. 在控制台 **Environment** 里补两个变量（Blueprint 中已标 `sync:false`）：
   - `ADMIN_PASS`：管理员后台强密码（务必改，默认 `tennis2026` 有提示）
   - `BASE_URL`：部署完成后 Render 分配的 `https://xxx.onrender.com`
   - （可选）`NTFY_TOPIC`：固定 ntfy 话题，便于长期订阅推送

**访问地址**：`https://<service-name>.onrender.com`
**免费限制**：
- 750 免费小时/月（单个服务约等于 24×30=720h，可常驻）；
- 空闲 15 分钟后自动休眠，**冷启动约 30s–1min**（首次访问会慢一下）；
- 免费版**磁盘为临时盘**：每次重新部署/重启，`data/db.json` 会重置（见第四节）；
- 支持自定义域名（免费版也可绑定）。

---

## 四、Railway 部署（备选）

1. 打开 https://railway.app → GitHub 登录。
2. **New Project → Deploy from GitHub repo** → 选中仓库（会自动读取 `railway.json`）。
3. 在 Variables 添加：`ADMIN_PASS`、`BASE_URL`（部署后填 `https://<project>.up.railway.app`）、可选 `NTFY_TOPIC`。
4. 生成域名后，到 **Settings → Domains** 确认已分配公开地址。

**访问地址**：`https://<project>.up.railway.app`
**免费限制**：新用户 $5 试用额度（按用量计费，用完后需升级付费）；支持持久卷（需付费计划挂载到 `/app/data`）。

---

## 五、Koyeb 部署（备选）

1. 安装 CLI：`npm i -g koyeb` 并 `koyeb login`（或控制台连接 GitHub）。
2. 一键部署（自动识别仓库 `Dockerfile`）：
   ```bash
   koyeb app init tennis-coach-desk \
     --dockerfile ./Dockerfile \
     --ports 3000:http \
     --env PORT=3000 --env DAILY_LIMIT=5 \
     --health-check-path /healthz
   koyeb app deploy
   ```
   或在控制台：Create App → 选 GitHub 仓库 → Build 方式选 Dockerfile → 填端口 3000 / 健康检查 `/healthz`。

**访问地址**：`https://<app>.koyeb.app`
**免费限制**：512MB RAM / 0.1 vCPU / 512MB 存储；需信用卡验证（预授权 $0）；持久卷通常需付费计划。

---

## 六、数据持久化（重要）

投稿数据写在 `data/db.json`（容器/实例文件系统内）。

- **Render 免费版**：磁盘临时，重新部署会清空投稿。
  - 缓解：每次新投稿都会触发 **ntfy 推送 / 邮件**，运营者即使数据被重置也已收到通知，可据此恢复；
  - 要真正持久：升级到付费计划并挂载 **Persistent Disk** 到 `/app/data`（Render 控制台 → Disks）。
- **Railway / Koyeb**：挂载付费持久卷到 `/app/data` 即可长期保存。
- **通用替代**：把存储换成免费数据库（如 Supabase 免费 Postgres），改动集中在 `server.js` 的 `ensureDb/saveDb/loadDb`，本仓库暂不实现。

---

## 七、环境变量一览

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PORT` | 监听端口（平台自动注入） | 3000 |
| `DAILY_LIMIT` | 每日投稿限额 | 5 |
| `ADMIN_PASS` | 管理员后台密码（**务必修改**） | tennis2026 |
| `NTFY_TOPIC` | ntfy 推送话题（留空随机生成） | 随机 |
| `NTFY_SERVER` | ntfy 服务地址 | https://ntfy.sh |
| `BASE_URL` | 公网地址，用于推送点击跳转 | 空 |
| `EMAIL_TO` | 可选：同时邮件提醒（需 SMTP 代理） | 空 |

---

## 八、验证部署成功

部署后访问：
- `https://<你的域名>/` → 首页卡片正常
- `https://<你的域名>/healthz` → 返回 `{"ok":true,"status":"up",...}`
- `https://<你的域名>/api/config` → 返回限额与话题

如健康检查连续失败，平台会标记部署不健康并重启；请检查日志中的 `ADMIN_PASS`/`PORT` 配置。
