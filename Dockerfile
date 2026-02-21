FROM --platform=linux/amd64 oven/bun:1 AS builder

WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install
COPY tsconfig.json ./
COPY src/ ./src/
RUN bun run tsc --outDir dist

FROM --platform=linux/amd64 oven/bun:1-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./

EXPOSE 3000

CMD ["bun", "dist/index.js"]
