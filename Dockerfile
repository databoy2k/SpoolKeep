# Stage 1: Build the React frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci --legacy-peer-deps
COPY frontend/ ./
RUN npm run build

# Stage 2: Serve the application with Node.js backend
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production --ignore-scripts
COPY server.js spoolman-api.js orca-presets.js profile-db.js profile-baselines.json ./
# Copy built frontend from Stage 1
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Create data directory for database persistence
RUN mkdir -p /app/data
VOLUME /app/data

EXPOSE 5050
ENV PORT=5050
ENV NODE_ENV=production

CMD ["node", "server.js"]
