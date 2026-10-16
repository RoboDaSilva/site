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
const INDEX_HTML_FILE = path.join(__dirname, 'index.html');

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

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const META_SEPARATOR = '\n<!--LEVEL_META:';
const META_END = '-->';

function unpackServerProject(p, settings) {
  let rawDesc = p.desc || '';
  let embedded = {};
  const sepIdx = rawDesc.indexOf(META_SEPARATOR);
  if (sepIdx !== -1) {
    const endIdx = rawDesc.indexOf(META_END, sepIdx);
    if (endIdx !== -1) {
      try {
        embedded = JSON.parse(rawDesc.slice(sepIdx + META_SEPARATOR.length, endIdx));
      } catch (e) {}
    }
    rawDesc = rawDesc.slice(0, sepIdx).trim();
  }
  const metaMap = (settings && settings.projectMeta) ? settings.projectMeta : {};
  const extra = metaMap[p.id] || {};

  return {
    ...p,
    cleanDesc: rawDesc,
    area: p.area || extra.area || embedded.area || '',
    bedrooms: p.bedrooms || extra.bedrooms || embedded.bedrooms || '',
    garage: p.garage || extra.garage || embedded.garage || '',
    status: p.status || extra.status || embedded.status || 'Projeto Exclusivo',
    videoUrl: p.videoUrl || extra.videoUrl || embedded.videoUrl || '',
    visible: p.visible !== undefined ? p.visible : (extra.visible !== undefined ? extra.visible : (embedded.visible !== false)),
    order: typeof p.order === 'number' ? p.order : (typeof extra.order === 'number' ? extra.order : (typeof embedded.order === 'number' ? embedded.order : 9999))
  };
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
  whatsapp: 'https://wa.me/5544998641000',
  whatsappEnabled: true,
  whatsappMsg: 'Olá! Encontrei a construtora no Google, gostaria de mais informações.',
  address: 'Avenida Centenário 520, Maringá - PR',
  projectMeta: {},
  hasLogo: fs.existsSync(path.join(IMAGES_DIR, 'logo.png')),
  logoMimeType: 'image/png',
  logoDataBase64: null,
  logoUpdatedAt: Date.now(),
  hasFavicon: fs.existsSync(path.join(IMAGES_DIR, 'favicon.png')),
  faviconMimeType: 'image/png',
  faviconDataBase64: null,
  faviconUpdatedAt: Date.now()
};

if (!fs.existsSync(SETTINGS_FILE)) {
  writeJsonSafe(SETTINGS_FILE, DEFAULT_SETTINGS);
}

function getValidProjects() {
  const projects = readJsonSafe(DATA_FILE, []);
  if (!Array.isArray(projects)) return [];
  return projects.filter(p => {
    const facades = p.facades || (p.facade ? [p.facade] : []);
    if (facades.length === 0) return false;
    const firstImg = path.join(IMAGES_DIR, path.basename(facades[0]));
    return fs.existsSync(firstImg);
  });
}

function cleanGhostProjects() {
  const projects = readJsonSafe(DATA_FILE, []);
  if (!Array.isArray(projects)) {
    writeJsonSafe(DATA_FILE, []);
    return;
  }
  const validProjects = getValidProjects();
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

app.get('/images/favicon.png', (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');

  const settings = readJsonSafe(SETTINGS_FILE, DEFAULT_SETTINGS);

  if (settings.hasFavicon !== false) {
    if (settings.faviconDataBase64) {
      const imgBuffer = Buffer.from(settings.faviconDataBase64, 'base64');
      res.set('Content-Type', settings.faviconMimeType || 'image/png');
      return res.send(imgBuffer);
    }

    const diskFavicon = path.join(IMAGES_DIR, 'favicon.png');
    if (fs.existsSync(diskFavicon)) {
      return res.sendFile(diskFavicon);
    }
  }

  // Fallback para a logo caso nenhum favicon personalizado esteja definido
  if (settings.hasLogo !== false) {
    if (settings.logoDataBase64) {
      const imgBuffer = Buffer.from(settings.logoDataBase64, 'base64');
      res.set('Content-Type', settings.logoMimeType || 'image/png');
      return res.send(imgBuffer);
    }
    const diskLogo = path.join(IMAGES_DIR, 'logo.png');
    if (fs.existsSync(diskLogo)) {
      return res.sendFile(diskLogo);
    }
  }

  return res.status(404).end();
});

// Cache agressivo para imagens imutáveis de projetos (30 dias)
app.use('/images', express.static(IMAGES_DIR, {
  maxAge: '30d',
  immutable: true
}));

/* ==========================================================================
   SEO, AEO (/llms.txt), SITEMAP & DYNAMIC SSR INJECTION
   ========================================================================== */
app.get('/robots.txt', (req, res) => {
  res.type('text/plain');
  res.send(
`User-agent: *
Allow: /
Disallow: /admin.html
Disallow: /api/

Sitemap: https://levelconstrutora.com/sitemap.xml
`
  );
});

app.get('/sitemap.xml', (req, res) => {
  const settings = readJsonSafe(SETTINGS_FILE, DEFAULT_SETTINGS);
  const validProjects = getValidProjects()
    .map(p => unpackServerProject(p, settings))
    .filter(p => p.visible !== false)
    .sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999));

  const urls = [
    `  <url>
    <loc>https://levelconstrutora.com/</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>`
  ];

  validProjects.forEach(p => {
    urls.push(
`  <url>
    <loc>https://levelconstrutora.com/?projeto=${encodeURIComponent(p.id)}</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>`
    );
  });

  res.type('application/xml');
  res.send(
`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`
  );
});

app.get('/llms.txt', (req, res) => {
  const settings = readJsonSafe(SETTINGS_FILE, DEFAULT_SETTINGS);
  const validProjects = getValidProjects()
    .map(p => unpackServerProject(p, settings))
    .filter(p => p.visible !== false)
    .sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999));

  const lines = [
    '# Level Construtora — Arquitetura, Engenharia Civil e Obras em Maringá - PR',
    '',
    '> Escritório de arquitetura, engenharia civil e construtora especializada em casas térreas, sobrados de alto padrão, casas geminadas e obras residenciais em Maringá e Região Metropolitana (Sarandi, Marialva, Paiçandu).',
    '',
    '## Informações de Contato e Localização',
    `- Endereço: ${settings.address || 'Avenida Centenário, 520, Maringá - PR'}`,
    `- Site Oficial: https://levelconstrutora.com/`,
    `- Serviços: Projetos Arquitetônicos 3D, Projetos Estruturais, Elétricos, Hidrossanitários e Execução Completa de Obras (Turnkey).`,
    '',
    '## Catálogo de Projetos Recentes'
  ];

  if (validProjects.length === 0) {
    lines.push('- Portfólio personalizado para terrenos de 10x25m, 12x25m, 12x30m, 15x30m e lotes em condomínios fechados em Maringá.');
  } else {
    validProjects.forEach(p => {
      const specs = [
        p.houseType ? `Tipologia: ${p.houseType}` : null,
        p.lotSize ? `Lote: ${p.lotSize}` : null,
        p.area ? `Área: ${p.area}` : null,
        p.bedrooms ? `Quartos: ${p.bedrooms}` : null,
        p.garage ? `Garagem: ${p.garage}` : null,
        p.status ? `Status: ${p.status}` : null
      ].filter(Boolean).join(' | ');
      lines.push(`### ${p.title || 'Projeto Residencial'} (${p.subtitle || 'Maringá - PR'})`);
      if (specs) lines.push(`- Especificações: ${specs}`);
      if (p.cleanDesc) lines.push(`- Descrição: ${p.cleanDesc}`);
      lines.push(`- Link Direto: https://levelconstrutora.com/?projeto=${encodeURIComponent(p.id)}`);
      lines.push('');
    });
  }

  res.type('text/plain; charset=utf-8');
  res.send(lines.join('\n'));
});

function renderIndexHtml(req, res) {
  try {
    let html = fs.readFileSync(INDEX_HTML_FILE, 'utf8');
    const settings = readJsonSafe(SETTINGS_FILE, DEFAULT_SETTINGS);
    const validProjects = getValidProjects()
      .map(p => unpackServerProject(p, settings))
      .filter(p => p.visible !== false)
      .sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999));

    // 1. Injeção Semântica de Projetos para Googlebot e Motores de Busca de IA
    if (validProjects.length > 0) {
      const articlesHtml = validProjects.map(p => {
        const firstFacade = (p.facades && p.facades[0]) ? p.facades[0] : (p.facade || '');
        return `<article>
          <h4>${escapeHtml(p.title)} - ${escapeHtml(p.houseType || 'Residencial')} (${escapeHtml(p.subtitle || 'Maringá - PR')})</h4>
          <p>Lote: ${escapeHtml(p.lotSize || 'Sob consulta')} | Área Construída: ${escapeHtml(p.area || 'Sob consulta')} | ${escapeHtml(p.bedrooms || '')} | ${escapeHtml(p.garage || '')}</p>
          <p>${escapeHtml(p.cleanDesc || '')}</p>
          ${firstFacade ? `<img src="${escapeHtml(firstFacade)}" alt="${escapeHtml(p.title)} - Fachada 3D Level Construtora" />` : ''}
        </article>`;
      }).join('\n');

      html = html.replace('<!--SSR_PORTFOLIO_CATALOG-->', articlesHtml);

      const itemListSchema = {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        'name': 'Portfólio de Projetos Arquitetônicos e Obras - Level Construtora',
        'itemListElement': validProjects.map((p, idx) => ({
          '@type': 'ListItem',
          'position': idx + 1,
          'name': p.title || `Projeto ${idx + 1}`,
          'description': p.cleanDesc || `${p.houseType || 'Projeto'} para lote ${p.lotSize || ''}`,
          'url': `https://levelconstrutora.com/?projeto=${encodeURIComponent(p.id)}`
        }))
      };
      html = html.replace(
        '<!--SSR_DYNAMIC_SCHEMA-->',
        `<script type="application/ld+json">${JSON.stringify(itemListSchema)}</script>`
      );
    }

    // 2. Open Graph Dinâmico quando um projeto específico é compartilhado (?projeto=ID)
    const targetProjectId = req.query && req.query.projeto ? String(req.query.projeto) : null;
    if (targetProjectId) {
      const targetProj = validProjects.find(p => String(p.id) === targetProjectId);
      if (targetProj) {
        const ogTitle = `${targetProj.title} | ${targetProj.houseType || 'Projeto'} (${targetProj.lotSize || 'Level Construtora'})`;
        const ogDesc = targetProj.cleanDesc
          ? targetProj.cleanDesc.slice(0, 180)
          : `Conheça o projeto ${targetProj.title} (${targetProj.lotSize || ''}) desenvolvido pela Level Construtora em Maringá - PR.`;
        const firstFacade = (targetProj.facades && targetProj.facades[0]) ? targetProj.facades[0] : '/images/logo.png';
        const absoluteImg = firstFacade.startsWith('http')
          ? firstFacade
          : `https://levelconstrutora.com${firstFacade}`;
        const absoluteUrl = `https://levelconstrutora.com/?projeto=${encodeURIComponent(targetProj.id)}`;

        html = html
          .replace(/<title>.*?<\/title>/i, `<title>${escapeHtml(ogTitle)}</title>`)
          .replace(/<meta property="og:title" content=".*?" \/>/i, `<meta property="og:title" content="${escapeHtml(ogTitle)}" />`)
          .replace(/<meta property="og:description" content=".*?" \/>/i, `<meta property="og:description" content="${escapeHtml(ogDesc)}" />`)
          .replace(/<meta property="og:image" content=".*?" \/>/i, `<meta property="og:image" content="${escapeHtml(absoluteImg)}" />`)
          .replace(/<meta property="og:url" content=".*?" \/>/i, `<meta property="og:url" content="${escapeHtml(absoluteUrl)}" />`)
          .replace(/<meta name="twitter:title" content=".*?" \/>/i, `<meta name="twitter:title" content="${escapeHtml(ogTitle)}" />`)
          .replace(/<meta name="twitter:description" content=".*?" \/>/i, `<meta name="twitter:description" content="${escapeHtml(ogDesc)}" />`)
          .replace(/<meta name="twitter:image" content=".*?" \/>/i, `<meta name="twitter:image" content="${escapeHtml(absoluteImg)}" />`);
      }
    }

    res.set('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  } catch (err) {
    return res.sendFile(INDEX_HTML_FILE);
  }
}

app.get('/', renderIndexHtml);
app.get('/index.html', renderIndexHtml);
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

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

app.post('/api/favicon', requireAuth, upload.single('favicon'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Nenhum arquivo enviado' });
  }

  try {
    const fileBuffer = fs.readFileSync(req.file.path);
    const mimeType = req.file.mimetype || 'image/png';
    const targetPath = path.join(IMAGES_DIR, 'favicon.png');

    fs.writeFileSync(targetPath, fileBuffer);
    if (fs.existsSync(req.file.path) && req.file.path !== targetPath) {
      fs.unlinkSync(req.file.path);
    }

    const currentSettings = readJsonSafe(SETTINGS_FILE, DEFAULT_SETTINGS);
    const updatedSettings = {
      ...currentSettings,
      hasFavicon: true,
      faviconMimeType: mimeType,
      faviconDataBase64: fileBuffer.toString('base64'),
      faviconUpdatedAt: Date.now()
    };
    writeJsonSafe(SETTINGS_FILE, updatedSettings);

    return res.json({
      success: true,
      url: `/images/favicon.png?t=${updatedSettings.faviconUpdatedAt}`
    });
  } catch (err) {
    console.error('Erro ao salvar favicon:', err);
    return res.status(500).json({ error: 'Erro ao processar ícone' });
  }
});

app.delete('/api/favicon', requireAuth, (req, res) => {
  try {
    const targetPath = path.join(IMAGES_DIR, 'favicon.png');
    if (fs.existsSync(targetPath)) {
      fs.unlinkSync(targetPath);
    }

    const currentSettings = readJsonSafe(SETTINGS_FILE, DEFAULT_SETTINGS);
    const updatedSettings = {
      ...currentSettings,
      hasFavicon: false,
      faviconDataBase64: null,
      faviconUpdatedAt: Date.now()
    };
    writeJsonSafe(SETTINGS_FILE, updatedSettings);

    return res.json({ success: true });
  } catch (err) {
    console.error('Erro ao deletar favicon:', err);
    return res.status(500).json({ error: 'Erro ao remover ícone' });
  }
});

app.get('/api/settings', (req, res) => {
  const s = readJsonSafe(SETTINGS_FILE, DEFAULT_SETTINGS);
  const diskLogoExists = fs.existsSync(path.join(IMAGES_DIR, 'logo.png'));
  const hasLogo = s.hasLogo !== undefined ? Boolean(s.hasLogo) : diskLogoExists;
  const diskFaviconExists = fs.existsSync(path.join(IMAGES_DIR, 'favicon.png'));
  const hasFavicon = s.hasFavicon !== undefined ? Boolean(s.hasFavicon) : diskFaviconExists;

  res.json({
    instagram: s.instagram || '',
    instagramEnabled: toBool(s.instagramEnabled, true),
    facebook: s.facebook || '',
    facebookEnabled: toBool(s.facebookEnabled, true),
    youtube: s.youtube || '',
    youtubeEnabled: toBool(s.youtubeEnabled, true),
    whatsapp: s.whatsapp || '',
    whatsappEnabled: toBool(s.whatsappEnabled, true),
    whatsappMsg: s.whatsappMsg || 'Olá! Encontrei a construtora no Google, gostaria de mais informações.',
    address: s.address || 'Avenida Centenário 520, Maringá - PR',
    projectMeta: s.projectMeta || {},
    hasLogo,
    logoUpdatedAt: s.logoUpdatedAt || Date.now(),
    hasFavicon,
    faviconUpdatedAt: s.faviconUpdatedAt || Date.now()
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
    whatsappEnabled: toBool(body.whatsappEnabled, true),
    whatsappMsg: String(body.whatsappMsg || '').trim(),
    address: String(body.address || '').trim(),
    projectMeta: body.projectMeta || currentSettings.projectMeta || {}
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

  const validProjects = getValidProjects();
  res.json(validProjects);
});

app.post('/api/projects', requireAuth, upload.fields([
  { name: 'facades', maxCount: 10 },
  { name: 'plans', maxCount: 10 }
]), (req, res) => {
  try {
    const { title, subtitle, lotSize, houseType, desc, area, bedrooms, garage, status, videoUrl, visible, order } = req.body;
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
      area: (area || '').trim(),
      bedrooms: (bedrooms || '').trim(),
      garage: (garage || '').trim(),
      status: status || 'Projeto Exclusivo',
      videoUrl: (videoUrl || '').trim(),
      visible: toBool(visible, true),
      order: order !== undefined && !isNaN(Number(order)) ? Number(order) : 0,
      facades,
      plans
    };

    const projects = readJsonSafe(DATA_FILE, []);
    const list = Array.isArray(projects) ? projects : [];
    // Increment existing orders if new project is inserted at top
    list.forEach((p, idx) => {
      if (typeof p.order !== 'number') p.order = idx + 1;
      else p.order += 1;
    });
    list.unshift(newProject);
    writeJsonSafe(DATA_FILE, list);

    res.json({ success: true, project: newProject });
  } catch (err) {
    console.error('Erro ao adicionar projeto:', err);
    res.status(500).json({ error: 'Falha ao salvar projeto' });
  }
});

// Rota dedicada PUT /api/projects/:id (atualiza sem precisar re-enviar imagens existentes)
app.put('/api/projects/:id', requireAuth, upload.fields([
  { name: 'facades', maxCount: 10 },
  { name: 'plans', maxCount: 10 }
]), (req, res) => {
  try {
    const targetId = String(req.params.id);
    const projects = readJsonSafe(DATA_FILE, []);
    const list = Array.isArray(projects) ? projects : [];
    const idx = list.findIndex(p => String(p.id) === targetId);

    if (idx === -1) {
      return res.status(404).json({ error: 'Projeto não encontrado' });
    }

    const existing = list[idx];
    const { title, subtitle, lotSize, houseType, desc, area, bedrooms, garage, status, videoUrl, visible, order } = req.body;

    const uploadedFacades = (req.files && req.files['facades'] && req.files['facades'].length > 0)
      ? req.files['facades'].map(f => `/images/${f.filename}`)
      : null;

    const uploadedPlans = (req.files && req.files['plans'] && req.files['plans'].length > 0)
      ? req.files['plans'].map(f => `/images/${f.filename}`)
      : null;

    // Remove arquivos antigos do disco somente se novas imagens foram enviadas para substituí-las
    if (uploadedFacades) {
      const oldFacades = existing.facades || (existing.facade ? [existing.facade] : []);
      oldFacades.forEach(fPath => {
        const fullP = path.join(IMAGES_DIR, path.basename(fPath));
        if (fs.existsSync(fullP)) {
          try { fs.unlinkSync(fullP); } catch (e) {}
        }
      });
    }

    if (uploadedPlans) {
      const oldPlans = existing.plans || (existing.plan ? [existing.plan] : []);
      oldPlans.forEach(fPath => {
        const fullP = path.join(IMAGES_DIR, path.basename(fPath));
        if (fs.existsSync(fullP)) {
          try { fs.unlinkSync(fullP); } catch (e) {}
        }
      });
    }

    const updatedProject = {
      ...existing,
      title: title !== undefined ? String(title).trim() : existing.title,
      subtitle: subtitle !== undefined ? String(subtitle).trim() : existing.subtitle,
      lotSize: lotSize !== undefined ? String(lotSize).trim() : existing.lotSize,
      houseType: houseType !== undefined ? houseType : existing.houseType,
      desc: desc !== undefined ? String(desc).trim() : existing.desc,
      area: area !== undefined ? String(area).trim() : (existing.area || ''),
      bedrooms: bedrooms !== undefined ? String(bedrooms).trim() : (existing.bedrooms || ''),
      garage: garage !== undefined ? String(garage).trim() : (existing.garage || ''),
      status: status !== undefined ? status : (existing.status || 'Projeto Exclusivo'),
      videoUrl: videoUrl !== undefined ? String(videoUrl).trim() : (existing.videoUrl || ''),
      visible: visible !== undefined ? toBool(visible, true) : (existing.visible !== false),
      order: order !== undefined && !isNaN(Number(order)) ? Number(order) : (typeof existing.order === 'number' ? existing.order : idx),
      facades: uploadedFacades || existing.facades || (existing.facade ? [existing.facade] : []),
      plans: uploadedPlans || existing.plans || (existing.plan ? [existing.plan] : [])
    };

    list[idx] = updatedProject;
    writeJsonSafe(DATA_FILE, list);

    res.json({ success: true, project: updatedProject });
  } catch (err) {
    console.error('Erro ao atualizar projeto:', err);
    res.status(500).json({ error: 'Falha ao atualizar projeto' });
  }
});

// Rota dedicada para reordenar projetos e definir qual fica no centro da Galeria 3D (index 0)
app.post('/api/projects/reorder', requireAuth, (req, res) => {
  try {
    const { orderedIds } = req.body || {};
    if (!Array.isArray(orderedIds)) {
      return res.status(400).json({ error: 'Lista de IDs inválida' });
    }

    const projects = readJsonSafe(DATA_FILE, []);
    const list = Array.isArray(projects) ? projects : [];
    const orderMap = new Map();
    orderedIds.forEach((id, index) => orderMap.set(String(id), index));

    const updatedList = list
      .map((p, fallbackIdx) => {
        const newOrder = orderMap.has(String(p.id)) ? orderMap.get(String(p.id)) : (1000 + fallbackIdx);
        return { ...p, order: newOrder };
      })
      .sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999));

    writeJsonSafe(DATA_FILE, updatedList);
    res.json({ success: true });
  } catch (err) {
    console.error('Erro ao reordenar projetos:', err);
    res.status(500).json({ error: 'Falha ao salvar ordem dos projetos' });
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
