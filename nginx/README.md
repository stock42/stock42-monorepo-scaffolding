# Nginx

El baseline publica `example.com` (webapp), `backoffice.example.com` y
`api.example.com`. El agente no tiene virtual host.

Validación sintáctica:

```bash
sudo nginx -t -c "$PWD/nginx/nginx.conf" -p "$PWD/nginx"
```

La validación intenta reservar los listeners; el baseline HTTP usa el puerto
privilegiado `80`.

Los paths relativos suponen que `nginx/` se usa como prefix (`-p`) o se adapta
al layout de `/etc/nginx`. TLS y certificados se integran en el despliegue; no
hay paths de certificados hardcodeados en el repositorio.
