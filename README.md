# Fotos Casamento — Captura via QR Code

Aplicação web para convidados tirarem fotos pelo celular após escanear um QR Code.

## Rodar localmente

```bash
npm install
npm start
```

- Home: `http://localhost:3000`
- Admin: `http://localhost:3000/admin`

No celular (mesma Wi-Fi): use o IP exibido no terminal ou escaneie o QR Code.

---

## Docker (local)

```bash
docker build -t fotos-casamento .
docker run -p 3000:3000 fotos-casamento
```

Acesse `http://localhost:3000`.

---

## Deploy na Render (Docker)

O projeto usa **Dockerfile** + `render.yaml` com disco persistente.

### Blueprint (recomendado)

1. Push no GitHub: `adissonvalentimbrandao/fotos-casamento`
2. [render.com](https://render.com) → **New** → **Blueprint**
3. Conecte o repo → **Apply**

### Manual

1. **New** → **Web Service** → repo do GitHub
2. **Environment:** Docker
3. **Dockerfile Path:** `./Dockerfile`
4. **Health Check Path:** `/health`
5. **Disk:** mount `/var/data` (1 GB)
6. **Environment variables:**
   - `NODE_ENV` = `production`
   - `DATA_DIR` = `/var/data`
7. Deploy

URL pública: `https://fotos-casamento.onrender.com` (ou o nome que você escolher na Render).

A Render injeta `RENDER_EXTERNAL_URL` automaticamente — o QR Code usa essa URL com HTTPS. **Não precisa** configurar DNS nem `PUBLIC_URL` manualmente.

### Envs na Render

| Variável | Valor | Quem define |
|----------|-------|-------------|
| `NODE_ENV` | `production` | `render.yaml` |
| `DATA_DIR` | `/var/data` | `render.yaml` |
| `PORT` | (auto) | Render |
| `RENDER_EXTERNAL_URL` | `https://....onrender.com` | Render (auto) |

---

## Estrutura

```
server.js
package.json
render.yaml
uploads/
database.sqlite
public/
  index.html
  capture.html
  admin.html
  style.css
  app.js
```

## Rotas

| Rota | Descrição |
|------|-----------|
| `/` | QR Code para convidados |
| `/capture/:token` | Tirar foto (celular) |
| `/admin` | Galeria de fotos |
| `GET /api/photos/download` | Download de todas as fotos em ZIP |
| `/health` | Health check (Render) |

## Variáveis de ambiente

Veja `.env.example`. Na Render com Docker, o essencial já está no `render.yaml`.
