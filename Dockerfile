FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

FROM node:22-alpine

# Install poppler-utils for PDF-to-image conversion (pdftoppm)
RUN apk add --no-cache poppler-utils poppler-data

RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY src/db/migrations/ ./dist/db/migrations/
COPY public/ ./public/

RUN chown -R nodejs:nodejs /app
USER nodejs

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/health').then(r=>{if(!r.ok)throw 1}).catch(()=>process.exit(1))"

EXPOSE 3000

CMD ["node", "dist/index.js"]
