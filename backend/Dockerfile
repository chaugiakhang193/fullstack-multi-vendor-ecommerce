# syntax=docker/dockerfile:1

# ---- Build stage --------------------------------------------------------
# NODE_ENV=production khiến npm bỏ devDependencies, nhưng build cần nest CLI +
# typescript nên phải cài đầy đủ (--include=dev) ở stage này.
FROM node:20-bookworm-slim AS builder
WORKDIR /app

COPY package*.json ./
# npm install (không phải npm ci) để reconcile lock: lock được sinh bởi npm 11,
# còn image node:20 ship npm 10 -> npm ci nghiêm ngặt fail vì lệch resolve.
# Đây cũng đúng cách Render build (npm install --include=dev).
RUN npm install --include=dev

COPY . .
# nest build: rewrite alias @/ -> require tương đối và copy asset .hbs vào dist,
# tạo dist/database/data-source.js + dist/database/migrations/*.js chạy bằng node thuần.
RUN npm run build

# ---- Runtime stage ------------------------------------------------------
# Chỉ prod deps: nhỏ + nhanh. typeorm (CLI cho migration), dotenv (qua
# @nestjs/config) và handlebars đều là dependency nên còn sau --omit=dev.
FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist

USER node
EXPOSE 8080

# Dựng schema từ migration (InitialSchema chạy từ DB trống) rồi khởi động app.
CMD ["sh", "-c", "npm run migration:run:prod && node dist/main"]
