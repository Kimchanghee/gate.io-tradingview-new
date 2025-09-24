FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# Remove devDependencies before moving into the runtime image
RUN npm prune --omit=dev

FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

COPY --from=builder /app .
RUN rm -rf node_modules && npm ci --omit=dev

EXPOSE 8080

CMD ["node", "server-simple.js"]
