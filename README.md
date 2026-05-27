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

## Deploy na Render

### Opção A — Blueprint (recomendado)

1. Faça push do projeto para o GitHub.
2. Acesse [render.com](https://render.com) → **New** → **Blueprint**.
3. Conecte o repositório — o `render.yaml` já está configurado.
4. Clique em **Apply**.

### Opção B — Manual

1. **New** → **Web Service** → conecte o repositório.
2. Configurações:
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Health Check Path:** `/health`
3. Variáveis de ambiente (opcional):
   - `NODE_ENV` = `production`
4. Deploy.

Após o deploy, a URL será algo como `https://fotos-casamento.onrender.com`.

### HTTPS e câmera

Na Render o site já sai com **HTTPS** — a câmera funciona no celular sem configuração extra. O QR Code aponta automaticamente para a URL pública.

### Persistir fotos (importante)

No plano free, arquivos somem ao reiniciar o serviço. Para manter fotos e banco:

1. No painel da Render: **Disks** → Add Disk (1 GB) em `/var/data`
2. Adicione a variável: `DATA_DIR` = `/var/data`
3. Faça redeploy.

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
| `/health` | Health check (Render) |

## Variáveis de ambiente

Veja `.env.example` para referência.

| Variável | Obrigatória? | Quem define | Descrição |
|----------|--------------|-------------|-----------|
| `PORT` | Não | Render (auto) | Porta do servidor |
| `NODE_ENV` | Sim (prod) | Você / `render.yaml` | Use `production` na Render |
| `RENDER_EXTERNAL_URL` | Não | **Render (auto)** | URL `https://xxx.onrender.com` — QR Code usa isso |
| `PUBLIC_URL` | Só com DNS próprio | Você (painel) | Ex: `https://fotos.seudominio.com.br` — sobrescreve a URL do QR |
| `DATA_DIR` | Recomendado | Você (painel) | Ex: `/var/data` com disco persistente |

### DNS / URL do QR Code

**URL padrão `*.onrender.com`:** não precisa configurar nada. A Render injeta `RENDER_EXTERNAL_URL` e o QR Code já sai certo com HTTPS.

**Domínio customizado** (ex: `fotos.casamento.com.br`):

1. Na Render: **Settings** → **Custom Domains** → adicione o domínio e configure o DNS (CNAME).
2. No painel: **Environment** → adicione:
   ```
   PUBLIC_URL=https://fotos.casamento.com.br
   ```
   (sem barra no final)
3. Redeploy.

O app prioriza: `PUBLIC_URL` → `RENDER_EXTERNAL_URL` → headers da requisição.

**Não defina** `RENDER_EXTERNAL_URL` manualmente no painel — a Render cuida disso.
