FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ENV NODE_ENV=production PORT=8000 DATABASE_FILE=/app/var/core.db UPLOAD_DIR=/app/var/uploads WALLET_KEYSTORE_FILE=/app/var/dev-keystore.jsonl
EXPOSE 8000
# seed is idempotent: safe to run on every boot
CMD node server/seed.js && node server/index.js
