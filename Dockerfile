# Static site served by nginx on port 80.
# Ingress/TLS handled by Dokploy/Traefik, so no host ports are published.
FROM nginx:1.27-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY . /usr/share/nginx/html/
RUN rm -rf /usr/share/nginx/html/deploy /usr/share/nginx/html/Dockerfile \
    /usr/share/nginx/html/docker-compose.yml /usr/share/nginx/html/.dockerignore \
    /usr/share/nginx/html/.github /usr/share/nginx/html/README.md \
    /usr/share/nginx/html/tests /usr/share/nginx/html/scripts
EXPOSE 80
