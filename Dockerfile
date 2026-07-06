FROM nginx:alpine

# Custom server config: static serving + sensible caching.
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Static site content (the whole repo root; see .dockerignore for what's excluded).
COPY . /usr/share/nginx/html/

# nginx.conf is part of the build context, so it gets copied into the web root
# by `COPY .` above — remove it so it isn't served publicly.
RUN rm -f /usr/share/nginx/html/nginx.conf

EXPOSE 80
