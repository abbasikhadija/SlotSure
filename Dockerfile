# syntax=docker/dockerfile:1
# Build with --platform linux/amd64. Keep native argon2 on the same glibc base.
FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json
RUN npm ci

FROM dependencies AS build
COPY client/ client/
RUN npm run build

FROM dependencies AS production-dependencies
RUN npm prune --omit=dev && npm cache clean --force
RUN node --input-type=module -e "import argon2 from 'argon2'; const hash = await argon2.hash('container-build-probe', {type: argon2.argon2id}); if (!await argon2.verify(hash, 'container-build-probe')) process.exit(1)"

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=production-dependencies /app/server/ ./server/
COPY package.json package-lock.json ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json
COPY server/src/ server/src/
COPY server/migrations/ server/migrations/
COPY server/assets/ server/assets/
COPY --from=build /app/client/dist/ client/dist/
USER node
EXPOSE 8080/tcp
HEALTHCHECK --interval=30s --timeout=7s --start-period=30s CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "server/src/index.js"]
