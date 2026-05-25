# Backend Dockerfile (single-stage, runs TypeScript directly via tsx)

FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production

# Install dependencies (including tsx for runtime)
COPY package.json package-lock.json ./
RUN npm ci && npm cache clean --force

# Copy source
COPY tsconfig.json ./
COPY src ./src

# Run as non-root user for security
USER node

EXPOSE 3000

CMD ["npx", "tsx", "src/index.ts"]
