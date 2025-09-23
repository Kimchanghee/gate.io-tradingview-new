FROM node:20-alpine

WORKDIR /app

# package.json만 먼저 복사
COPY package*.json ./

# 의존성 설치
RUN npm install --production

# 앱 코드 복사
COPY . .

# PORT 환경변수 (Cloud Run이 덮어씀)
ENV PORT=8080

# 포트 노출
EXPOSE 8080

# 앱 실행
CMD ["node", "server-simple.js"]
