# 网球技术问答投稿台 —— 生产镜像（零 npm 依赖）
FROM node:20-alpine
WORKDIR /app
COPY package.json ./
COPY server.js ./
COPY public ./public
RUN mkdir -p /app/data
ENV PORT=3000
EXPOSE 3000
# 投稿数据持久化：生产环境请挂载卷到 /app/data
# 注意：Railway 不支持 Dockerfile 原生 VOLUME，需在 Railway 面板添加 Volume 挂载到 /app/data
CMD ["node", "server.js"]
