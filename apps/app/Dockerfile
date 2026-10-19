# PWA / site: build estático do Expo servido pelo Nginx, que também encaminha /api para o backend.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# Em produção o app chama a API no mesmo domínio (/api), então a URL fica vazia
ENV EXPO_PUBLIC_API_URL=""
RUN npm run build:web

FROM nginx:1.27-alpine
# URL interna do serviço da API no Easypanel (ex.: http://biblealpha_api:8000)
ENV API_UPSTREAM=http://api:8000
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
