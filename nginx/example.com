# Example Landing — example.com
# Next.js 16, port 3820

# Canonical domain
server {
    listen 80;
    server_name example.com;

    client_max_body_size 128m;

    location / {
        proxy_pass http://127.0.0.1:3820;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# Redirect all other variants to canonical
server {
    listen 80;
    server_name www.example.com
                example.info www.example.info
                example.net www.example.net
                example.online www.example.online;

    return 301 $scheme://example.com$request_uri;
}
