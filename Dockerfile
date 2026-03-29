# Stage 1: Build the application
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Stage 2: Serve the application
FROM node:18-alpine

# Install serve
RUN npm install -g serve

# Copy built files from builder
COPY --from=builder /app/dist /app/dist

# Expose port
EXPOSE 16718

# Start serve
CMD ["serve", "-s", "/app/dist", "-l", "16718"]
