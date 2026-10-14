import * as THREE from 'three';
import gsap from 'gsap';

const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050505);
scene.fog = new THREE.Fog(0x050505, 5, 25);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.z = 0;

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
container.appendChild(renderer.domElement);

const galleryGroup = new THREE.Group();
scene.add(galleryGroup);

const textureLoader = new THREE.TextureLoader();
const loaderEl = document.getElementById('loader');
const cardGeometry = new THREE.PlaneGeometry(5.4, 4.5);
let cards = [];
let radius = 12;

let allProjects = [];

const fetchProjects = async () => {
  try {
    const res = await fetch(`/api/projects?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    console.error('Failed to fetch projects', err);
    return [];
  }
};

const buildGallery = (projects) => {
  while (galleryGroup.children.length > 0) {
    const child = galleryGroup.children[0];
    if (child.material) {
      if (child.material.map) child.material.map.dispose();
      child.material.dispose();
    }
    child.children.forEach(subchild => {
      if (subchild.material) {
        if (subchild.material.map) subchild.material.map.dispose();
        subchild.material.dispose();
      }
      if (subchild.geometry) subchild.geometry.dispose();
    });
    galleryGroup.remove(child);
  }
  cards = [];

  const galleryItems = (projects || []).filter(p => {
    const facadePath = p.facades ? p.facades[0] : p.facade;
    return Boolean(facadePath);
  });

  if (galleryItems.length === 0) {
    if (loaderEl) {
      loaderEl.innerText = 'Nenhum projeto cadastrado';
      loaderEl.style.display = 'block';
      gsap.to(loaderEl, { opacity: 1, duration: 0.3 });
    }
    return;
  }

  const count = galleryItems.length;
  radius = Math.max(8, 2.8 * Math.sqrt(count));

  let processedCount = 0;
  if (loaderEl) {
    loaderEl.innerText = 'Carregando Galeria...';
    loaderEl.style.display = 'block';
    gsap.to(loaderEl, { opacity: 1, duration: 0.3 });
  }

  const checkDone = () => {
    processedCount++;
    if (processedCount >= galleryItems.length && loaderEl) {
      gsap.to(loaderEl, {
        opacity: 0,
        duration: 0.5,
        onComplete: () => { loaderEl.style.display = 'none'; }
      });
    }
  };

  galleryItems.forEach((item, index) => {
    const imgUrl = item.facades ? item.facades[0] : item.facade;

    textureLoader.load(
      imgUrl,
      (texture) => {
        texture.generateMipmaps = true;
        texture.minFilter = THREE.LinearMipmapLinearFilter;

        const material = new THREE.MeshBasicMaterial({
          map: texture,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0
        });

        const card = new THREE.Mesh(cardGeometry, material);
        card.userData = item;

        let textMaterial = null;
        if (item.lotSize) {
          const canvas = document.createElement('canvas');
          canvas.width = 512;
          canvas.height = 128;
          const context = canvas.getContext('2d');
          context.font = '300 36px Inter, sans-serif';
          context.fillStyle = 'rgba(255, 255, 255, 0.8)';
          context.textAlign = 'center';
          context.textBaseline = 'middle';
          context.fillText(`Lote: ${item.lotSize}`, 256, 64);

          const textTexture = new THREE.CanvasTexture(canvas);
          textTexture.minFilter = THREE.LinearFilter;

          textMaterial = new THREE.MeshBasicMaterial({ map: textTexture, transparent: true, opacity: 0 });
          const textPlane = new THREE.Mesh(new THREE.PlaneGeometry(4, 1), textMaterial);
          textPlane.position.y = -2.8;
          card.add(textPlane);
        }

        let phi = Math.PI / 2;
        let theta = Math.PI;

        if (count === 1) {
          phi = Math.PI / 2;
          theta = Math.PI;
        } else if (count <= 4) {
          phi = Math.PI / 2;
          theta = Math.PI + (index * (2 * Math.PI)) / count;
        } else {
          const maxVerticalSpread = Math.min(0.75, count * 0.08);
          const h = -maxVerticalSpread + (2 * maxVerticalSpread * index) / (count - 1);
          phi = Math.acos(h);
          theta = Math.sqrt(count * Math.PI) * phi;
        }

        card.position.setFromSphericalCoords(radius, phi, theta);
        card.lookAt(0, 0, 0);

        galleryGroup.add(card);
        cards.push(card);

        const delay = Math.random() * 0.4;
        gsap.to(material, { opacity: 1, duration: 1, delay });
        if (textMaterial) gsap.to(textMaterial, { opacity: 1, duration: 1, delay });

        checkDone();
      },
      undefined,
      () => {
        checkDone();
      }
    );
  });
};

fetchProjects().then(data => {
  allProjects = data;
  buildGallery(data);
});

const raycaster = new THREE.Raycaster();
let isDetailView = false;
let isRendering = true;
let activeCard = null;

const detailOverlay = document.getElementById('detail-overlay');
const detailTitle = document.getElementById('detail-title');
const detailSubtitle = document.getElementById('detail-subtitle');
const detailSpecs = document.getElementById('detail-specs');
const detailDesc = document.getElementById('detail-desc');
const detailFacadesContainer = document.getElementById('detail-facades-container');
const detailPlansContainer = document.getElementById('detail-plans-container');
const backBtn = document.getElementById('back-btn');

let isDragging = false;
let pointerDownPos = { x: 0, y: 0 };
let previousMousePosition = { x: 0, y: 0 };
let targetRotation = { x: 0, y: 0 };
let currentRotation = { x: 0, y: 0 };
let hasMoved = false;
let targetFov = 60;

window.addEventListener('wheel', (e) => {
  if (isDetailView) return;
  targetFov += e.deltaY * 0.05;
  targetFov = Math.max(30, Math.min(100, targetFov));
}, { passive: true });

const isUIElement = (target) => {
  if (!target || typeof target.closest !== 'function') return false;
  return Boolean(
    target.closest('#search-overlay') ||
    target.closest('.admin-overlay') ||
    target.closest('.header') ||
    target.closest('.social-footer') ||
    target.closest('#detail-overlay')
  );
};

const getCardFromIntersection = (intersectObj) => {
  let obj = intersectObj;
  while (obj && !cards.includes(obj)) {
    obj = obj.parent;
  }
  return obj;
};

const onPointerDown = (e) => {
  if (isDetailView || isUIElement(e.target)) return;
  isDragging = true;
  hasMoved = false;
  pointerDownPos = { x: e.clientX, y: e.clientY };
  previousMousePosition = { x: e.clientX, y: e.clientY };
  document.body.style.cursor = 'grabbing';
};

const onPointerMove = (e) => {
  if (isDetailView) return;

  if (e.pointerType === 'mouse') {
    const mouse = new THREE.Vector2(
      (e.clientX / window.innerWidth) * 2 - 1,
      -(e.clientY / window.innerHeight) * 2 + 1
    );
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(cards, true);

    if (intersects.length > 0) {
      document.body.style.cursor = isDragging ? 'grabbing' : 'pointer';
    } else {
      document.body.style.cursor = isDragging ? 'grabbing' : 'grab';
    }
  }

  if (!isDragging) return;

  const totalDeltaX = e.clientX - pointerDownPos.x;
  const totalDeltaY = e.clientY - pointerDownPos.y;

  // Tolerância maior para telas sensíveis ao toque (iPhone/Android)
  const moveThreshold = e.pointerType === 'touch' ? 12 : 5;
  if (Math.hypot(totalDeltaX, totalDeltaY) > moveThreshold) {
    hasMoved = true;
  }

  const deltaMove = {
    x: e.clientX - previousMousePosition.x,
    y: e.clientY - previousMousePosition.y
  };

  targetRotation.y += deltaMove.x * 0.005;
  targetRotation.x += deltaMove.y * 0.005;
  targetRotation.x = Math.max(-Math.PI / 4, Math.min(Math.PI / 4, targetRotation.x));

  previousMousePosition = { x: e.clientX, y: e.clientY };
};

const onPointerUp = (e) => {
  if (isDetailView) return;
  const wasDragging = isDragging;
  isDragging = false;
  document.body.style.cursor = 'grab';

  if (!wasDragging || hasMoved || isUIElement(e.target)) return;

  // Garante que matrizes da câmera e dos cards estejam atualizadas no momento do toque
  camera.updateMatrixWorld();
  galleryGroup.updateMatrixWorld(true);

  const pointer = new THREE.Vector2(
    (e.clientX / window.innerWidth) * 2 - 1,
    -(e.clientY / window.innerHeight) * 2 + 1
  );

  raycaster.setFromCamera(pointer, camera);
  const intersects = raycaster.intersectObjects(cards, true);

  if (intersects.length > 0) {
    const selectedCard = getCardFromIntersection(intersects[0].object);
    if (selectedCard) {
      openDetail(selectedCard);
    }
  }
};

const onPointerCancel = () => {
  isDragging = false;
  document.body.style.cursor = 'grab';
};

window.addEventListener('pointerdown', onPointerDown);
window.addEventListener('pointermove', onPointerMove);
window.addEventListener('pointerup', onPointerUp);
window.addEventListener('pointercancel', onPointerCancel);
window.addEventListener('pointerleave', onPointerCancel);

const openDetail = (card) => {
  if (isDetailView) return;
  isDetailView = true;
  history.pushState({ view: 'detail' }, '', '#projeto');
  activeCard = card;
  const data = card.userData;

  detailTitle.innerText = data.title || '';
  detailSubtitle.innerText = data.subtitle || '';
  detailSpecs.innerText = `${data.houseType || 'N/A'} • Lote: ${data.lotSize || 'N/A'}`;
  detailDesc.innerText = data.desc || '';

  detailFacadesContainer.innerHTML = '';
  const facadesArray = data.facades || [data.facade];
  facadesArray.forEach(path => {
    if (!path) return;
    const img = document.createElement('img');
    img.src = path;
    img.style.width = '100%';
    img.style.borderRadius = '1rem';
    detailFacadesContainer.appendChild(img);
  });

  detailPlansContainer.innerHTML = '';
  const plansArray = data.plans || [data.plan];
  plansArray.forEach(path => {
    if (!path) return;
    const img = document.createElement('img');
    img.src = path;
    img.style.width = '100%';
    img.style.borderRadius = '1rem';
    detailPlansContainer.appendChild(img);
  });

  const targetPos = new THREE.Vector3();
  card.getWorldPosition(targetPos);
  const camTargetPos = targetPos.clone().multiplyScalar(0.7);

  gsap.to(camera.position, {
    x: camTargetPos.x,
    y: camTargetPos.y,
    z: camTargetPos.z,
    duration: 1.5,
    ease: 'power3.inOut'
  });

  // Garante visibilidade e interatividade no iOS Safari
  detailOverlay.style.display = 'block';
  detailOverlay.style.pointerEvents = 'auto';
  detailOverlay.classList.add('active-detail');
  detailOverlay.scrollTop = 0;

  gsap.to(detailOverlay, {
    autoAlpha: 1,
    duration: 1,
    delay: 0.6,
    ease: 'power2.out',
    onComplete: () => {
      isRendering = false;
    }
  });
};

const closeDetail = () => {
  if (!isDetailView) return;
  isRendering = true;
  detailOverlay.style.pointerEvents = 'none';
  detailOverlay.classList.remove('active-detail');

  gsap.to(detailOverlay, {
    autoAlpha: 0,
    duration: 0.5,
    ease: 'power2.in',
    onComplete: () => {
      detailOverlay.style.display = 'none';
      gsap.to(camera.position, {
        x: 0,
        y: 0,
        z: 0,
        duration: 1.5,
        ease: 'power3.inOut',
        onComplete: () => {
          isDetailView = false;
          activeCard = null;
        }
      });
    }
  });
};

if (backBtn) {
  backBtn.addEventListener('click', () => {
    if (window.location.hash === '#projeto') {
      history.back();
    } else {
      closeDetail();
    }
  });
}

window.addEventListener('popstate', () => {
  if (isDetailView) {
    closeDetail();
  }
  if (searchOverlay && searchOverlay.classList.contains('active')) {
    searchOverlay.classList.remove('active');
  }
});

const openSearchBtn = document.getElementById('open-search-btn');
const closeSearchBtn = document.getElementById('close-search-btn');
const searchOverlay = document.getElementById('search-overlay');
const searchOptionsContainer = document.getElementById('search-options-container');
let currentFilter = null;

if (openSearchBtn && searchOverlay && searchOptionsContainer) {
  openSearchBtn.addEventListener('click', () => {
    searchOverlay.classList.add('active');
    history.pushState({ view: 'search' }, '', '#pesquisa');
    const sizes = [...new Set(allProjects.map(p => p.lotSize).filter(Boolean))];
    searchOptionsContainer.innerHTML = '';

    const btnAll = document.createElement('button');
    btnAll.className = 'submit-btn';
    btnAll.style.background = currentFilter === null ? '#fff' : 'transparent';
    btnAll.style.color = currentFilter === null ? '#000' : '#fff';
    btnAll.style.border = '1px solid #fff';
    btnAll.innerText = 'Ver Todos';
    btnAll.addEventListener('click', () => {
      currentFilter = null;
      buildGallery(allProjects);
      if (window.location.hash === '#pesquisa') history.back();
      else searchOverlay.classList.remove('active');
    });
    searchOptionsContainer.appendChild(btnAll);

    sizes.forEach(size => {
      const btn = document.createElement('button');
      btn.className = 'submit-btn';
      btn.style.background = currentFilter === size ? '#fff' : 'transparent';
      btn.style.color = currentFilter === size ? '#000' : '#fff';
      btn.style.border = '1px solid #fff';
      btn.innerText = size;
      btn.addEventListener('click', () => {
        currentFilter = size;
        const filtered = allProjects.filter(p => p.lotSize === size);
        buildGallery(filtered);
        if (window.location.hash === '#pesquisa') history.back();
        else searchOverlay.classList.remove('active');
      });
      searchOptionsContainer.appendChild(btn);
    });
  });
}

if (closeSearchBtn && searchOverlay) {
  closeSearchBtn.addEventListener('click', () => {
    if (window.location.hash === '#pesquisa') {
      history.back();
    } else {
      searchOverlay.classList.remove('active');
    }
  });
}

const linkInstagram = document.getElementById('link-instagram');
const linkFacebook = document.getElementById('link-facebook');
const linkYoutube = document.getElementById('link-youtube');
const linkWhatsapp = document.getElementById('link-whatsapp');
const siteLogos = document.querySelectorAll('.site-logo');

const updateSocialLink = (element, url, enabled) => {
  if (!element) return;
  if (enabled === false || !url || url.trim() === '' || url.trim() === '#') {
    element.style.display = 'none';
  } else {
    element.style.display = 'inline-flex';
    element.href = url.trim();
  }
};

const fetchSettings = async () => {
  try {
    const res = await fetch(`/api/settings?t=${Date.now()}`, { cache: 'no-store' });
    const data = await res.json();

    updateSocialLink(linkInstagram, data.instagram, data.instagramEnabled);
    updateSocialLink(linkFacebook, data.facebook, data.facebookEnabled);
    updateSocialLink(linkYoutube, data.youtube, data.youtubeEnabled);
    updateSocialLink(linkWhatsapp, data.whatsapp, data.whatsappEnabled);

    siteLogos.forEach(img => {
      if (data.hasLogo === false) {
        img.style.display = 'none';
      } else {
        img.style.display = 'block';
        img.src = `/images/logo.png?t=${data.logoUpdatedAt || Date.now()}`;
      }
    });
  } catch (err) {
    console.error('Failed to fetch settings', err);
  }
};

fetchSettings();

document.body.style.cursor = 'grab';

const tick = () => {
  if (!isDetailView) {
    currentRotation.x = gsap.utils.interpolate(currentRotation.x, targetRotation.x, 0.05);
    currentRotation.y = gsap.utils.interpolate(currentRotation.y, targetRotation.y, 0.05);

    galleryGroup.rotation.x = currentRotation.x;
    galleryGroup.rotation.y = currentRotation.y;

    if (!isDragging) {
      targetRotation.y -= 0.0005;
    }

    if (Math.abs(camera.fov - targetFov) > 0.01) {
      camera.fov = gsap.utils.interpolate(camera.fov, targetFov, 0.05);
      camera.updateProjectionMatrix();
    }
  }

  if (isRendering) {
    renderer.render(scene, camera);
  }
  requestAnimationFrame(tick);
};

tick();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});

document.addEventListener('contextmenu', event => event.preventDefault());
