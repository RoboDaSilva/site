const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 80;

app.use(cors());
app.use(express.json());

// Ensure essential folders exist
const IMAGES_DIR = path.join(__dirname, 'images');
const DATA_FILE = path.join(__dirname, 'data.json');
const PASSWORD_FILE = path.join(__dirname, 'password.json');
const SETTINGS_FILE = path.join(__dirname, 'settings.json');

if (!fs.existsSync(IMAGES_DIR)) {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
}
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, '[]', 'utf8');
}
if (!fs.existsSync(PASSWORD_FILE)) {
  fs.writeFileSync(PASSWORD_FILE, JSON.stringify({ password: 'admin' }, null, 2), 'utf8');
}
if (!fs.existsSync(SETTINGS_FILE)) {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify({
    instagram: '',
    instagramEnabled: true,
    facebook: '',
    facebookEnabled: true,
    youtube: '',
    youtubeEnabled: true,
    whatsapp: '',
    whatsappEnabled: true
  }, null, 2), 'utf8');
}

// Serve static images directly
app.use('/images', express.static(IMAGES_DIR));

// Serve root static files (index.html, admin.html, main.js, style.css, etc.)
app.use(express.static(__dirname));

// Multer storage configuration for uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, IMAGES_DIR);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname) || '.png';
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + ext);
  }
});
const upload = multer({ storage });

// In-memory active tokens (valid while server runs)
const validTokens = new Set();

function getAdminPassword() {
  try {
    const data = JSON.parse(fs.readFileSync(PASSWORD_FILE, 'utf8'));
    return data.password || 'admin';
  } catch (err) {
    return 'admin';
  }
}

// Authentication middleware
function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ error: 'Token de autenticação ausente' });
  }
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token || !validTokens.has(token)) {
    return res.status(403).json({ error: 'Sessão inválida ou expirada' });
  }
  next();
}

// --- AUTH ROUTES ---
app.post('/api/login', (req, res) => {
  const { password } = req.body || {};
  const currentPassword = getAdminPassword();
  if (password === currentPassword) {
    const token = crypto.randomBytes(32).toString('hex');
    validTokens.add(token);
    return res.json({ token });
  }
  return res.status(401).json({ error: 'Senha incorreta' });
});

app.post('/api/password', requireAuth, (req, res) => {
  const { newPassword } = req.body || {};
  if (!newPassword || typeof newPassword !== 'string' || newPassword.trim().length === 0) {
    return res.status(400).json({ error: 'Nova senha inválida' });
  }
  fs.writeFileSync(PASSWORD_FILE, JSON.stringify({ password: newPassword }, null, 2), 'utf8');
  res.json({ success: true });
});

// --- LOGO ROUTES ---
// Upload / Replace logo.png
app.post('/api/logo', requireAuth, upload.single('logo'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Nenhum arquivo enviado' });
  }

  const targetPath = path.join(IMAGES_DIR, 'logo.png');

  try {
    fs.copyFileSync(req.file.path, targetPath);
    if (fs.existsSync(req.file.path) && req.file.path !== targetPath) {
      fs.unlinkSync(req.file.path);
    }
    return res.json({ success: true, url: '/images/logo.png' });
  } catch (err) {
    console.error('Erro ao salvar logo:', err);
    return res.status(500).json({ error: 'Erro ao processar imagem' });
  }
});

// Delete logo.png
app.delete('/api/logo', requireAuth, (req, res) => {
  const targetPath = path.join(IMAGES_DIR, 'logo.png');
  try {
    if (fs.existsSync(targetPath)) {
      fs.unlinkSync(targetPath);
    }
    return res.json({ success: true });
  } catch (err) {
    console.error('Erro ao deletar logo:', err);
    return res.status(500).json({ error: 'Erro ao deletar imagem' });
  }
});

// --- SETTINGS (REDES SOCIAIS) ROUTES ---
app.get('/api/settings', (req, res) => {
  try {
    const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    res.json(settings);
  } catch (err) {
    res.json({
      instagram: '',
      instagramEnabled: true,
      facebook: '',
      facebookEnabled: true,
      youtube: '',
      youtubeEnabled: true,
      whatsapp: '',
      whatsappEnabled: true
    });
  }
});

app.post('/api/settings', requireAuth, (req, res) => {
  const { 
    instagram, instagramEnabled, 
    facebook, facebookEnabled, 
    youtube, youtubeEnabled, 
    whatsapp, whatsappEnabled 
  } = req.body || {};

  const settings = {
    instagram: instagram || '',
    instagramEnabled: instagramEnabled !== false,
    facebook: facebook || '',
    facebookEnabled: facebookEnabled !== false,
    youtube: youtube || '',
    youtubeEnabled: youtubeEnabled !== false,
    whatsapp: whatsapp || '',
    whatsappEnabled: whatsappEnabled !== false
  };

  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
  res.json({ success: true, settings });
});

// --- PROJECTS ROUTES ---
app.get('/api/projects', (req, res) => {
  try {
    const projects = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    res.json(projects);
  } catch (err) {
    res.json([]);
  }
});

app.post('/api/projects', requireAuth, upload.fields([
  { name: 'facades', maxCount: 10 },
  { name: 'plans', maxCount: 10 }
]), (req, res) => {
  try {
    const { title, subtitle, lotSize, houseType, desc } = req.body;
    const facades = (req.files && req.files['facades']) ? req.files['facades'].map(f => `/images/${f.filename}`) : [];
    const plans = (req.files && req.files['plans']) ? req.files['plans'].map(f => `/images/${f.filename}`) : [];

    const newProject = {
      id: Date.now(),
      title: title || '',
      subtitle: subtitle || '',
      lotSize: lotSize || '',
      houseType: houseType || '',
      desc: desc || '',
      facades,
      plans
    };

    let projects = [];
    if (fs.existsSync(DATA_FILE)) {
      projects = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
    projects.unshift(newProject);
    fs.writeFileSync(DATA_FILE, JSON.stringify(projects, null, 2), 'utf8');

    res.json({ success: true, project: newProject });
  } catch (err) {
    console.error('Erro ao adicionar projeto:', err);
    res.status(500).json({ error: 'Falha ao salvar projeto' });
  }
});

app.delete('/api/projects/:id', requireAuth, (req, res) => {
  try {
    const id = Number(req.params.id);
    let projects = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    
    const projToDelete = projects.find(p => p.id === id);
    if (projToDelete) {
      const files = [...(projToDelete.facades || []), ...(projToDelete.plans || [])];
      files.forEach(fPath => {
        const basename = path.basename(fPath);
        const fullP = path.join(IMAGES_DIR, basename);
        if (fs.existsSync(fullP)) {
          try { fs.unlinkSync(fullP); } catch(e) {}
        }
      });
    }

    projects = projects.filter(p => p.id !== id);
    fs.writeFileSync(DATA_FILE, JSON.stringify(projects, null, 2), 'utf8');

    res.json({ success: true });
  } catch (err) {
    console.error('Erro ao excluir projeto:', err);
    res.status(500).json({ error: 'Falha ao excluir projeto' });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando com sucesso na porta ${PORT}`);
});
