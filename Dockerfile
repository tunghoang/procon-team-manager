FROM node:22-alpine

ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}

WORKDIR /app

# Copy backend package files and install dependencies
COPY package*.json ./
RUN npm install --legacy-peer-deps

# Copy backend source
COPY src ./src

# Expose the application port
EXPOSE 8000

# Start the application
CMD ["node", "src/index.js"]
