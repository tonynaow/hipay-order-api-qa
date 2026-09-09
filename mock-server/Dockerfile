FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY mock-server ./mock-server
ENV MOCK_SERVER_PORT=3000
EXPOSE 3000
CMD ["node", "mock-server/server.js"]
