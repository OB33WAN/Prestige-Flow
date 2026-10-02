FROM node:22-alpine AS site-build
WORKDIR /source
COPY . .
RUN npm ci && npm run build && npm run check
ARG OLD_SITE_API_ORIGIN=https://prestige-flow-old-site-payments-api.fvbnid.easypanel.host
RUN node deploy/easypanel/configure-site-api.mjs "$OLD_SITE_API_ORIGIN"

FROM nginx:1.27-alpine
COPY deploy/easypanel/nginx.conf /etc/nginx/conf.d/default.conf
COPY deploy/easypanel/legacy-redirects.conf /etc/nginx/legacy-redirects.conf
COPY --from=site-build /source/.public-site/ /usr/share/nginx/html/
EXPOSE 80
