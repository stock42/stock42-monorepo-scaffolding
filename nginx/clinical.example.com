# Example Clinical — clinical.example.com
# Next.js 16, port 3741

server {
    listen 80;
    server_name clinical.example.com;

    client_max_body_size 128m;

    location / {
        proxy_pass http://127.0.0.1:3741;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Clinical AI calls may run for 10 minutes. Keep one minute of
        # transport headroom so a provider timeout can return a JSON error.
        proxy_buffering off;
        proxy_read_timeout 660s;
        proxy_send_timeout 660s;
    }
}
