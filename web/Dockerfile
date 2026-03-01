# syntax=docker/dockerfile:1
# Build stage: bake VITE_API_BASE_URL into assets; npm cache mounted to reuse packages
FROM node:20-alpine AS builder

WORKDIR /app

ARG VITE_API_BASE_URL=http://localhost:3000
ARG VITE_APP_ENV=local
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_APP_ENV=$VITE_APP_ENV

COPY package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
  npm ci

COPY . .
RUN npm run build

# Serve with nginx
FROM nginx:alpine

RUN rm -rf /usr/share/nginx/html/*

COPY --from=builder /app/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
