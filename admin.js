const loginScreen = document.getElementById('login-screen');
const adminDashboard = document.getElementById('admin-dashboard');
const loginForm = document.getElementById('login-form');
const logoutBtn = document.getElementById('logout-btn');

const adminForm = document.getElementById('admin-form');
const submitAdminBtn = document.getElementById('submit-admin-btn');
const projectsListContainer = document.getElementById('projects-list-container');

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
const submitSettingsBtn = document.getElementById('submit-settings-btn');

const passwordForm = document.getElementById('password-form');
const formNewPassword = document.getElementById('form-new-password');
const submitPasswordBtn = document.getElementById('submit-password-btn');

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

async function fetchSettings() {
  try {
    const res = await fetch(`/api/settings?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Falha ao buscar configurações');
    const data = await res.json();

    if (formInstagram) formInstagram.value = data.instagram || '';
    if (formInstagramEnabled) formInstagramEnabled.checked = data.instagramEnabled !== false;

    if (formFacebook) formFacebook.value = data.facebook || '';
    if (formFacebookEnabled) formFacebookEnabled.checked = data.facebookEnabled !== false;

    if (formYoutube) formYoutube.value = data.youtube || '';
    if (formYoutubeEnabled) formYoutubeEnabled.checked = data.youtubeEnabled !== false;

    if (formWhatsapp) formWhatsapp.value = data.whatsapp || '';
    if (formWhatsappEnabled) formWhatsappEnabled.checked = data.whatsappEnabled !== false;

    reloadLogoPreview(data.hasLogo !== false);
  } catch (err) {
    console.error('Erro ao carregar configurações:', err);
  }
}

async function fetchAdminProjects() {
  if (!projectsListContainer) return;
  projectsListContainer.innerHTML = '<p style="color: #888;">Carregando projetos...</p>';

  try {
    const res = await fetch(`/api/projects?all=true&t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Erro na resposta da API');
    const data = await res.json();

    projectsListContainer.innerHTML = '';

    if (!Array.isArray(data) || data.length === 0) {
      projectsListContainer.innerHTML = '<p style="color: #888;">Nenhum projeto cadastrado no momento.</p>';
      return;
    }

    data.forEach(project => {
      const div = document.createElement('div');
      div.style.cssText = 'display: flex; justify-content: space-between; align-items: center; gap: 1rem; background: rgba(0,0,0,0.4); padding: 1rem; border-radius: 0.5rem; border: 1px solid rgba(255,255,255,0.1);';

      const thumbUrl = (project.facades && project.facades[0]) ? project.facades[0] : '';

      div.innerHTML = `
        <div style="display: flex; align-items: center; gap: 1rem;">
          ${thumbUrl ? `<img src="${thumbUrl}" alt="${project.title}" style="width: 64px; height: 48px; object-fit: cover; border-radius: 0.35rem; background: #111;" onerror="this.style.display='none'">` : ''}
          <div>
            <h3 style="margin: 0 0 0.25rem 0; font-size: 1.05rem; font-weight: 500; color: #fff;">${project.title || 'Sem título'}</h3>
            <p style="margin: 0; font-size: 0.85rem; color: #888;">Lote: ${project.lotSize || 'N/A'} • ${project.houseType || 'N/A'} • ${project.subtitle || ''}</p>
          </div>
        </div>
        <button type="button" class="delete-btn" style="background: #ff4444; color: white; border: none; padding: 0.55rem 1rem; border-radius: 0.35rem; cursor: pointer; font-family: inherit; text-transform: uppercase; font-size: 0.8rem; font-weight: 700; flex-shrink: 0;">Excluir</button>
      `;

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
    await Promise.all([fetchSettings(), fetchAdminProjects()]);
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
    const formData = new FormData();
    formData.append('title', document.getElementById('form-title').value.trim());
    formData.append('subtitle', document.getElementById('form-subtitle').value.trim());
    formData.append('lotSize', document.getElementById('form-lot').value.trim());
    formData.append('houseType', document.getElementById('form-type').value);
    formData.append('desc', document.getElementById('form-desc').value.trim());

    const facadeFiles = document.getElementById('form-facade').files;
    const planFiles = document.getElementById('form-plan').files;

    for (let i = 0; i < facadeFiles.length; i++) {
      formData.append('facades', facadeFiles[i]);
    }
    for (let i = 0; i < planFiles.length; i++) {
      formData.append('plans', planFiles[i]);
    }

    const originalBtnText = submitAdminBtn.innerText;
    submitAdminBtn.innerText = 'Enviando...';
    submitAdminBtn.disabled = true;

    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Authorization': localStorage.getItem('adminToken') },
        body: formData
      });
      if (res.status === 401 || res.status === 403) return handleUnauthorized();
      if (!res.ok) throw new Error('Upload failed');

      alert('Projeto cadastrado com sucesso!');
      adminForm.reset();
      await fetchAdminProjects();
    } catch (err) {
      alert('Falha ao cadastrar projeto.');
    } finally {
      submitAdminBtn.innerText = originalBtnText;
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
      instagram: formInstagram.value.trim(),
      instagramEnabled: Boolean(formInstagramEnabled.checked),
      facebook: formFacebook.value.trim(),
      facebookEnabled: Boolean(formFacebookEnabled.checked),
      youtube: formYoutube.value.trim(),
      youtubeEnabled: Boolean(formYoutubeEnabled.checked),
      whatsapp: formWhatsapp.value.trim(),
      whatsappEnabled: Boolean(formWhatsappEnabled.checked)
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

      alert('Configurações de redes sociais salvas com sucesso!');
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
