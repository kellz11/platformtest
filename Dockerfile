FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
# Bundle the browser modules into one classic script. This avoids module-loading
# failures behind hosted proxies and keeps the full frontend self-contained.
RUN npx -y esbuild@0.28.1 ui/app.js --bundle --platform=browser --format=iife --target=es2020 --outfile=ui/app.bundle.js
ENV NODE_ENV=production PORT=8000 DATABASE_FILE=/app/var/core.db UPLOAD_DIR=/app/var/uploads WALLET_KEYSTORE_FILE=/app/var/dev-keystore.jsonl
EXPOSE 8000
# seed is idempotent: safe to run on every boot
CMD node server/seed.js && node server/index.js