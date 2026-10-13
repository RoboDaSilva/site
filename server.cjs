require('./server.cjs');
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = 3000;

// Generate a random dynamic session token on startup
const SESSION_TOKEN = 'Bearer ' + crypto.randomUUID();

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Set up Multer for file storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = path.join(__dirname, 'public', 'images');
    if (!fs.existsSync(dir)){
        fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
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

// API Routes
// Authentication Middleware
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
    return JSON.parse(fs.readFileSync(pPath, 'utf8')).password;
  }
  return 'admin123'; // fallback
};

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
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  res.json(data);
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
    data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
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
    // Return default empty settings
    return res.json({ instagram: '', facebook: '', youtube: '', whatsapp: '' });
  }
  const data = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  res.json(data);
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

  let data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  const projectIndex = data.findIndex(p => p.id === projectId);

  if (projectIndex === -1) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const project = data[projectIndex];
  
  // Remove files from disk
  const filesToDelete = [...(project.facades || []), ...(project.plans || [])];
  filesToDelete.forEach(fileUrl => {
    // fileUrl is like /images/1234.jpg
    const filePath = path.join(__dirname, 'public', fileUrl);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        console.error('Error deleting file:', filePath, err);
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
