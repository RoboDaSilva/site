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

const faviconForm = document.getElementById('favicon-form');
const formFavicon = document.getElementById('form-favicon');
const submitFaviconBtn = document.getElementById('submit-favicon-btn');
const deleteFaviconBtn = document.getElementById('delete-favicon-btn');
const currentFaviconPreviewLight = document.getElementById('current-favicon-preview-light');
const currentFaviconPreviewDark = document.getElementById('current-favicon-preview-dark');
const faviconStatusBadge = document.getElementById('favicon-status-badge');
const adminFaviconLink = document.getElementById('admin-favicon');

const settingsForm = document.getElementById('settings-form');
const formInstagram = document.getElementById('form-instagram');
const formInstagramEnabled = document.getElementById('form-instagram-enabled');
const formFacebook = document.getElementById('form-facebook');
const formFacebookEnabled = document.getElementById('form-facebook-enabled');
const formYoutube = document.getElementById('form-youtube');
const formYoutubeEnabled = document.getElementById('form-youtube-enabled');
const formWhatsapp = document.getElementById('form-whatsapp');
const formWhatsappEnabled = document.getElementById('form-whatsapp-enabled');
const formWhatsappMsg = document.getElementById('form-whatsapp-msg');
const formAddress = document.getElementById('form-address');
const submitSettingsBtn = document.getElementById('submit-settings-btn');

const passwordForm = document.getElementById('password-form');
const formNewPassword = document.getElementById('form-new-password');
const submitPasswordBtn = document.getElementById('submit-password-btn');

let cachedProjects = [];
let cachedSettings = {};
let editingProject = null;

function normalizeLotSize(raw) {
  if (!raw) return '';
  const cleaned = raw.trim();
  const match = cleaned.match(/^(\d+(?:[.,]\d+)?)\s*[xX]\s*(\d+(?:[.,]\d+)?)\s*[mM]?$/);
  if (match) {
    return `${match[1].replace(',', '.')}x${match[2].replace(',', '.')}m`;
  }
  return cleaned;
}

const META_SEPARATOR = '\n<!--LEVEL_META:';
const META_END = '-->';

function packDescriptionWithMeta(cleanDesc, metaObj) {
  const hasAnyMeta = metaObj.area || metaObj.bedrooms || metaObj.garage || metaObj.videoUrl || metaObj.status || metaObj.visible === false || typeof metaObj.order === 'number';
  if (!hasAnyMeta) return cleanDesc;
  return `${cleanDesc}${META_SEPARATOR}${JSON.stringify(metaObj)}${META_END}`;
}

export function unpackProjectMeta(project) {
  let rawDesc = project.desc || '';
  let embeddedMeta = {};

  const sepIdx = rawDesc.indexOf(META_SEPARATOR);
  if (sepIdx !== -1) {
    const endIdx = rawDesc.indexOf(META_END, sepIdx);
    if (endIdx !== -1) {
      try {
        embeddedMeta = JSON.parse(rawDesc.slice(sepIdx + META_SEPARATOR.length, endIdx));
      } catch (e) {}
    }
    rawDesc = rawDesc.slice(0, sepIdx).trim();
  }

  const metaMap = (cachedSettings && cachedSettings.projectMeta) ? cachedSettings.projectMeta : {};
  const settingsMeta = metaMap[project.id] || {};

  return {
    ...project,
    desc: rawDesc,
    area: project.area || settingsMeta.area || embeddedMeta.area || '',
    bedrooms: project.bedrooms || settingsMeta.bedrooms || embeddedMeta.bedrooms || '',
    garage: project.garage || settingsMeta.garage || embeddedMeta.garage || '',
    status: project.status || settingsMeta.status || embeddedMeta.status || 'Projeto Exclusivo',
    videoUrl: project.videoUrl || settingsMeta.videoUrl || embeddedMeta.videoUrl || '',
    visible: project.visible !== undefined
      ? project.visible
      : (settingsMeta.visible !== undefined ? settingsMeta.visible : (embeddedMeta.visible !== false)),
    order: typeof project.order === 'number'
      ? project.order
      : (typeof settingsMeta.order === 'number' ? settingsMeta.order : (typeof embeddedMeta.order === 'number' ? embeddedMeta.order : 9999))
  };
}

/**
 * Comprime e redimensiona imagens pesadas (ex: renders 4K PNG/JPG) para WebP otimizado
 * direto no navegador antes do upload, acelerando o carregamento da Galeria 3D em até 80%.
 */
async function compressImageToWebP(file, maxDimension = 1920, quality = 0.86) {
  if (!file || !file.type || !file.type.startsWith('image/') || file.type === 'image/svg+xml') {
    return file;
  }

  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      try {
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          if (width >= height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob || blob.size >= file.size) {
              resolve(file);
              return;
            }
            const baseName = (file.name || 'image').replace(/\.[^/.]+$/, '');
            const optimizedFile = new File([blob], `${baseName}.webp`, {
              type: 'image/webp',
              lastModified: Date.now()
            });
            resolve(optimizedFile);
          },
          'image/webp',
          quality
        );
      } catch (e) {
        resolve(file);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file);
    };

    img.src = objectUrl;
  });
}

function handleUnauthorized() {
  localStorage.removeItem('adminToken');
  if (loginScreen) loginScreen.style.display = 'block';
  if (adminDashboard) adminDashboard.style.display = 'none';
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

function reloadFaviconPreview(hasCustomFavicon = false) {
  const url = `/images/favicon.png?t=${Date.now()}`;
  if (currentFaviconPreviewLight) currentFaviconPreviewLight.src = url;
  if (currentFaviconPreviewDark) currentFaviconPreviewDark.src = url;
  if (adminFaviconLink) adminFaviconLink.href = url;
  if (faviconStatusBadge) {
    faviconStatusBadge.innerText = hasCustomFavicon
      ? '✨ Ícone personalizado ativo'
      : 'Usando logotipo padrão na aba';
  }
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
    if (formWhatsappMsg) formWhatsappMsg.value = data.whatsappMsg || 'Olá! Encontrei a construtora no Google, gostaria de mais informações.';

    if (formAddress) formAddress.value = data.address || 'Avenida Centenário 520, Maringá - PR';

    reloadLogoPreview(data.hasLogo !== false);
    reloadFaviconPreview(Boolean(data.hasFavicon));
  } catch (err) {
    console.error('Erro ao carregar configurações:', err);
  }
}

function startEditProject(project) {
  editingProject = project;
  if (formProjectId) formProjectId.value = project.id;
  if (formPanelTitle) formPanelTitle.innerText = 'Editar Projeto';
  if (editModeBanner) editModeBanner.style.display = 'flex';
  if (editModeText) editModeText.innerText = `Editando: ${project.title}`;
  if (submitAdminBtn) submitAdminBtn.innerText = 'Salvar Alterações do Projeto';

  if (formTitle) formTitle.value = project.title || '';
  if (formSubtitle) formSubtitle.value = project.subtitle || '';
  if (formLot) formLot.value = project.lotSize || '';
  if (formType) formType.value = project.houseType || 'Térrea';
  if (formArea) formArea.value = project.area || '';
  if (formBedrooms) formBedrooms.value = project.bedrooms || '';
  if (formGarage) formGarage.value = project.garage || '';
  if (formStatus) formStatus.value = project.status || 'Projeto Exclusivo';
  if (formVideo) formVideo.value = project.videoUrl || '';
  if (formVisible) formVisible.checked = project.visible !== false;
  if (formDesc) formDesc.value = project.desc || '';

  if (formFacade) formFacade.required = false;
  if (formPlan) formPlan.required = false;
  if (facadeEditHint) facadeEditHint.style.display = 'block';
  if (planEditHint) planEditHint.style.display = 'block';

  const panelEl = document.getElementById('form-panel') || adminForm;
  if (panelEl) panelEl.scrollIntoView({ behavior: 'smooth' });
}

function cancelEditProject() {
  editingProject = null;
  if (formProjectId) formProjectId.value = '';
  if (adminForm) adminForm.reset();
  if (formVisible) formVisible.checked = true;
  if (formPanelTitle) formPanelTitle.innerText = 'Cadastrar Novo Projeto';
  if (editModeBanner) editModeBanner.style.display = 'none';
  if (submitAdminBtn) submitAdminBtn.innerText = 'Cadastrar Projeto';
  if (formFacade) formFacade.required = true;
  if (formPlan) formPlan.required = true;
  if (facadeEditHint) facadeEditHint.style.display = 'none';
  if (planEditHint) planEditHint.style.display = 'none';
}

if (cancelEditBtn) {
  cancelEditBtn.addEventListener('click', cancelEditProject);
}

async function saveProjectOrder(orderedProjects) {
  try {
    const orderedIds = orderedProjects.map(p => p.id);
    const res = await fetch('/api/projects/reorder', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': localStorage.getItem('adminToken')
      },
      body: JSON.stringify({ orderedIds })
    });
    if (res.status === 401 || res.status === 403) return handleUnauthorized();
    await fetchAdminProjects();
  } catch (err) {
    console.error('Erro ao reordenar:', err);
  }
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
      .map((p, idx) => {
        const unpacked = unpackProjectMeta(p);
        if (unpacked.order === 9999) unpacked.order = idx;
        return unpacked;
      })
      .sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999));

    if (projectsCountBadge) {
      projectsCountBadge.innerText = `${cachedProjects.length} ${cachedProjects.length === 1 ? 'projeto' : 'projetos'}`;
    }

    cachedProjects.forEach((project, idx) => {
      const div = document.createElement('div');
      div.style.cssText = 'display: flex; justify-content: space-between; align-items: center; gap: 1rem; background: rgba(0,0,0,0.45); padding: 1rem; border-radius: 0.65rem; border: 1px solid rgba(255,255,255,0.12); flex-wrap: wrap;';

      const thumbUrl = (project.facades && project.facades[0]) ? project.facades[0] : (project.facade || '');
      const isHidden = project.visible === false;
      const isCenterHero = idx === 0 && !isHidden;

      div.innerHTML = `
        <div style="display: flex; align-items: center; gap: 1rem; flex: 1; min-width: 240px;">
          ${thumbUrl ? `<img src="${thumbUrl}" alt="${project.title}" style="width: 72px; height: 54px; object-fit: cover; border-radius: 0.4rem; background: #111; opacity: ${isHidden ? '0.4' : '1'};" onerror="this.style.display='none'">` : ''}
          <div>
            <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
              <h3 style="margin: 0; font-size: 1.05rem; font-weight: 600; color: #fff;">${project.title || 'Sem título'}</h3>
              ${isCenterHero ? '<span class="center-badge">⭐ Destaque Central 3D</span>' : ''}
              ${isHidden ? '<span style="background:rgba(255,68,68,0.2);color:#ff7777;padding:0.15rem 0.5rem;border-radius:0.3rem;font-size:0.75rem;">Oculto</span>' : ''}
            </div>
            <p style="margin: 0.25rem 0; font-size: 0.85rem; color: #999;">
              Lote: <strong>${project.lotSize || 'N/A'}</strong> • ${project.houseType || 'N/A'} ${project.area ? `• ${project.area}` : ''} • ${project.subtitle || ''}
            </p>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap;">
          ${idx > 0 ? '<button type="button" class="action-btn hero-btn" title="Colocar como destaque principal no centro da Galeria 3D">⭐ Centro</button>' : ''}
          ${idx > 0 ? '<button type="button" class="action-btn up-btn" title="Mover para cima">↑</button>' : ''}
          ${idx < cachedProjects.length - 1 ? '<button type="button" class="action-btn down-btn" title="Mover para baixo">↓</button>' : ''}
          <button type="button" class="action-btn edit-btn">Editar</button>
          <button type="button" class="action-btn delete-btn">Excluir</button>
        </div>
      `;

      const heroBtn = div.querySelector('.hero-btn');
      if (heroBtn) {
        heroBtn.addEventListener('click', () => {
          const reordered = [...cachedProjects];
          const [moved] = reordered.splice(idx, 1);
          reordered.unshift(moved);
          saveProjectOrder(reordered);
        });
      }

      const upBtn = div.querySelector('.up-btn');
      if (upBtn) {
        upBtn.addEventListener('click', () => {
          const reordered = [...cachedProjects];
          [reordered[idx - 1], reordered[idx]] = [reordered[idx], reordered[idx - 1]];
          saveProjectOrder(reordered);
        });
      }

      const downBtn = div.querySelector('.down-btn');
      if (downBtn) {
        downBtn.addEventListener('click', () => {
          const reordered = [...cachedProjects];
          [reordered[idx + 1], reordered[idx]] = [reordered[idx], reordered[idx + 1]];
          saveProjectOrder(reordered);
        });
      }

      div.querySelector('.edit-btn').addEventListener('click', () => {
        startEditProject(project);
      });

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

async function checkAuth() {
  const token = localStorage.getItem('adminToken');
  if (!token) {
    if (loginScreen) loginScreen.style.display = 'block';
    if (adminDashboard) adminDashboard.style.display = 'none';
    return;
  }

  try {
    const verifyRes = await fetch('/api/auth/verify', {
      headers: { 'Authorization': token },
      cache: 'no-store'
    });
    if (!verifyRes.ok) {
      localStorage.removeItem('adminToken');
      if (loginScreen) loginScreen.style.display = 'block';
      if (adminDashboard) adminDashboard.style.display = 'none';
      return;
    }

    if (loginScreen) loginScreen.style.display = 'none';
    if (adminDashboard) adminDashboard.style.display = 'block';
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

    const originalBtnText = submitAdminBtn ? submitAdminBtn.innerText : 'Cadastrar Projeto';
    if (submitAdminBtn) {
      submitAdminBtn.innerText = 'Otimizando e Salvando...';
      submitAdminBtn.disabled = true;
    }

    try {
      const titleVal = formTitle ? formTitle.value.trim() : '';
      const subtitleVal = formSubtitle ? formSubtitle.value.trim() : '';
      const lotVal = formLot ? normalizeLotSize(formLot.value) : '';
      const typeVal = formType ? formType.value : 'Térrea';
      const cleanDesc = formDesc ? formDesc.value.trim() : '';

      const extraMeta = {
        area: formArea ? formArea.value.trim() : '',
        bedrooms: formBedrooms ? formBedrooms.value.trim() : '',
        garage: formGarage ? formGarage.value.trim() : '',
        status: formStatus ? formStatus.value : 'Projeto Exclusivo',
        videoUrl: formVideo ? formVideo.value.trim() : '',
        visible: formVisible ? Boolean(formVisible.checked) : true,
        order: editingProject && typeof editingProject.order === 'number' ? editingProject.order : 0
      };

      const packedDesc = packDescriptionWithMeta(cleanDesc, extraMeta);

      const formData = new FormData();
      formData.append('title', titleVal);
      formData.append('subtitle', subtitleVal);
      formData.append('lotSize', lotVal);
      formData.append('houseType', typeVal);
      formData.append('desc', packedDesc);
      formData.append('area', extraMeta.area);
      formData.append('bedrooms', extraMeta.bedrooms);
      formData.append('garage', extraMeta.garage);
      formData.append('status', extraMeta.status);
      formData.append('videoUrl', extraMeta.videoUrl);
      formData.append('visible', String(extraMeta.visible));
      formData.append('order', String(extraMeta.order));

      const facadeFiles = formFacade ? Array.from(formFacade.files || []) : [];
      const planFiles = formPlan ? Array.from(formPlan.files || []) : [];

      for (const file of facadeFiles) {
        const optimized = await compressImageToWebP(file, 1920, 0.86);
        formData.append('facades', optimized);
      }

      for (const file of planFiles) {
        // Plantas humanizadas recebem resolução maior (2400px) para leitura nítida de cotas no zoom
        const optimized = await compressImageToWebP(file, 2400, 0.9);
        formData.append('plans', optimized);
      }

      const isEditing = Boolean(editingProject && editingProject.id);
      const endpoint = isEditing ? `/api/projects/${editingProject.id}` : '/api/projects';
      const method = isEditing ? 'PUT' : 'POST';

      const res = await fetch(endpoint, {
        method,
        headers: { 'Authorization': localStorage.getItem('adminToken') },
        body: formData
      });

      if (res.status === 401 || res.status === 403) return handleUnauthorized();
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(errText || `Erro HTTP ${res.status}`);
      }

      alert(isEditing ? 'Projeto atualizado com sucesso!' : 'Projeto cadastrado com sucesso!');
      cancelEditProject();
      await fetchAdminProjects();
    } catch (err) {
      console.error('Erro ao salvar projeto:', err);
      alert(`Falha ao salvar o projeto: ${err.message || 'Verifique o tamanho das imagens.'}`);
    } finally {
      if (submitAdminBtn) {
        submitAdminBtn.innerText = editingProject ? 'Salvar Alterações do Projeto' : originalBtnText;
        submitAdminBtn.disabled = false;
      }
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

if (faviconForm) {
  faviconForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!formFavicon.files || !formFavicon.files.length) return;

    const formData = new FormData();
    formData.append('favicon', formFavicon.files[0]);

    const originalBtnText = submitFaviconBtn.innerText;
    submitFaviconBtn.innerText = 'Salvando...';
    submitFaviconBtn.disabled = true;

    try {
      const res = await fetch('/api/favicon', {
        method: 'POST',
        headers: { 'Authorization': localStorage.getItem('adminToken') },
        body: formData
      });
      if (res.status === 401 || res.status === 403) return handleUnauthorized();
      if (!res.ok) throw new Error('Falha no upload do ícone');

      alert('Ícone da aba (Favicon) salvo e atualizado com sucesso!');
      faviconForm.reset();
      reloadFaviconPreview(true);
    } catch (err) {
      alert('Falha ao enviar ícone da aba.');
    } finally {
      submitFaviconBtn.innerText = originalBtnText;
      submitFaviconBtn.disabled = false;
    }
  });
}

if (deleteFaviconBtn) {
  deleteFaviconBtn.addEventListener('click', async () => {
    if (!confirm('Tem certeza que deseja remover o ícone personalizado da aba e voltar a usar o padrão?')) return;

    const originalBtnText = deleteFaviconBtn.innerText;
    deleteFaviconBtn.innerText = 'Restaurando...';
    deleteFaviconBtn.disabled = true;

    try {
      const res = await fetch('/api/favicon', {
        method: 'DELETE',
        headers: { 'Authorization': localStorage.getItem('adminToken') }
      });
      if (res.status === 401 || res.status === 403) return handleUnauthorized();
      if (!res.ok) throw new Error('Falha ao remover ícone');

      alert('Ícone personalizado removido! O site voltou para o padrão.');
      reloadFaviconPreview(false);
    } catch (err) {
      alert('Falha ao remover ícone da aba.');
    } finally {
      deleteFaviconBtn.innerText = originalBtnText;
      deleteFaviconBtn.disabled = false;
    }
  });
}

if (settingsForm) {
  settingsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      ...cachedSettings,
      instagram: formInstagram ? formInstagram.value.trim() : '',
      instagramEnabled: formInstagramEnabled ? Boolean(formInstagramEnabled.checked) : true,
      facebook: formFacebook ? formFacebook.value.trim() : '',
      facebookEnabled: formFacebookEnabled ? Boolean(formFacebookEnabled.checked) : true,
      youtube: formYoutube ? formYoutube.value.trim() : '',
      youtubeEnabled: formYoutubeEnabled ? Boolean(formYoutubeEnabled.checked) : true,
      whatsapp: formWhatsapp ? formWhatsapp.value.trim() : '',
      whatsappEnabled: formWhatsappEnabled ? Boolean(formWhatsappEnabled.checked) : true,
      whatsappMsg: formWhatsappMsg ? formWhatsappMsg.value.trim() : '',
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
