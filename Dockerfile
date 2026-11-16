FROM node:24.22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev
FROM node:24.22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8000 APP_ORIGIN=http://localhost:8000
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/package.json ./package.json
RUN mkdir var && chown node:node var
USER node
EXPOSE 8000
CMD ["node","dist/api/main.js"]
