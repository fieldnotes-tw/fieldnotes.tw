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
# Apply migrations then serve. DATABASE_URL comes from the host/task env.
CMD ["sh", "-c", "npx drizzle-kit migrate && npx tsx src/index.ts"]
