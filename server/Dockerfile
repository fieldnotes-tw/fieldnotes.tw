FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY tsconfig.json drizzle.config.ts ./
COPY drizzle ./drizzle
COPY src ./src
EXPOSE 3001
# Migrate, seed admin if missing, then serve. Secrets come from the host env.
CMD ["sh", "-c", "npx drizzle-kit migrate && npx tsx src/db/seed.ts && npx tsx src/index.ts"]
