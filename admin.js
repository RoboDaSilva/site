const loginScreen = document.getElementById('login-screen');
const adminDashboard = document.getElementById('admin-dashboard');
const loginForm = document.getElementById('login-form');
const logoutBtn = document.getElementById('logout-btn');

// Login logic
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
    checkAuth();
  } catch (err) {
    alert('Senha incorreta!');
  }
});

logoutBtn.addEventListener('click', () => {
  localStorage.removeItem('adminToken');
  checkAuth();
});

const checkAuth = () => {
  const token = localStorage.getItem('adminToken');
  if (token) {
    loginScreen.style.display = 'none';
    adminDashboard.style.display = 'block';
    fetchSettings();
    fetchAdminProjects();
    reloadLogoPreview();
  } else {
    loginScreen.style.display = 'block';
    adminDashboard.style.display = 'none';
  }
};
checkAuth();

// --- PROJECT UPLOAD LOGIC ---
const adminForm = document.getElementById('admin-form');
const submitAdminBtn = document.getElementById('submit-admin-btn');

adminForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = document.getElementById('form-title').value;
  const subtitle = document.getElementById('form-subtitle').value;
  const lotSize = document.getElementById('form-lot').value;
  const houseType = document.getElementById('form-type').value;
  const desc = document.getElementById('form-desc').value;
  const facadeFiles = document.getElementById('form-facade').files;
  const planFiles = document.getElementById('form-plan').files;

  const formData = new FormData();
  formData.append('title', title);
  formData.append('subtitle', subtitle);
  formData.append('lotSize', lotSize);
  formData.append('houseType', houseType);
  formData.append('desc', desc);
  
  for(let i=0; i<facadeFiles.length; i++){
    formData.append('facades', facadeFiles[i]);
  }
  for(let i=0; i<planFiles.length; i++){
    formData.append('plans', planFiles[i]);
  }

  const originalBtnText = submitAdminBtn.innerText;
  submitAdminBtn.innerText = 'Uploading...';
  submitAdminBtn.disabled = true;

  try {
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Authorization': localStorage.getItem('adminToken') },
      body: formData
    });

    if (!res.ok) throw new Error('Upload failed');
    alert('Projeto cadastrado com sucesso! Acesse a página inicial para conferir.');
    adminForm.reset();
    fetchAdminProjects();
  } catch (err) {
    alert('Falha ao cadastrar projeto (Autorização negada?).');
  } finally {
    submitAdminBtn.innerText = originalBtnText;
    submitAdminBtn.disabled = false;
  }
});

// --- LOGO LOGIC ---
const logoForm = document.getElementById('logo-form');
const formLogo = document.getElementById('form-logo');
const submitLogoBtn = document.getElementById('submit-logo-btn');
const deleteLogoBtn = document.getElementById('delete-logo-btn');
const currentLogoPreview = document.getElementById('current-logo-preview');
const noLogoText = document.getElementById('no-logo-text');

function reloadLogoPreview() {
  if (currentLogoPreview) {
    currentLogoPreview.src = `/images/logo.png?t=${Date.now()}`;
    currentLogoPreview.style.display = 'block';
  }
  if (noLogoText) {
    noLogoText.style.display = 'none';
  }
}

if (logoForm) {
  logoForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!formLogo.files.length) return;

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

      if (!res.ok) throw new Error('Falha no upload da logo');
      alert('Logo atualizada com sucesso!');
      logoForm.reset();
      reloadLogoPreview();
    } catch (err) {
      alert('Falha ao enviar logotipo (Autorização negada ou erro de arquivo).');
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

      if (!res.ok) throw new Error('Falha ao remover a logo');
      alert('Logotipo removido com sucesso!');
      if (currentLogoPreview) currentLogoPreview.style.display = 'none';
      if (noLogoText) noLogoText.style.display = 'block';
    } catch (err) {
      alert('Falha ao remover logotipo.');
    } finally {
      deleteLogoBtn.innerText = originalBtnText;
      deleteLogoBtn.disabled = false;
    }
  });
}

// --- SETTINGS LOGIC ---
const settingsForm = document.getElementById('settings-form');
const formInstagram = document.getElementById('form-instagram');
const formFacebook = document.getElementById('form-facebook');
const formYoutube = document.getElementById('form-youtube');
const formWhatsapp = document.getElementById('form-whatsapp');
const submitSettingsBtn = document.getElementById('submit-settings-btn');

async function fetchSettings() {
  try {
    const res = await fetch('/api/settings');
    const data = await res.json();
    formInstagram.value = data.instagram || '';
    formFacebook.value = data.facebook || '';
    formYoutube.value = data.youtube || '';
    formWhatsapp.value = data.whatsapp || '';
  } catch (err) {
    console.error(err);
  }
}

settingsForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    instagram: formInstagram.value,
    facebook: formFacebook.value,
    youtube: formYoutube.value,
    whatsapp: formWhatsapp.value
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

    if (!res.ok) throw new Error('Failed to save');
    alert('Configurações salvas!');
  } catch (err) {
    alert('Falha ao salvar (Autorização negada?).');
  } finally {
    submitSettingsBtn.innerText = originalBtnText;
    submitSettingsBtn.disabled = false;
  }
});

// --- PASSWORD LOGIC ---
const passwordForm = document.getElementById('password-form');
const formNewPassword = document.getElementById('form-new-password');
const submitPasswordBtn = document.getElementById('submit-password-btn');

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

    if (!res.ok) throw new Error('Failed to update password');
    alert('Senha alterada com sucesso! Você usará esta senha no próximo login.');
    passwordForm.reset();
  } catch (err) {
    alert('Falha ao alterar senha (Autorização negada?).');
  } finally {
    submitPasswordBtn.innerText = originalBtnText;
    submitPasswordBtn.disabled = false;
  }
});

// --- PROJECT LIST LOGIC ---
const projectsListContainer = document.getElementById('projects-list-container');

async function fetchAdminProjects() {
  if (!projectsListContainer) return;
  try {
    const res = await fetch('/api/projects');
    const data = await res.json();
    
    projectsListContainer.innerHTML = '';
    
    if (data.length === 0) {
      projectsListContainer.innerHTML = '<p style="color: #888;">Nenhum projeto cadastrado.</p>';
      return;
    }

    data.forEach(project => {
      const div = document.createElement('div');
      div.style.cssText = 'display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.4); padding: 1rem; border-radius: 0.5rem; border: 1px solid rgba(255,255,255,0.1);';
      
      div.innerHTML = `
        <div>
          <h3 style="margin: 0 0 0.25rem 0; font-size: 1.1rem; font-weight: 500;">${project.title}</h3>
          <p style="margin: 0; font-size: 0.9rem; color: #888;">Lote: ${project.lotSize} • ${project.houseType}</p>
        </div>
        <button class="delete-btn" data-id="${project.id}" style="background: #ff4444; color: white; border: none; padding: 0.5rem 1rem; border-radius: 0.25rem; cursor: pointer; font-family: inherit; text-transform: uppercase; font-size: 0.8rem; font-weight: 700;">Excluir</button>
      `;
      
      const deleteBtn = div.querySelector('.delete-btn');
      deleteBtn.addEventListener('click', async () => {
        if (confirm(`Tem certeza que deseja excluir o projeto "${project.title}"?`)) {
          const originalText = deleteBtn.innerText;
          deleteBtn.innerText = 'Excluindo...';
          deleteBtn.disabled = true;
          try {
            const delRes = await fetch(`/api/projects/${project.id}`, {
              method: 'DELETE',
              headers: { 'Authorization': localStorage.getItem('adminToken') }
            });
            if (!delRes.ok) throw new Error('Falha ao excluir');
            fetchAdminProjects();
            alert('Projeto excluído com sucesso!');
          } catch (err) {
            alert('Falha ao excluir (Autorização negada?).');
            deleteBtn.innerText = originalText;
            deleteBtn.disabled = false;
          }
        }
      });
      
      projectsListContainer.appendChild(div);
    });
  } catch (err) {
    console.error(err);
    projectsListContainer.innerHTML = '<p style="color: #ff4444;">Erro ao carregar projetos.</p>';
  }
}
