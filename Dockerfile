FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY dist/ ./dist/

EXPOSE ${PORT:-3000}

CMD ["node", "dist/index.js"]
