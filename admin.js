const loginScreen = document.getElementById('login-screen');
const adminDashboard = document.getElementById('admin-dashboard');
const loginForm = document.getElementById('login-form');
const logoutBtn = document.getElementById('logout-btn');

const adminForm = document.getElementById('admin-form');
const formPanelTitle = document.getElementById('form-panel-title');
const editModeBanner = document.getElementById('edit-mode-banner');
const editModeText = document.getElementById('edit-mode-text');
const cancelEditBtn = document.getElementById('cancel-edit-btn');
const formProjectId = document.getElementById('form-project-id');

const formTitle = document.getElementById('form-title');
const formSubtitle = document.getElementById('form-subtitle');
const formLotFront = document.getElementById('form-lot-front');
const formLotDepth = document.getElementById('form-lot-depth');
const formLot = document.getElementById('form-lot');
const formType = document.getElementById('form-type');
const formArea = document.getElementById('form-area');
const formBedrooms = document.getElementById('form-bedrooms');
const formGarage = document.getElementById('form-garage');
const formStatus = document.getElementById('form-status');
const formVideo = document.getElementById('form-video');
const formVisible = document.getElementById('form-visible');
const formDesc = document.getElementById('form-desc');
const formFacade = document.getElementById('form-facade');
const formPlan = document.getElementById('form-plan');
const formCompressWebp = document.getElementById('form-compress-webp');
const facadeEditHint = document.getElementById('facade-edit-hint');
const planEditHint = document.getElementById('plan-edit-hint');

const submitAdminBtn = document.getElementById('submit-admin-btn');
const projectsListContainer = document.getElementById('projects-list-container');
const projectsCountBadge = document.getElementById('projects-count-badge');

const logoForm = document.getElementById('logo-form');
const formLogo = document.getElementById('form-logo');
const submitLogoBtn = document.getElementById('submit-logo-btn');
const deleteLogoBtn = document.getElementById('delete-logo-btn');
const currentLogoPreview = document.getElementById('current-logo-preview');
const noLogoText = document.getElementById('no-logo-text');

const settingsForm = document.getElementById('settings-form');
const formInstagram = document.getElementById('form-instagram');
const formInstagramEnabled = document.getElementById('form-instagram-enabled');
const formFacebook = document.getElementById('form-facebook');
const formFacebookEnabled = document.getElementById('form-facebook-enabled');
const formYoutube = document.getElementById('form-youtube');
const formYoutubeEnabled = document.getElementById('form-youtube-enabled');
const formWhatsapp = document.getElementById('form-whatsapp');
const formWhatsappEnabled = document.getElementById('form-whatsapp-enabled');
const formAddress = document.getElementById('form-address');
const submitSettingsBtn = document.getElementById('submit-settings-btn');

const passwordForm = document.getElementById('password-form');
const formNewPassword = document.getElementById('form-new-password');
const submitPasswordBtn = document.getElementById('submit-password-btn');

let cachedProjects = [];
let cachedSettings = {};
let editingProject = null;

// Auxiliar de padronização de medidas de lote (Ex: 15 + 30 => 15x30m)
function updateLotFromDimensions() {
  const f = formLotFront.value.trim();
  const d = formLotDepth.value.trim();
  if (f && d) {
    formLot.value = `${f}x${d}m`;
  }
}
if (formLotFront && formLotDepth) {
  formLotFront.addEventListener('input', updateLotFromDimensions);
  formLotDepth.addEventListener('input', updateLotFromDimensions);
}

// Normaliza texto de lote digitado manualmente (ex: "15 x 30 m" -> "15x30m")
function normalizeLotSize(raw) {
  if (!raw) return '';
  const cleaned = raw.trim();
  const match = cleaned.match(/^(\d+(?:[.,]\d+)?)\s*[xX]\s*(\d+(?:[.,]\d+)?)\s*[mM]?$/);
  if (match) {
    return `${match[1].replace(',', '.')}x${match[2].replace(',', '.')}m`;
  }
  return cleaned;
}

// Extrai metadados extras caso o backend antigo guarde apenas os 5 campos básicos
export function unpackProjectMeta(project) {
  const metaMap = (cachedSettings && cachedSettings.projectMeta) ? cachedSettings.projectMeta : {};
  const extra = metaMap[project.id] || {};
  return {
    ...project,
    area: project.area ?? extra.area ?? '',
    bedrooms: project.bedrooms ?? extra.bedrooms ?? '',
    garage: project.garage ?? extra.garage ?? '',
    status: project.status ?? extra.status ?? 'Projeto Exclusivo',
    videoUrl: project.videoUrl ?? extra.videoUrl ?? '',
    visible: project.visible !== undefined ? project.visible : (extra.visible !== false),
    order: typeof project.order === 'number' ? project.order : (typeof extra.order === 'number' ? extra.order : 9999)
  };
}

// Compressão inteligente de imagens para WebP direto no navegador
async function compressImageFile(file, maxWidth = 1920, quality = 0.86) {
  if (!formCompressWebp || !formCompressWebp.checked) return file;
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') return file;

  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      let { width, height } = img;
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob((blob) => {
        if (!blob) return resolve(file);
        const baseName = file.name.replace(/\.[^/.]+$/, '');
        const newFile = new File([blob], `${baseName}.webp`, { type: 'image/webp' });
        resolve(newFile);
      }, 'image/webp', quality);
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file);
    };

    img.src = objectUrl;
  });
}

// Converte uma URL de imagem já existente em File (para re-upload automático se o backend não tiver rota PUT)
async function urlToFile(url, fallbackName = 'image.webp') {
  const res = await fetch(url);
  const blob = await res.blob();
  const ext = blob.type.split('/')[1] || 'webp';
  return new File([blob], `${fallbackName}.${ext}`, { type: blob.type });
}

function handleUnauthorized() {
  localStorage.removeItem('adminToken');
  loginScreen.style.display = 'block';
  adminDashboard.style.display = 'none';
  alert('Sua sessão expirou. Faça login novamente.');
}

function reloadLogoPreview(hasLogo = true) {
  if (!currentLogoPreview || !noLogoText) return;
  if (hasLogo === false) {
    currentLogoPreview.style.display = 'none';
    noLogoText.style.display = 'block';
    return;
  }
  currentLogoPreview.src = `/images/logo.png?t=${Date.now()}`;
}

async function saveExtraSettingsMeta(updatedMetaMap) {
  cachedSettings.projectMeta = updatedMetaMap;
  await fetch('/api/settings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': localStorage.getItem('adminToken')
    },
    body: JSON.stringify({
      ...cachedSettings,
      projectMeta: updatedMetaMap
    })
  });
}

async function fetchSettings() {
  try {
    const res = await fetch(`/api/settings?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Falha ao buscar configurações');
    const data = await res.json();
    cachedSettings = data || {};

    if (formInstagram) formInstagram.value = data.instagram || '';
    if (formInstagramEnabled) formInstagramEnabled.checked = data.instagramEnabled !== false;

    if (formFacebook) formFacebook.value = data.facebook || '';
    if (formFacebookEnabled) formFacebookEnabled.checked = data.facebookEnabled !== false;

    if (formYoutube) formYoutube.value = data.youtube || '';
    if (formYoutubeEnabled) formYoutubeEnabled.checked = data.youtubeEnabled !== false;

    if (formWhatsapp) formWhatsapp.value = data.whatsapp || '';
    if (formWhatsappEnabled) formWhatsappEnabled.checked = data.whatsappEnabled !== false;

    if (formAddress) formAddress.value = data.address || 'Avenida Centenário 520, Maringá - PR';

    reloadLogoPreview(data.hasLogo !== false);
  } catch (err) {
    console.error('Erro ao carregar configurações:', err);
  }
}

function startEditProject(project) {
  editingProject = project;
  formProjectId.value = project.id;
  formPanelTitle.innerText = 'Editar Projeto';
  editModeBanner.style.display = 'flex';
  editModeText.innerText = `Editando: ${project.title}`;
  submitAdminBtn.innerText = 'Salvar Alterações do Projeto';

  formTitle.value = project.title || '';
  formSubtitle.value = project.subtitle || '';
  formLot.value = project.lotSize || '';

  const lotMatch = (project.lotSize || '').match(/^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)m?$/i);
  if (lotMatch) {
    formLotFront.value = lotMatch[1];
    formLotDepth.value = lotMatch[2];
  } else {
    formLotFront.value = '';
    formLotDepth.value = '';
  }

  formType.value = project.houseType || 'Térrea';
  formArea.value = project.area || '';
  formBedrooms.value = project.bedrooms || '';
  formGarage.value = project.garage || '';
  formStatus.value = project.status || 'Projeto Exclusivo';
  formVideo.value = project.videoUrl || '';
  formVisible.checked = project.visible !== false;
  formDesc.value = project.desc || '';

  formFacade.required = false;
  formPlan.required = false;
  facadeEditHint.style.display = 'block';
  planEditHint.style.display = 'block';

  document.getElementById('form-panel').scrollIntoView({ behavior: 'smooth' });
}

function cancelEditProject() {
  editingProject = null;
  formProjectId.value = '';
  adminForm.reset();
  formVisible.checked = true;
  if (formCompressWebp) formCompressWebp.checked = true;
  formPanelTitle.innerText = 'Cadastrar Novo Projeto';
  editModeBanner.style.display = 'none';
  submitAdminBtn.innerText = 'Cadastrar Projeto';
  formFacade.required = true;
  formPlan.required = true;
  facadeEditHint.style.display = 'none';
  planEditHint.style.display = 'none';
}

if (cancelEditBtn) {
  cancelEditBtn.addEventListener('click', cancelEditProject);
}

async function fetchAdminProjects() {
  if (!projectsListContainer) return;
  projectsListContainer.innerHTML = '<p style="color: #888;">Carregando projetos...</p>';

  try {
    const res = await fetch(`/api/projects?all=true&t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Erro na resposta da API');
    const rawData = await res.json();

    projectsListContainer.innerHTML = '';

    if (!Array.isArray(rawData) || rawData.length === 0) {
      cachedProjects = [];
      if (projectsCountBadge) projectsCountBadge.innerText = '0 projetos';
      projectsListContainer.innerHTML = '<p style="color: #888;">Nenhum projeto cadastrado no momento.</p>';
      return;
    }

    cachedProjects = rawData
      .map(unpackProjectMeta)
      .sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999));

    if (projectsCountBadge) {
      projectsCountBadge.innerText = `${cachedProjects.length} ${cachedProjects.length === 1 ? 'projeto' : 'projetos'}`;
    }

    cachedProjects.forEach((project, idx) => {
      const div = document.createElement('div');
      div.className = 'project-item';

      const thumbUrl = (project.facades && project.facades[0]) ? project.facades[0] : (project.facade || '');
      const isHidden = project.visible === false;

      div.innerHTML = `
        <div style="display: flex; align-items: center; gap: 1rem; flex: 1; min-width: 240px;">
          ${thumbUrl ? `<img src="${thumbUrl}" alt="${project.title}" style="width: 76px; height: 56px; object-fit: cover; border-radius: 0.4rem; background: #111; opacity: ${isHidden ? '0.4' : '1'};" onerror="this.style.display='none'">` : ''}
          <div>
            <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
              <h3 style="margin: 0; font-size: 1.05rem; font-weight: 600; color: #fff;">${project.title || 'Sem título'}</h3>
              ${isHidden ? '<span class="badge-info badge-hidden">Oculto na Galeria</span>' : ''}
            </div>
            <p style="margin: 0.2rem 0; font-size: 0.85rem; color: #999;">
              Lote: <strong>${project.lotSize || 'N/A'}</strong> • ${project.houseType || 'N/A'} • ${project.subtitle || ''}
            </p>
            <div>
              ${project.area ? `<span class="badge-info">📐 ${project.area}</span>` : ''}
              ${project.bedrooms ? `<span class="badge-info">🛏️ ${project.bedrooms}</span>` : ''}
              ${project.garage ? `<span class="badge-info">🚗 ${project.garage}</span>` : ''}
              ${project.status ? `<span class="badge-info">🏷️ ${project.status}</span>` : ''}
              ${project.videoUrl ? `<span class="badge-info">🎬 Vídeo</span>` : ''}
            </div>
          </div>
        </div>
        <div class="project-actions">
          <button type="button" class="action-btn up-btn" title="Mover para cima" ${idx === 0 ? 'disabled style="opacity:0.3;cursor:default;"' : ''}>↑</button>
          <button type="button" class="action-btn down-btn" title="Mover para baixo" ${idx === cachedProjects.length - 1 ? 'disabled style="opacity:0.3;cursor:default;"' : ''}>↓</button>
          <button type="button" class="action-btn toggle-vis-btn" title="Mostrar/Ocultar na Galeria">${isHidden ? 'Mostrar' : 'Ocultar'}</button>
          <button type="button" class="action-btn edit-btn">Editar</button>
          <button type="button" class="action-btn delete-btn">Excluir</button>
        </div>
      `;

      // Botão Subir Ordem
      div.querySelector('.up-btn').addEventListener('click', async () => {
        if (idx === 0) return;
        await swapProjectOrder(idx, idx - 1);
      });

      // Botão Descer Ordem
      div.querySelector('.down-btn').addEventListener('click', async () => {
        if (idx >= cachedProjects.length - 1) return;
        await swapProjectOrder(idx, idx + 1);
      });

      // Botão Mostrar/Ocultar
      div.querySelector('.toggle-vis-btn').addEventListener('click', async () => {
        const metaMap = { ...(cachedSettings.projectMeta || {}) };
        metaMap[project.id] = {
          ...(metaMap[project.id] || {}),
          area: project.area,
          bedrooms: project.bedrooms,
          garage: project.garage,
          status: project.status,
          videoUrl: project.videoUrl,
          order: idx,
          visible: !isHidden ? false : true
        };
        await saveExtraSettingsMeta(metaMap);
        await fetchAdminProjects();
      });

      // Botão Editar
      div.querySelector('.edit-btn').addEventListener('click', () => {
        startEditProject(project);
      });

      // Botão Excluir
      const deleteBtn = div.querySelector('.delete-btn');
      deleteBtn.addEventListener('click', async () => {
        if (!confirm(`Tem certeza que deseja excluir o projeto "${project.title}"?`)) return;
        const originalText = deleteBtn.innerText;
        deleteBtn.innerText = 'Excluindo...';
        deleteBtn.disabled = true;

        try {
          const delRes = await fetch(`/api/projects/${project.id}`, {
            method: 'DELETE',
            headers: { 'Authorization': localStorage.getItem('adminToken') }
          });
          if (delRes.status === 401 || delRes.status === 403) return handleUnauthorized();
          if (!delRes.ok) throw new Error('Falha ao excluir');

          if (cachedSettings.projectMeta && cachedSettings.projectMeta[project.id]) {
            const metaMap = { ...cachedSettings.projectMeta };
            delete metaMap[project.id];
            await saveExtraSettingsMeta(metaMap);
          }

          if (editingProject && String(editingProject.id) === String(project.id)) {
            cancelEditProject();
          }
          await fetchAdminProjects();
        } catch (err) {
          alert('Erro ao excluir o projeto.');
          deleteBtn.innerText = originalText;
          deleteBtn.disabled = false;
        }
      });

      projectsListContainer.appendChild(div);
    });
  } catch (err) {
    console.error('Erro ao buscar projetos:', err);
    projectsListContainer.innerHTML = '<p style="color: #ff4444;">Erro ao carregar projetos. Tente atualizar a página.</p>';
  }
}

async function swapProjectOrder(indexA, indexB) {
  const list = [...cachedProjects];
  const temp = list[indexA];
  list[indexA] = list[indexB];
  list[indexB] = temp;

  const metaMap = { ...(cachedSettings.projectMeta || {}) };
  list.forEach((proj, idx) => {
    metaMap[proj.id] = {
      ...(metaMap[proj.id] || {}),
      area: proj.area || '',
      bedrooms: proj.bedrooms || '',
      garage: proj.garage || '',
      status: proj.status || 'Projeto Exclusivo',
      videoUrl: proj.videoUrl || '',
      visible: proj.visible !== false,
      order: idx
    };
  });

  await saveExtraSettingsMeta(metaMap);
  await fetchAdminProjects();
}

async function checkAuth() {
  const token = localStorage.getItem('adminToken');
  if (!token) {
    loginScreen.style.display = 'block';
    adminDashboard.style.display = 'none';
    return;
  }

  try {
    const verifyRes = await fetch('/api/auth/verify', {
      headers: { 'Authorization': token },
      cache: 'no-store'
    });
    if (!verifyRes.ok) {
      localStorage.removeItem('adminToken');
      loginScreen.style.display = 'block';
      adminDashboard.style.display = 'none';
      return;
    }

    loginScreen.style.display = 'none';
    adminDashboard.style.display = 'block';
    await fetchSettings();
    await fetchAdminProjects();
  } catch (err) {
    console.error('Erro na verificação de autenticação:', err);
  }
}

if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = document.getElementById('login-password').value;
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      if (!res.ok) throw new Error('Invalid password');
      const { token } = await res.json();
      localStorage.setItem('adminToken', `Bearer ${token}`);
      document.getElementById('login-password').value = '';
      await checkAuth();
    } catch (err) {
      alert('Senha incorreta!');
    }
  });
}

if (logoutBtn) {
  logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('adminToken');
    checkAuth();
  });
}

if (adminForm) {
  adminForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const originalBtnText = submitAdminBtn.innerText;
    submitAdminBtn.innerText = 'Processando imagens e salvando...';
    submitAdminBtn.disabled = true;

    try {
      const normalizedLot = normalizeLotSize(formLot.value);
      const extraMeta = {
        area: formArea.value.trim(),
        bedrooms: formBedrooms.value.trim(),
        garage: formGarage.value.trim(),
        status: formStatus.value,
        videoUrl: formVideo.value.trim(),
        visible: Boolean(formVisible.checked),
        order: editingProject && typeof editingProject.order === 'number' ? editingProject.order : cachedProjects.length
      };

      const formData = new FormData();
      formData.append('title', formTitle.value.trim());
      formData.append('subtitle', formSubtitle.value.trim());
      formData.append('lotSize', normalizedLot);
      formData.append('houseType', formType.value);
      formData.append('desc', formDesc.value.trim());
      formData.append('area', extraMeta.area);
      formData.append('bedrooms', extraMeta.bedrooms);
      formData.append('garage', extraMeta.garage);
      formData.append('status', extraMeta.status);
      formData.append('videoUrl', extraMeta.videoUrl);
      formData.append('visible', String(extraMeta.visible));
      formData.append('order', String(extraMeta.order));

      const facadeFiles = formFacade.files;
      const planFiles = formPlan.files;

      if (facadeFiles.length > 0) {
        for (let i = 0; i < Math.min(facadeFiles.length, 5); i++) {
          const compressed = await compressImageFile(facadeFiles[i]);
          formData.append('facades', compressed);
        }
      } else if (editingProject) {
        const existingFacades = editingProject.facades || [editingProject.facade].filter(Boolean);
        for (let i = 0; i < existingFacades.length; i++) {
          const fileFromUrl = await urlToFile(existingFacades[i], `facade_${i}`);
          formData.append('facades', fileFromUrl);
        }
      }

      if (planFiles.length > 0) {
        for (let i = 0; i < Math.min(planFiles.length, 3); i++) {
          const compressed = await compressImageFile(planFiles[i]);
          formData.append('plans', compressed);
        }
      } else if (editingProject) {
        const existingPlans = editingProject.plans || [editingProject.plan].filter(Boolean);
        for (let i = 0; i < existingPlans.length; i++) {
          const fileFromUrl = await urlToFile(existingPlans[i], `plan_${i}`);
          formData.append('plans', fileFromUrl);
        }
      }

      let savedProject = null;

      if (editingProject) {
        // Tenta rota PUT nativa primeiro; se o server.cjs for o antigo (404), recria via POST e remove o antigo
        const putRes = await fetch(`/api/projects/${editingProject.id}`, {
          method: 'PUT',
          headers: { 'Authorization': localStorage.getItem('adminToken') },
          body: formData
        });

        if (putRes.status === 401 || putRes.status === 403) return handleUnauthorized();

        if (putRes.ok) {
          savedProject = await putRes.json();
        } else {
          const postRes = await fetch('/api/projects', {
            method: 'POST',
            headers: { 'Authorization': localStorage.getItem('adminToken') },
            body: formData
          });
          if (postRes.status === 401 || postRes.status === 403) return handleUnauthorized();
          if (!postRes.ok) throw new Error('Falha ao atualizar projeto');
          savedProject = await postRes.json();

          await fetch(`/api/projects/${editingProject.id}`, {
            method: 'DELETE',
            headers: { 'Authorization': localStorage.getItem('adminToken') }
          });
        }
      } else {
        const res = await fetch('/api/projects', {
          method: 'POST',
          headers: { 'Authorization': localStorage.getItem('adminToken') },
          body: formData
        });
        if (res.status === 401 || res.status === 403) return handleUnauthorized();
        if (!res.ok) throw new Error('Upload failed');
        savedProject = await res.json();
      }

      const targetId = (savedProject && savedProject.id) ? savedProject.id : (editingProject ? editingProject.id : null);
      if (targetId) {
        const metaMap = { ...(cachedSettings.projectMeta || {}) };
        if (editingProject && String(editingProject.id) !== String(targetId)) {
          delete metaMap[editingProject.id];
        }
        metaMap[targetId] = extraMeta;
        await saveExtraSettingsMeta(metaMap);
      }

      alert(editingProject ? 'Projeto atualizado com sucesso!' : 'Projeto cadastrado com sucesso!');
      cancelEditProject();
      await fetchAdminProjects();
    } catch (err) {
      console.error(err);
      alert('Falha ao salvar o projeto.');
    } finally {
      submitAdminBtn.innerText = editingProject ? 'Salvar Alterações do Projeto' : 'Cadastrar Projeto';
      submitAdminBtn.disabled = false;
    }
  });
}

if (logoForm) {
  logoForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!formLogo.files || !formLogo.files.length) return;

    const formData = new FormData();
    formData.append('logo', formLogo.files[0]);

    const originalBtnText = submitLogoBtn.innerText;
    submitLogoBtn.innerText = 'Salvando...';
    submitLogoBtn.disabled = true;

    try {
      const res = await fetch('/api/logo', {
        method: 'POST',
        headers: { 'Authorization': localStorage.getItem('adminToken') },
        body: formData
      });
      if (res.status === 401 || res.status === 403) return handleUnauthorized();
      if (!res.ok) throw new Error('Falha no upload da logo');

      alert('Logotipo salvo e atualizado com sucesso!');
      logoForm.reset();
      reloadLogoPreview(true);
    } catch (err) {
      alert('Falha ao enviar logotipo.');
    } finally {
      submitLogoBtn.innerText = originalBtnText;
      submitLogoBtn.disabled = false;
    }
  });
}

if (deleteLogoBtn) {
  deleteLogoBtn.addEventListener('click', async () => {
    if (!confirm('Tem certeza que deseja remover o logotipo atual?')) return;

    const originalBtnText = deleteLogoBtn.innerText;
    deleteLogoBtn.innerText = 'Removendo...';
    deleteLogoBtn.disabled = true;

    try {
      const res = await fetch('/api/logo', {
        method: 'DELETE',
        headers: { 'Authorization': localStorage.getItem('adminToken') }
      });
      if (res.status === 401 || res.status === 403) return handleUnauthorized();
      if (!res.ok) throw new Error('Falha ao remover logo');

      alert('Logotipo removido com sucesso!');
      reloadLogoPreview(false);
    } catch (err) {
      alert('Falha ao remover logotipo.');
    } finally {
      deleteLogoBtn.innerText = originalBtnText;
      deleteLogoBtn.disabled = false;
    }
  });
}

if (settingsForm) {
  settingsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      ...cachedSettings,
      instagram: formInstagram.value.trim(),
      instagramEnabled: Boolean(formInstagramEnabled.checked),
      facebook: formFacebook.value.trim(),
      facebookEnabled: Boolean(formFacebookEnabled.checked),
      youtube: formYoutube.value.trim(),
      youtubeEnabled: Boolean(formYoutubeEnabled.checked),
      whatsapp: formWhatsapp.value.trim(),
      whatsappEnabled: Boolean(formWhatsappEnabled.checked),
      address: formAddress ? formAddress.value.trim() : 'Avenida Centenário 520, Maringá - PR'
    };

    const originalBtnText = submitSettingsBtn.innerText;
    submitSettingsBtn.innerText = 'Salvando...';
    submitSettingsBtn.disabled = true;

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': localStorage.getItem('adminToken')
        },
        body: JSON.stringify(payload)
      });
      if (res.status === 401 || res.status === 403) return handleUnauthorized();
      if (!res.ok) throw new Error('Failed to save');

      alert('Configurações salvas com sucesso!');
      await fetchSettings();
    } catch (err) {
      alert('Falha ao salvar configurações.');
    } finally {
      submitSettingsBtn.innerText = originalBtnText;
      submitSettingsBtn.disabled = false;
    }
  });
}

if (passwordForm) {
  passwordForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const newPassword = formNewPassword.value;

    const originalBtnText = submitPasswordBtn.innerText;
    submitPasswordBtn.innerText = 'Salvando...';
    submitPasswordBtn.disabled = true;

    try {
      const res = await fetch('/api/password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': localStorage.getItem('adminToken')
        },
        body: JSON.stringify({ newPassword })
      });
      if (res.status === 401 || res.status === 403) return handleUnauthorized();
      if (!res.ok) throw new Error('Failed to update password');

      const data = await res.json();
      if (data.token) {
        localStorage.setItem('adminToken', `Bearer ${data.token}`);
      }
      alert('Senha alterada com sucesso!');
      passwordForm.reset();
    } catch (err) {
      alert('Falha ao alterar senha.');
    } finally {
      submitPasswordBtn.innerText = originalBtnText;
      submitPasswordBtn.disabled = false;
    }
  });
}

checkAuth();
