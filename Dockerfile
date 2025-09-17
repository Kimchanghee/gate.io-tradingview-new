# syntax=docker/dockerfile:1

FROM node:20-alpine AS builder
WORKDIR /app

# Install dependencies
COPY package.json ./
RUN npm install

# Copy source and build frontend assets
COPY . .
RUN npm run build

# Production image
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

# Install only production dependencies
COPY package.json ./
RUN npm install --omit=dev

# Copy built assets and server file
COPY --from=builder /app/dist ./dist
COPY serve.js ./

EXPOSE 8080
CMD ["npm", "start"]
