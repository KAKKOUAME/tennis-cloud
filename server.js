'use strict';
/*
 * 网球技术问答投稿台 —— 纯 Node.js 全栈后端（零 npm 依赖）
 * 运行：node server.js   （可用环境变量配置，见 .env.example）
 */
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ---------- 配置 ----------
const PORT = parseInt(process.env.PORT || '3000', 10);
const DAILY_LIMIT = parseInt(process.env.DAILY_LIMIT || '5', 10);
const ADMIN_PASS = process.env.ADMIN_PASS || 'tennis2026';
const NTFY_TOPIC = process.env.NTFY_TOPIC || ('tennis-coach-' + crypto.randomBytes(4).toString('hex'));
const NTFY_SERVER = process.env.NTFY_SERVER || 'https://ntfy.sh';
const BASE_URL = process.env.BASE_URL || ''; // 部署后的公网地址，用于推送点击跳转
const EMAIL_TO = process.env.EMAIL_TO || ''; // 可选：同时发邮件（需 SMTP 代理，见 README）
const STORAGE_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(STORAGE_DIR, 'db.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const MAX_BODY = 25 * 1024 * 1024; // 25MB 上限（含 base64 媒体）

const ADMIN_TOKEN = crypto.createHash('sha256').update('tennis-admin::' + ADMIN_PASS).digest('hex').slice(0, 32);

// ---------- 题库（低难度：热门选手 / 四大满贯 / 用品品牌）----------
const QUIZ_BANK = [
  { q: '以下哪项不属于网球“四大满贯”赛事？', options: ['温布尔登锦标赛', '法国网球公开赛', '上海大师赛', '美国网球公开赛'], a: 2 },
  { q: '法国网球公开赛（法网）的场地类型是？', options: ['红土', '草地', '硬地', '室内地毯'], a: 0 },
  { q: '温布尔登锦标赛的场地类型是？', options: ['红土', '草地', '硬地', '沙地'], a: 1 },
  { q: '网球比分里的 “Love” 代表多少分？', options: ['0 分', '15 分', '30 分', '40 分'], a: 0 },
  { q: '罗杰·费德勒（Roger Federer）来自哪个国家？', options: ['瑞士', '西班牙', '塞尔维亚', '奥地利'], a: 0 },
  { q: '拉菲尔·纳达尔（Rafael Nadal）以擅长哪类场地闻名？', options: ['草地', '红土', '硬地', '室内'], a: 1 },
  { q: '诺瓦克·德约科维奇（Djokovic）来自哪个国家？', options: ['西班牙', '塞尔维亚', '瑞士', '克罗地亚'], a: 1 },
  { q: '以下哪个是知名的网球拍品牌？', options: ['联想', '小米', 'Wilson', '雀巢'], a: 2 },
  { q: '当比分达到 40-40 时，术语称为？', options: ['占先 Deuce（平分）', '破发点', '赛点', '局点'], a: 0 },
  { q: '大坂直美（Naomi Osaka）来自哪个国家？', options: ['日本', '韩国', '中国', '泰国'], a: 0 },
  { q: '网球发球时，球应当如何被击中？', options: ['落地弹起后用拍击打', '未落地前直接用拍凌空击打', '用手抛出', '用脚踢'], a: 1 },
  { q: '以下哪项是草地赛事？', options: ['法网', '温网', '美网', '澳网'], a: 1 },
  { q: '比赛中“破发”通常指？', options: ['发球方保住自己发球局', '接发方赢下对手发球局', '连赢两局', '赢下抢七'], a: 1 },
  { q: '卡洛斯·阿尔卡拉斯（Alcaraz）来自哪个国家？', options: ['西班牙', '阿根廷', '意大利', '葡萄牙'], a: 0 },
  { q: '网球单打“三盘两胜制”中，先赢几盘即获胜？', options: ['1 盘', '2 盘', '3 盘', '4 盘'], a: 1 }
];

// ---------- 存储 ----------
function ensureDb() {
  if (!fs.existsSync(STORAGE_DIR)) fs.mkdirSync(STORAGE_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({ submissions: [] }, null, 2));
}
function loadDb() {
  ensureDb();
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch (e) { return { submissions: [] }; }
}
let _db = loadDb();
let _saving = false;
function saveDb() {
  _saving = true;
  fs.writeFile(DB_FILE, JSON.stringify(_db, null, 2), (err) => {
    _saving = false;
    if (err) console.error('[db] 保存失败:', err.message);
  });
}

function todayStr(d) {
  d = d || new Date();
  const z = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate());
}
function countToday() {
  const t = todayStr();
  return _db.submissions.filter((s) => s.date === t && !s.demo).length;
}

// ---------- 推送（ntfy：离线可送达的 Store-and-Forward）----------
function pushNtfy(sub) {
  const url = NTFY_SERVER.replace(/\/$/, '') + '/' + encodeURIComponent(NTFY_TOPIC);
  const title = 'New tennis submission #' + sub.seq; // 头信息仅限 ASCII，中文放正文
  const body = [
    '昵称：' + (sub.nickname || '匿名'),
    '类型：' + (sub.type === 'technique' ? '网球技术' : sub.type === 'equipment' ? '装备选择' : '比赛战术') + ' / ' + sub.subcatLabel,
    '问题：' + (sub.text || '（未填写文字）').slice(0, 200),
    '时间：' + sub.createdAt
  ].join('\n');
  const headers = {
    'Title': title,
    'Tags': 'tennis,new',
    'Priority': 'high',
    'Content-Type': 'text/plain; charset=utf-8'
  };
  if (BASE_URL) headers['Click'] = BASE_URL + '/?admin=1';
  const data = Buffer.from(body, 'utf8');
  const u = new URL(url);
  const req = https.request({
    method: 'POST',
    hostname: u.hostname,
    port: u.port || 443,
    path: u.pathname,
    headers: Object.assign({ 'Content-Length': data.length }, headers)
  }, (res) => {
    let buf = '';
    res.on('data', (c) => (buf += c));
    res.on('end', () => console.log('[ntfy] 推送回馈', res.statusCode, buf.slice(0, 80)));
  });
  req.on('error', (e) => console.error('[ntfy] 推送失败:', e.message));
  req.write(data);
  req.end();
}

// ---------- HTTP 工具 ----------
function sendJSON(res, code, obj) {
  const s = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
  res.end(s);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; let chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('请求体过大')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(Buffer.concat(chunks).toString('utf8')); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json', '.ico': 'image/x-icon' };
function serveStatic(req, res, pathname) {
  let rel = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Not Found'); return; }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

// ---------- 路由 ----------
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  const p = u.pathname;
  const m = req.method;

  try {
    // 公开配置
    if (p === '/api/config' && m === 'GET') {
      return sendJSON(res, 200, { dailyLimit: DAILY_LIMIT, ntfyTopic: NTFY_TOPIC, baseUrl: BASE_URL });
    }

    // 健康检查（供 Railway / Render / Koyeb 的健康探针使用）
    if ((p === '/healthz' || p === '/ping') && (m === 'GET' || m === 'HEAD')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, status: 'up', ts: Date.now() }));
    }

    // 随机题库（不返回答案）
    if (p === '/api/quiz' && m === 'GET') {
      const item = QUIZ_BANK[Math.floor(Math.random() * QUIZ_BANK.length)];
      return sendJSON(res, 200, { id: item.q, options: item.options });
    }

    // 校验答案
    if (p === '/api/quiz/check' && m === 'POST') {
      const b = JSON.parse(await readBody(req) || '{}');
      const hit = QUIZ_BANK.find((x) => x.q === b.quizId);
      const ok = !!hit && hit.a === b.answer;
      return sendJSON(res, 200, { ok });
    }

    // 提交投稿
    if (p === '/api/submissions' && m === 'POST') {
      const b = JSON.parse(await readBody(req) || '{}');
      // 验证题库
      const hit = QUIZ_BANK.find((x) => x.q === b.quizId);
      if (!hit || hit.a !== b.quizAnswer) return sendJSON(res, 403, { ok: false, msg: '验证未通过' });
      // 每日限额
      const used = countToday();
      if (used >= DAILY_LIMIT) return sendJSON(res, 429, { ok: false, msg: '今日投稿名额已满（' + DAILY_LIMIT + ' 位），明天再来吧～' });
      // 基础校验
      if (!b.nickname || !b.text) return sendJSON(res, 400, { ok: false, msg: '昵称与问题描述为必填' });
      if (!['technique', 'tactic', 'equipment'].includes(b.type)) return sendJSON(res, 400, { ok: false, msg: '问题类型无效' });
      const subcatLabel = (b.type === 'technique'
        ? ({ baseline: '底线技术', mid: '中场技术', net: '网前技术' }[b.subcat])
        : b.type === 'equipment'
        ? ({ racket: '球拍', shoes: '球鞋', string: '球线' }[b.subcat])
        : ({ singles: '单打战术', doubles: '双打战术' }[b.subcat])) || '未分类';
      const sub = {
        id: crypto.randomBytes(8).toString('hex'),
        seq: _db.submissions.length + 1,
        nickname: String(b.nickname).slice(0, 30),
        type: b.type,
        subcat: b.subcat || '',
        subcatLabel,
        text: String(b.text).slice(0, 2000),
        images: Array.isArray(b.images) ? b.images.slice(0, 6) : [],
        video: b.video || null,
        date: todayStr(),
        createdAt: new Date().toISOString(),
        status: 'pending',
        reply: null,
        cardHidden: false,
        comments: []
      };
      // 媒体体积保护
      let mediaBytes = 0;
      sub.images.forEach((im) => { const m = /^data:.*;base64,/.exec(im); if (m) mediaBytes += im.length; });
      if (sub.video) mediaBytes += sub.video.length;
      if (mediaBytes > 18 * 1024 * 1024) return sendJSON(res, 413, { ok: false, msg: '媒体总大小超出限制' });
      _db.submissions.push(sub);
      saveDb();
      try { pushNtfy(sub); } catch (e) { console.error('[ntfy] 推送异常:', e.message); }
      return sendJSON(res, 200, { ok: true, id: sub.id, seq: sub.seq, remaining: DAILY_LIMIT - countToday() });
    }

    // 首页公开问答卡片（已回复且未隐藏）
    if (p === '/api/cards' && m === 'GET') {
      const cards = _db.submissions
        .filter((s) => s.status === 'replied' && s.reply && !s.cardHidden)
        .sort((a, b) => (b.reply.repliedAt || '').localeCompare(a.reply.repliedAt || ''))
        .map((s) => ({
          id: s.id,
          type: s.type,
          typeLabel: s.type === 'technique' ? '网球技术' : s.type === 'equipment' ? '装备选择' : '比赛战术',
          subcatLabel: s.subcatLabel,
          question: s.text,
          questionImages: (s.images || []).slice(0, 2),
          questionVideo: s.video || null,
          answer: s.reply.text,
          answerImage: s.reply.image || null,
          repliedAt: s.reply.repliedAt,
          comments: (s.comments || []).filter((c) => !c.hidden).map((c) => ({
            id: c.id, nickname: c.nickname, text: c.text, createdAt: c.createdAt, likes: c.likes || 0
          }))
        }));
      return sendJSON(res, 200, { cards, dailyLimit: DAILY_LIMIT, usedToday: countToday() });
    }

    // 管理员登录
    if (p === '/api/admin/login' && m === 'POST') {
      const b = JSON.parse(await readBody(req) || '{}');
      if (b.pass === ADMIN_PASS) return sendJSON(res, 200, { ok: true, token: ADMIN_TOKEN });
      return sendJSON(res, 401, { ok: false, msg: '密码错误' });
    }

    // 管理员：列表（需 token）
    if (p === '/api/admin/submissions' && m === 'GET') {
      if (u.searchParams.get('token') !== ADMIN_TOKEN) return sendJSON(res, 401, { ok: false });
      const list = _db.submissions.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((s) => ({
        id: s.id, seq: s.seq, nickname: s.nickname, type: s.type, subcatLabel: s.subcatLabel,
        text: s.text, images: s.images, video: s.video, status: s.status,
        reply: s.reply, cardHidden: s.cardHidden, createdAt: s.createdAt
      }));
      return sendJSON(res, 200, { ok: true, list, dailyLimit: DAILY_LIMIT, usedToday: countToday(), ntfyTopic: NTFY_TOPIC });
    }

    // 管理员：回复
    if (p === '/api/admin/reply' && m === 'POST') {
      const b = JSON.parse(await readBody(req) || '{}');
      if (b.token !== ADMIN_TOKEN) return sendJSON(res, 401, { ok: false });
      const sub = _db.submissions.find((x) => x.id === b.id);
      if (!sub) return sendJSON(res, 404, { ok: false, msg: '投稿不存在' });
      if (!b.text || !String(b.text).trim()) return sendJSON(res, 400, { ok: false, msg: '回复内容必填' });
      sub.reply = { text: String(b.text).slice(0, 2000), image: b.image || null, repliedAt: new Date().toISOString() };
      sub.status = 'replied';
      saveDb();
      return sendJSON(res, 200, { ok: true });
    }

    // 管理员：隐藏/显示卡片
    if (p === '/api/admin/card/hide' && m === 'POST') {
      const b = JSON.parse(await readBody(req) || '{}');
      if (b.token !== ADMIN_TOKEN) return sendJSON(res, 401, { ok: false });
      const sub = _db.submissions.find((x) => x.id === b.id);
      if (!sub) return sendJSON(res, 404, { ok: false });
      sub.cardHidden = !!b.hidden;
      saveDb();
      return sendJSON(res, 200, { ok: true });
    }

    // 管理员：删除投稿
    if (p === '/api/admin/submission' && m === 'DELETE') {
      const b = JSON.parse(await readBody(req) || '{}');
      if (b.token !== ADMIN_TOKEN) return sendJSON(res, 401, { ok: false });
      const i = _db.submissions.findIndex((x) => x.id === b.id);
      if (i < 0) return sendJSON(res, 404, { ok: false });
      _db.submissions.splice(i, 1);
      saveDb();
      return sendJSON(res, 200, { ok: true });
    }

    // 公开：新增匿名评论
    if (p === '/api/cards/comment' && m === 'POST') {
      const b = JSON.parse(await readBody(req) || '{}');
      if (!b.id || !b.text || !String(b.text).trim()) return sendJSON(res, 400, { ok: false, msg: '评论内容不能为空' });
      const sub = _db.submissions.find((x) => x.id === b.id);
      if (!sub) return sendJSON(res, 404, { ok: false, msg: '投稿不存在' });
      if (sub.status !== 'replied' || sub.cardHidden) return sendJSON(res, 403, { ok: false, msg: '该卡片暂不可评论' });
      sub.comments = sub.comments || [];
      const cm = { id: crypto.randomBytes(6).toString('hex'), nickname: '匿名访客', text: String(b.text).slice(0, 500), createdAt: new Date().toISOString(), hidden: false, likes: 0 };
      sub.comments.push(cm);
      saveDb();
      return sendJSON(res, 200, { ok: true, comment: { id: cm.id, nickname: cm.nickname, text: cm.text, createdAt: cm.createdAt, likes: 0 } });
    }

    // 公开：评论点赞
    if (p === '/api/cards/comment/like' && m === 'POST') {
      const b = JSON.parse(await readBody(req) || '{}');
      const sub = _db.submissions.find((x) => x.id === b.id);
      if (!sub || !sub.comments) return sendJSON(res, 404, { ok: false });
      const cm = sub.comments.find((c) => c.id === b.commentId);
      if (!cm) return sendJSON(res, 404, { ok: false });
      cm.likes = (cm.likes || 0) + 1;
      saveDb();
      return sendJSON(res, 200, { ok: true, likes: cm.likes });
    }

    // 管理员：隐藏 / 删除评论
    if (p === '/api/admin/comment' && m === 'POST') {
      const b = JSON.parse(await readBody(req) || '{}');
      if (b.token !== ADMIN_TOKEN) return sendJSON(res, 401, { ok: false });
      const sub = _db.submissions.find((x) => x.id === b.id);
      if (!sub || !sub.comments) return sendJSON(res, 404, { ok: false });
      const i = sub.comments.findIndex((c) => c.id === b.commentId);
      if (i < 0) return sendJSON(res, 404, { ok: false });
      if (b.action === 'delete') sub.comments.splice(i, 1);
      else sub.comments[i].hidden = !!b.hidden;
      saveDb();
      return sendJSON(res, 200, { ok: true });
    }

    // 静态文件
    if (m === 'GET' || m === 'HEAD') return serveStatic(req, res, p);

    return sendJSON(res, 404, { ok: false, msg: 'Not Found' });
  } catch (e) {
    console.error('[err]', e.message);
    return sendJSON(res, 500, { ok: false, msg: '服务器错误：' + e.message });
  }
});

// 显式绑定 0.0.0.0，确保云平台（Railway/Render/Koyeb）的外部流量可路由进来
server.listen(PORT, '0.0.0.0', () => {
  console.log('🎾 网球技术问答投稿台已启动： http://0.0.0.0:' + PORT);
  console.log('   每日限额=' + DAILY_LIMIT + '  ntfy话题=' + NTFY_TOPIC + '  管理员密码=' + (ADMIN_PASS === 'tennis2026' ? '(默认 tennis2026，请用 ADMIN_PASS 修改)' : '(已自定义)'));
});
