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

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY src/db/migrations/ ./dist/db/migrations/
COPY public/ ./public/

EXPOSE 3000

CMD ["node", "dist/index.js"]
