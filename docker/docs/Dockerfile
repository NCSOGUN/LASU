# syntax=docker/dockerfile:1

# Builds the self-contained API reference and serves it with nginx.
# nginx also proxies /v1 to the online service so the Try It panel is same-origin.

FROM node:24-alpine AS build
WORKDIR /app
COPY docs/api ./docs/api
RUN node docs/api/build.mjs

FROM nginx:1.27-alpine
COPY --from=build /app/docs/api /usr/share/nginx/html
COPY docker/docs/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
