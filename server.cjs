const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 80;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

const IMAGES_DIR = path.join(__dirname, 'images');
const DATA_FILE = path.join(__dirname, 'data.json');
const PASSWORD_FILE = path.join(__dirname, 'password.json');
const SETTINGS_FILE = path.join(__dirname, 'settings.json');

if (!fs.existsSync(IMAGES_DIR)) {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

function readJsonSafe(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    return fallback;
  }
}

function writeJsonSafe(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function toBool(val, defaultVal = true) {
  if (typeof val === 'boolean') return val;
  if (val === 'true' || val === 1 || val === '1') return true;
  if (val === 'false' || val === 0 || val === '0') return false;
  return defaultVal;
}

if (!fs.existsSync(PASSWORD_FILE)) {
  writeJsonSafe(PASSWORD_FILE, { password: 'admin123' });
}

const DEFAULT_SETTINGS = {
  instagram: '',
  instagramEnabled: true,
  facebook: '',
  facebookEnabled: true,
  youtube: '',
  youtubeEnabled: true,
  whatsapp: '',
  whatsappEnabled: true,
  hasLogo: fs.existsSync(path.join(IMAGES_DIR, 'logo.png')),
  logoMimeType: 'image/png',
  logoDataBase64: null,
  logoUpdatedAt: Date.now()
};

if (!fs.existsSync(SETTINGS_FILE)) {
  writeJsonSafe(SETTINGS_FILE, DEFAULT_SETTINGS);
}

function cleanGhostProjects() {
  const projects = readJsonSafe(DATA_FILE, []);
  if (!Array.isArray(projects)) {
    writeJsonSafe(DATA_FILE, []);
    return;
  }
  const validProjects = projects.filter(p => {
    const facades = p.facades || (p.facade ? [p.facade] : []);
    if (facades.length === 0) return false;
    const firstImg = path.join(IMAGES_DIR, path.basename(facades[0]));
    return fs.existsSync(firstImg);
  });
  if (validProjects.length !== projects.length) {
    writeJsonSafe(DATA_FILE, validProjects);
  }
}
cleanGhostProjects();

app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

app.get('/images/logo.png', (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');

  const settings = readJsonSafe(SETTINGS_FILE, DEFAULT_SETTINGS);
  if (settings.hasLogo === false) {
    return res.status(404).end();
  }

  if (settings.logoDataBase64) {
    const imgBuffer = Buffer.from(settings.logoDataBase64, 'base64');
    res.set('Content-Type', settings.logoMimeType || 'image/png');
    return res.send(imgBuffer);
  }

  const diskLogo = path.join(IMAGES_DIR, 'logo.png');
  if (fs.existsSync(diskLogo)) {
    return res.sendFile(diskLogo);
  }

  return res.status(404).end();
});

app.use('/images', express.static(IMAGES_DIR));
app.use(express.static(__dirname));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, IMAGES_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.png';
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  }
});
const upload = multer({ storage });

function getAdminPassword() {
  const data = readJsonSafe(PASSWORD_FILE, { password: 'admin123' });
  return String(data.password || 'admin123');
}

function generateToken(password) {
  return crypto
    .createHmac('sha256', 'level-construtora-auth-secret-key')
    .update(String(password))
    .digest('hex');
}

function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ error: 'Token ausente' });
  }
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  const expectedToken = generateToken(getAdminPassword());

  if (!token || token !== expectedToken) {
    return res.status(403).json({ error: 'Sessão inválida ou expirada' });
  }
  next();
}

app.post('/api/login', (req, res) => {
  const { password } = req.body || {};
  const currentPassword = getAdminPassword();
  if (password === currentPassword) {
    return res.json({ token: generateToken(currentPassword) });
  }
  return res.status(401).json({ error: 'Senha incorreta' });
});

app.get('/api/auth/verify', requireAuth, (req, res) => {
  res.json({ valid: true });
});

app.post('/api/password', requireAuth, (req, res) => {
  const { newPassword } = req.body || {};
  if (!newPassword || typeof newPassword !== 'string' || !newPassword.trim()) {
    return res.status(400).json({ error: 'Nova senha inválida' });
  }
  const cleanPass = newPassword.trim();
  writeJsonSafe(PASSWORD_FILE, { password: cleanPass });
  res.json({ success: true, token: generateToken(cleanPass) });
});

app.post('/api/logo', requireAuth, upload.single('logo'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Nenhum arquivo enviado' });
  }

  try {
    const fileBuffer = fs.readFileSync(req.file.path);
    const mimeType = req.file.mimetype || 'image/png';
    const targetPath = path.join(IMAGES_DIR, 'logo.png');

    fs.writeFileSync(targetPath, fileBuffer);
    if (fs.existsSync(req.file.path) && req.file.path !== targetPath) {
      fs.unlinkSync(req.file.path);
    }

    const currentSettings = readJsonSafe(SETTINGS_FILE, DEFAULT_SETTINGS);
    const updatedSettings = {
      ...currentSettings,
      hasLogo: true,
      logoMimeType: mimeType,
      logoDataBase64: fileBuffer.toString('base64'),
      logoUpdatedAt: Date.now()
    };
    writeJsonSafe(SETTINGS_FILE, updatedSettings);

    return res.json({
      success: true,
      url: `/images/logo.png?t=${updatedSettings.logoUpdatedAt}`
    });
  } catch (err) {
    console.error('Erro ao salvar logo:', err);
    return res.status(500).json({ error: 'Erro ao processar imagem' });
  }
});

app.delete('/api/logo', requireAuth, (req, res) => {
  try {
    const targetPath = path.join(IMAGES_DIR, 'logo.png');
    if (fs.existsSync(targetPath)) {
      fs.unlinkSync(targetPath);
    }

    const currentSettings = readJsonSafe(SETTINGS_FILE, DEFAULT_SETTINGS);
    const updatedSettings = {
      ...currentSettings,
      hasLogo: false,
      logoDataBase64: null,
      logoUpdatedAt: Date.now()
    };
    writeJsonSafe(SETTINGS_FILE, updatedSettings);

    return res.json({ success: true });
  } catch (err) {
    console.error('Erro ao deletar logo:', err);
    return res.status(500).json({ error: 'Erro ao remover logo' });
  }
});

app.get('/api/settings', (req, res) => {
  const s = readJsonSafe(SETTINGS_FILE, DEFAULT_SETTINGS);
  const diskLogoExists = fs.existsSync(path.join(IMAGES_DIR, 'logo.png'));
  const hasLogo = s.hasLogo !== undefined ? Boolean(s.hasLogo) : diskLogoExists;

  res.json({
    instagram: s.instagram || '',
    instagramEnabled: toBool(s.instagramEnabled, true),
    facebook: s.facebook || '',
    facebookEnabled: toBool(s.facebookEnabled, true),
    youtube: s.youtube || '',
    youtubeEnabled: toBool(s.youtubeEnabled, true),
    whatsapp: s.whatsapp || '',
    whatsappEnabled: toBool(s.whatsappEnabled, true),
    hasLogo,
    logoUpdatedAt: s.logoUpdatedAt || Date.now()
  });
});

app.post('/api/settings', requireAuth, (req, res) => {
  const body = req.body || {};
  const currentSettings = readJsonSafe(SETTINGS_FILE, DEFAULT_SETTINGS);

  const updatedSettings = {
    ...currentSettings,
    instagram: String(body.instagram || '').trim(),
    instagramEnabled: toBool(body.instagramEnabled, true),
    facebook: String(body.facebook || '').trim(),
    facebookEnabled: toBool(body.facebookEnabled, true),
    youtube: String(body.youtube || '').trim(),
    youtubeEnabled: toBool(body.youtubeEnabled, true),
    whatsapp: String(body.whatsapp || '').trim(),
    whatsappEnabled: toBool(body.whatsappEnabled, true)
  };

  writeJsonSafe(SETTINGS_FILE, updatedSettings);
  res.json({ success: true, settings: updatedSettings });
});

app.get('/api/projects', (req, res) => {
  const projects = readJsonSafe(DATA_FILE, []);
  if (!Array.isArray(projects)) return res.json([]);

  if (req.query.all === 'true') {
    return res.json(projects);
  }

  const validProjects = projects.filter(p => {
    const facades = p.facades || (p.facade ? [p.facade] : []);
    if (facades.length === 0) return false;
    const fileOnDisk = path.join(IMAGES_DIR, path.basename(facades[0]));
    return fs.existsSync(fileOnDisk);
  });

  res.json(validProjects);
});

app.post('/api/projects', requireAuth, upload.fields([
  { name: 'facades', maxCount: 10 },
  { name: 'plans', maxCount: 10 }
]), (req, res) => {
  try {
    const { title, subtitle, lotSize, houseType, desc } = req.body;
    const facades = (req.files && req.files['facades'])
      ? req.files['facades'].map(f => `/images/${f.filename}`)
      : [];
    const plans = (req.files && req.files['plans'])
      ? req.files['plans'].map(f => `/images/${f.filename}`)
      : [];

    const newProject = {
      id: Date.now(),
      title: (title || '').trim(),
      subtitle: (subtitle || '').trim(),
      lotSize: (lotSize || '').trim(),
      houseType: houseType || 'Térrea',
      desc: (desc || '').trim(),
      facades,
      plans
    };

    const projects = readJsonSafe(DATA_FILE, []);
    const list = Array.isArray(projects) ? projects : [];
    list.unshift(newProject);
    writeJsonSafe(DATA_FILE, list);

    res.json({ success: true, project: newProject });
  } catch (err) {
    console.error('Erro ao adicionar projeto:', err);
    res.status(500).json({ error: 'Falha ao salvar projeto' });
  }
});

app.delete('/api/projects/:id', requireAuth, (req, res) => {
  try {
    const targetId = String(req.params.id);
    let projects = readJsonSafe(DATA_FILE, []);
    if (!Array.isArray(projects)) projects = [];

    const projToDelete = projects.find(p => String(p.id) === targetId);
    if (projToDelete) {
      const files = [...(projToDelete.facades || []), ...(projToDelete.plans || [])];
      files.forEach(fPath => {
        const fullP = path.join(IMAGES_DIR, path.basename(fPath));
        if (fs.existsSync(fullP)) {
          try { fs.unlinkSync(fullP); } catch (e) {}
        }
      });
    }

    const updated = projects.filter(p => String(p.id) !== targetId);
    writeJsonSafe(DATA_FILE, updated);

    res.json({ success: true });
  } catch (err) {
    console.error('Erro ao excluir projeto:', err);
    res.status(500).json({ error: 'Falha ao excluir projeto' });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor Level Construtora rodando na porta ${PORT}`);
});
