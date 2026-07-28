# Example Backoffice — backoffice.example.com
# Next.js 16, port 3742

server {
    listen 80;
    server_name backoffice.example.com;

    client_max_body_size 128m;

    location / {
        proxy_pass http://127.0.0.1:3742;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
