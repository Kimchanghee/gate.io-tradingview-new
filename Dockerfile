FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

COPY --from=builder /app .
RUN rm -rf node_modules && npm ci --omit=dev

EXPOSE 8080

CMD ["node", "server-simple.js"]
