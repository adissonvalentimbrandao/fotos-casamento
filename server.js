const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const sqlite3 = require('sqlite3').verbose();
const QRCode = require('qrcode');

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const DATA_DIR = process.env.DATA_DIR || __dirname;

const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const DB_PATH = path.join(DATA_DIR, 'database.sqlite');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Render / proxies reversos — HTTPS correto no QR Code
app.set('trust proxy', 1);

const db = new sqlite3.Database(DB_PATH);

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT,
      image_path TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext.toLowerCase())
      ? ext.toLowerCase()
      : '.jpg';
    cb(null, `${req.params.token}-${Date.now()}${safeExt}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Apenas imagens são permitidas'));
    }
  },
});

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

function normalizeUrl(url) {
  return url.replace(/\/$/, '');
}

/**
 * URL pública usada no QR Code e links de captura.
 * Prioridade: PUBLIC_URL (domínio custom) → RENDER_EXTERNAL_URL (auto Render) → headers da requisição
 */
function getBaseUrl(req) {
  if (process.env.PUBLIC_URL) {
    return normalizeUrl(process.env.PUBLIC_URL);
  }
  if (process.env.RENDER_EXTERNAL_URL) {
    return normalizeUrl(process.env.RENDER_EXTERNAL_URL);
  }
  const proto = req.get('x-forwarded-proto') || req.protocol;
  const host = req.get('x-forwarded-host') || req.get('host');
  return `${proto}://${host}`;
}

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(UPLOADS_DIR));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/network-info', (req, res) => {
  const ip = getLocalIp();
  const baseUrl = getBaseUrl(req);
  const isRender = Boolean(process.env.RENDER);

  res.json({
    ip,
    port: PORT,
    baseUrl,
    publicUrl: baseUrl,
    localUrl: `http://${ip}:${PORT}`,
    isProduction: IS_PRODUCTION,
    isRender,
    isLocalNetwork: !isRender && !IS_PRODUCTION,
  });
});

app.get('/api/session', async (req, res) => {
  try {
    const token = String(Date.now());
    const baseUrl = getBaseUrl(req);
    const captureUrl = `${baseUrl}/capture/${token}`;
    const qrDataUrl = await QRCode.toDataURL(captureUrl, {
      width: 320,
      margin: 2,
      color: { dark: '#0f172a', light: '#ffffff' },
    });

    res.json({ token, captureUrl, qrDataUrl, baseUrl });
  } catch {
    res.status(500).json({ error: 'Erro ao gerar sessão' });
  }
});

app.get('/api/qrcode/:token', async (req, res) => {
  try {
    const captureUrl = `${getBaseUrl(req)}/capture/${req.params.token}`;
    const qrDataUrl = await QRCode.toDataURL(captureUrl, { width: 320, margin: 2 });
    res.json({ captureUrl, qrDataUrl });
  } catch {
    res.status(500).json({ error: 'Erro ao gerar QR Code' });
  }
});

app.post('/api/upload/:token', upload.single('photo'), (req, res) => {
  const { token } = req.params;

  if (!req.file) {
    return res.status(400).json({ error: 'Nenhuma imagem enviada' });
  }

  const imagePath = `/uploads/${req.file.filename}`;

  db.run(
    'INSERT INTO photos (token, image_path) VALUES (?, ?)',
    [token, imagePath],
    function onInsert(err) {
      if (err) {
        fs.unlink(path.join(UPLOADS_DIR, req.file.filename), () => {});
        return res.status(500).json({ error: 'Erro ao salvar no banco' });
      }

      res.json({
        success: true,
        id: this.lastID,
        token,
        imagePath,
        message: 'Foto enviada! Obrigado por compartilhar este momento.',
      });
    }
  );
});

app.get('/api/photos', (_req, res) => {
  db.all('SELECT * FROM photos ORDER BY created_at DESC', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Erro ao buscar fotos' });
    }
    res.json(rows);
  });
});

app.get('/capture/:token', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'capture.html'));
});

app.get('/admin', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.message });
  }
  if (err) {
    return res.status(400).json({ error: err.message || 'Erro no servidor' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  const ip = getLocalIp();
  console.log('');
  console.log('  Fotos Casamento — servidor rodando');
  console.log('  ---------------------------------');
  console.log(`  Porta:    ${PORT}`);
  console.log(`  Local:    http://localhost:${PORT}`);
  const publicUrl = process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL;
  if (publicUrl) {
    console.log(`  Público:  ${normalizeUrl(publicUrl)}`);
  } else {
    console.log(`  Rede:     http://${ip}:${PORT}`);
  }
  console.log(`  Admin:    /admin`);
  console.log(`  Dados:    ${DATA_DIR}`);
  console.log('');
});
