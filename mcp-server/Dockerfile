FROM node:18-slim

WORKDIR /app

# Install dependencies first for better layer caching
COPY package*.json ./
RUN npm ci --production

# Copy compiled application
COPY dist/ ./dist/

EXPOSE 3001

CMD ["node", "dist/index.js"]
