# syntax=docker/dockerfile:1

# ---- Build stage --------------------------------------------------------
FROM node:24-bookworm-slim AS builder
WORKDIR /app

COPY package*.json ./
# npm ci: cài đúng y hệt package-lock.json. node:24 bundle sẵn npm 11 khớp
# lock (xem gotcha ở backend/Dockerfile — npm 10 lệch với lock npm 11).
RUN npm ci --include=dev

COPY . .
RUN npm run build

# ---- Runtime stage ------------------------------------------------------
FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist

USER node
EXPOSE 3001

CMD ["node", "dist/main"]
