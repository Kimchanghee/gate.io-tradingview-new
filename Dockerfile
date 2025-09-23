FROM node:20-alpine

# Install dependencies for better container handling
RUN apk add --no-cache dumb-init

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm install --production && \
    npm cache clean --force

# Copy application code
COPY . .

# Create necessary directories
RUN mkdir -p logs data && \
    chmod -R 755 logs data

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Cloud Run expects PORT env variable
ENV PORT=8080

# Expose the port
EXPOSE 8080

# Health check endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 8080) + '/health', (r) => {r.statusCode === 200 ? process.exit(0) : process.exit(1)})"

# Use dumb-init to handle signals
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "server.js"]
