# One image, two commands: `node dist/server.js` (API) and `node dist/worker.js` (jobs).
FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig*.json ./
COPY src ./src
RUN npm run build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY migrations ./migrations
COPY templates ./templates
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
