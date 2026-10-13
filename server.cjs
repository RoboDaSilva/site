const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

// Token estável: não expira nem invalida a sessão após novos deploys ou reinicializações
const SESSION_TOKEN = process.env.ADMIN_SESSION_TOKEN || 'Bearer geminadas-adm-token-secret-2026';

// Diretório para armazenamento das imagens (fachadas e plantas)
const imagesDir = path.join(__dirname, 'images');
if (!fs.existsSync(imagesDir)) {
  fs.mkdirSync(imagesDir, { recursive: true });
}

// Middlewares
app.use(cors());
app.use(express.json());

// Servir arquivos estáticos da raiz (index.html, admin.html, styles, scripts)
app.use(express.static(__dirname));

// Servir as imagens carregadas via /images
app.use('/images', express.static(imagesDir));

// Rotas de páginas
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// Configuração do Multer para armazenamento de fotos
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, imagesDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPG, PNG and WEBP are allowed.'), false);
  }
};

const upload = multer({ storage: storage, fileFilter: fileFilter });

// Middleware de Autenticação
const requireAuth = (req, res, next) => {
  const token = req.headers.authorization;
  if (token === SESSION_TOKEN) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
};

const getPassword = () => {
  const pPath = path.join(__dirname, 'password.json');
  if (fs.existsSync(pPath)) {
    try {
      return JSON.parse(fs.readFileSync(pPath, 'utf8')).password;
    } catch (e) {
      console.error('Erro ao ler password.json:', e);
    }
  }
  return 'admin123'; // fallback
};

// --- ROTAS DA API ---

app.post('/api/login', (req, res) => {
  const { password } = req.body;
  if (password === getPassword()) {
    res.json({ token: SESSION_TOKEN.replace('Bearer ', '') });
  } else {
    res.status(401).json({ error: 'Invalid password' });
  }
});

app.post('/api/password', requireAuth, (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.trim() === '') {
    return res.status(400).json({ error: 'Invalid password' });
  }
  const pPath = path.join(__dirname, 'password.json');
  fs.writeFileSync(pPath, JSON.stringify({ password: newPassword }, null, 2));
  res.json({ success: true });
});

app.get('/api/projects', (req, res) => {
  const dataPath = path.join(__dirname, 'data.json');
  if (!fs.existsSync(dataPath)) {
    return res.json([]);
  }
  try {
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    res.json(data);
  } catch (e) {
    console.error('Erro ao ler data.json:', e);
    res.json([]);
  }
});

app.post('/api/projects', requireAuth, upload.fields([{ name: 'facades', maxCount: 5 }, { name: 'plans', maxCount: 3 }]), (req, res) => {
  const { title, subtitle, desc, lotSize, houseType } = req.body;
  const facadeFiles = req.files['facades'] || [];
  const planFiles = req.files['plans'] || [];

  if (facadeFiles.length === 0 || planFiles.length === 0 || !title || !subtitle || !desc || !lotSize || !houseType) {
    return res.status(400).json({ error: 'Missing required fields or files.' });
  }

  const dataPath = path.join(__dirname, 'data.json');
  let data = [];
  if (fs.existsSync(dataPath)) {
    try {
      data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    } catch (e) {
      data = [];
    }
  }

  const newProject = {
    id: Date.now(),
    title,
    subtitle,
    lotSize,
    houseType,
    desc,
    facades: facadeFiles.map(file => `/images/${file.filename}`),
    plans: planFiles.map(file => `/images/${file.filename}`)
  };

  data.push(newProject);
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));

  res.status(201).json(newProject);
});

app.get('/api/settings', (req, res) => {
  const settingsPath = path.join(__dirname, 'settings.json');
  if (!fs.existsSync(settingsPath)) {
    return res.json({ instagram: '', facebook: '', youtube: '', whatsapp: '' });
  }
  try {
    const data = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    res.json(data);
  } catch (e) {
    res.json({ instagram: '', facebook: '', youtube: '', whatsapp: '' });
  }
});

app.post('/api/settings', requireAuth, (req, res) => {
  const { instagram, facebook, youtube, whatsapp } = req.body;
  const settingsPath = path.join(__dirname, 'settings.json');
  
  const newSettings = {
    instagram: instagram || '',
    facebook: facebook || '',
    youtube: youtube || '',
    whatsapp: whatsapp || ''
  };

  fs.writeFileSync(settingsPath, JSON.stringify(newSettings, null, 2));
  res.json(newSettings);
});

app.delete('/api/projects/:id', requireAuth, (req, res) => {
  const projectId = parseInt(req.params.id);
  const dataPath = path.join(__dirname, 'data.json');
  
  if (!fs.existsSync(dataPath)) {
    return res.status(404).json({ error: 'No projects found' });
  }

  let data = [];
  try {
    data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  } catch (e) {
    return res.status(500).json({ error: 'Error reading database' });
  }

  const projectIndex = data.findIndex(p => p.id === projectId);
  if (projectIndex === -1) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const project = data[projectIndex];
  
  const filesToDelete = [...(project.facades || []), ...(project.plans || [])];
  filesToDelete.forEach(fileUrl => {
    const fileName = path.basename(fileUrl);
    const filePath = path.join(imagesDir, fileName);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        console.error('Erro ao deletar ficheiro:', filePath, err);
      }
    }
  });

  data.splice(projectIndex, 1);
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));

  res.json({ success: true, message: 'Project deleted' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
