# 网球技术问答投稿台 —— 生产镜像（零 npm 依赖）
FROM node:20-alpine
WORKDIR /app
COPY package.json ./
COPY server.js ./
COPY public ./public
RUN mkdir -p /app/data
ENV PORT=3000
EXPOSE 3000
# 投稿数据持久化：挂载卷到 /app/data
VOLUME ["/app/data"]
CMD ["node", "server.js"]
