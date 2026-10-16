import * as THREE from 'three';
import gsap from 'gsap';

/* ==========================================================================
   1. UTILITIES: DEBOUNCE, THROTTLE & RESPONSIVE VIEWPORT METRICS
   ========================================================================== */
const debounce = (fn, delay = 150) => {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
};

const throttle = (fn, limit = 80) => {
  let inThrottle = false;
  return (...args) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
  };
};

// Calcula o FOV ideal (zoom = 1) com base na proporção da tela (Mobile-First)
const getIdealBaseFov = () => {
  const aspect = window.innerWidth / Math.max(1, window.innerHeight);
  if (aspect < 0.65) return 78; // Smartphones em retrato estreito
  if (aspect < 1.0) return 70;  // Smartphones / Tablets em retrato
  if (aspect > 2.2) return 54;  // Monitores Ultra-Wide
  return 60;                    // Desktop padrão (16:9 / 16:10)
};

/* ==========================================================================
   2. THREE.JS SCENE, CAMERA & RENDERER SETUP (OPTIMIZED FOR 60FPS)
   ========================================================================== */
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050505);
scene.fog = new THREE.Fog(0x050505, 6, 28);

let baseFov = getIdealBaseFov();
const camera = new THREE.PerspectiveCamera(baseFov, window.innerWidth / window.innerHeight, 0.1, 60);
camera.position.set(0, 0, 0);

const renderer = new THREE.WebGLRenderer({
  antialias: window.devicePixelRatio < 2,
  alpha: false,
  powerPreference: 'high-performance',
  stencil: false,
  depth: true
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
container.appendChild(renderer.domElement);

const galleryGroup = new THREE.Group();
scene.add(galleryGroup);

const textureLoader = new THREE.TextureLoader();
const maxAnisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 4);
const loaderEl = document.getElementById('loader');

// Geometrias compartilhadas (evita realocação na GPU e vazamento de memória)
const cardGeometry = new THREE.PlaneGeometry(5.4, 4.5);
const textPlaneGeometry = new THREE.PlaneGeometry(4.4, 1.1);

let cards = [];
let radius = 12;
let allProjects = [];
let siteSettings = {};

// Instâncias reutilizáveis para evitar Garbage Collection no loop de eventos
const pointerVec = new THREE.Vector2();
const tempWorldPos = new THREE.Vector3();
const raycaster = new THREE.Raycaster();

/* ==========================================================================
   3. CAMERA FOCUS, COORDINATE ANCHORING (X, Y) & ZOOM RESET
   ========================================================================== */
let isDetailView = false;
let isRendering = true;
let isTabVisible = !document.hidden;
let activeCard = null;

let isDragging = false;
let pointerDownPos = { x: 0, y: 0 };
let previousMousePosition = { x: 0, y: 0 };
let targetRotation = { x: 0, y: 0 };
let currentRotation = { x: 0, y: 0 };
let hasMoved = false;
let currentZoom = 1;
let targetFov = baseFov;
let autoRotatePauseUntil = 0;

/**
 * Centraliza a câmera exatamente nas coordenadas angulares (x, y) do conteúdo
 * e redefine o nível de zoom para o padrão ideal de leitura (zoom = 1).
 */
const focusCameraAt = ({ x = 0, y = 0, zoom = 1, duration = 1.15, pauseAutoRotateMs = 3500 } = {}) => {
  baseFov = getIdealBaseFov();
  currentZoom = Math.max(0.6, Math.min(2.0, zoom));
  targetFov = THREE.MathUtils.clamp(baseFov / currentZoom, 32, 95);

  // Pausa a rotação automática temporariamente para garantir leitura imediata no centro
  autoRotatePauseUntil = performance.now() + pauseAutoRotateMs;

  // Normaliza o caminho angular mais curto no eixo Y para evitar giros bruscos de 360°
  const twoPi = Math.PI * 2;
  const deltaY = ((y - currentRotation.y + Math.PI) % twoPi + twoPi) % twoPi - Math.PI;
  const shortestTargetY = currentRotation.y + deltaY;
  const clampedTargetX = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, x));

  targetRotation.x = clampedTargetX;
  targetRotation.y = shortestTargetY;

  gsap.killTweensOf([currentRotation, camera.position, camera]);

  gsap.to(currentRotation, {
    x: clampedTargetX,
    y: shortestTargetY,
    duration,
    ease: 'power3.out',
    onUpdate: () => {
      galleryGroup.rotation.x = currentRotation.x;
      galleryGroup.rotation.y = currentRotation.y;
    }
  });

  gsap.to(camera.position, {
    x: 0,
    y: 0,
    z: 0,
    duration,
    ease: 'power3.out'
  });

  gsap.to(camera, {
    fov: targetFov,
    duration: duration * 0.85,
    ease: 'power2.out',
    onUpdate: () => {
      camera.updateProjectionMatrix();
    }
  });
};

/* ==========================================================================
   4. ANALYTICS & DATA HELPERS
   ========================================================================== */
const trackEvent = (eventName, params = {}) => {
  if (typeof window.gtag === 'function') {
    window.gtag('event', eventName, params);
  }
};

const getYoutubeEmbedUrl = (url) => {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=|shorts\/)([^#&?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? `https://www.youtube.com/embed/${match[2]}` : null;
};

const mergeProjectMeta = (projects, settings) => {
  const metaMap = (settings && settings.projectMeta) ? settings.projectMeta : {};
  const META_SEPARATOR = '\n<!--LEVEL_META:';
  const META_END = '-->';

  return (projects || [])
    .map(p => {
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

      const extra = metaMap[p.id] || {};
      return {
        ...p,
        desc: rawDesc,
        area: p.area || extra.area || embedded.area || '',
        bedrooms: p.bedrooms || extra.bedrooms || embedded.bedrooms || '',
        garage: p.garage || extra.garage || embedded.garage || '',
        status: p.status || extra.status || embedded.status || '',
        videoUrl: p.videoUrl || extra.videoUrl || embedded.videoUrl || '',
        visible: p.visible !== undefined ? p.visible : (extra.visible !== undefined ? extra.visible : (embedded.visible !== false)),
        order: typeof p.order === 'number' ? p.order : (typeof extra.order === 'number' ? extra.order : (typeof embedded.order === 'number' ? embedded.order : 9999))
      };
    })
    .filter(p => p.visible !== false)
    .sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999));
};

/* ==========================================================================
   5. GALLERY BUILDER WITH ANCHORED SPHERICAL COORDINATES
   ========================================================================== */
const clearGallery = () => {
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
    });
    galleryGroup.remove(child);
  }
  cards = [];
};

const computeCardSphericalCoords = (index, count) => {
  if (count <= 1) {
    return { phi: Math.PI / 2, theta: Math.PI };
  }

  if (count <= 4) {
    return {
      phi: Math.PI / 2,
      theta: Math.PI + (index * (2 * Math.PI)) / count
    };
  }

  // Ancora o primeiro projeto (index === 0) no slot central da espiral (k = 0 -> phi = PI/2, theta = PI)
  // e distribui os demais projetos nos slots restantes sem colisão espacial.
  const mid = Math.floor((count - 1) / 2);
  const slot = index === 0 ? mid : (index <= mid ? index - 1 : index);
  const k = slot - mid;
  const maxHalfSpan = Math.max(1, mid, count - 1 - mid);

  const maxVerticalSpread = Math.min(0.68, count * 0.075);
  const h = (k / maxHalfSpan) * maxVerticalSpread;
  const phi = Math.acos(h);
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const theta = Math.PI + k * goldenAngle;

  return { phi, theta };
};

const buildGallery = (projects, { resetCamera = true } = {}) => {
  clearGallery();

  const galleryItems = (projects || []).filter(p => {
    const facadePath = p.facades ? p.facades[0] : p.facade;
    return Boolean(facadePath);
  });

  if (galleryItems.length === 0) {
    if (loaderEl) {
      loaderEl.innerText = 'Nenhum projeto encontrado';
      loaderEl.style.display = 'block';
      gsap.to(loaderEl, { opacity: 1, duration: 0.25 });
    }
    return;
  }

  const count = galleryItems.length;
  radius = Math.max(8.5, 2.75 * Math.sqrt(count));

  if (resetCamera) {
    focusCameraAt({ x: 0, y: 0, zoom: 1, duration: 1.1 });
  }

  let firstLoaded = false;
  if (loaderEl) {
    loaderEl.innerText = 'Carregando Galeria...';
    loaderEl.style.display = 'block';
    gsap.to(loaderEl, { opacity: 1, duration: 0.2 });
  }

  const hideLoaderOnceReady = () => {
    if (firstLoaded || !loaderEl) return;
    firstLoaded = true;
    gsap.to(loaderEl, {
      opacity: 0,
      duration: 0.35,
      onComplete: () => {
        loaderEl.style.display = 'none';
      }
    });
  };

  galleryItems.forEach((item, index) => {
    const imgUrl = item.facades ? item.facades[0] : item.facade;
    const { phi, theta } = computeCardSphericalCoords(index, count);

    // Coordenadas angulares exatas (X, Y) para focar este card diretamente no centro da viewport
    const anchorCoords = {
      x: phi - Math.PI / 2,
      y: Math.PI - theta
    };

    textureLoader.load(
      imgUrl,
      (texture) => {
        texture.anisotropy = maxAnisotropy;
        texture.generateMipmaps = true;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;

        const material = new THREE.MeshBasicMaterial({
          map: texture,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0
        });

        const card = new THREE.Mesh(cardGeometry, material);
        card.userData = {
          ...item,
          anchorCoords
        };

        let textMaterial = null;
        if (item.lotSize) {
          const canvas = document.createElement('canvas');
          canvas.width = 512;
          canvas.height = 128;
          const context = canvas.getContext('2d');
          context.font = '400 34px Inter, sans-serif';
          context.fillStyle = 'rgba(255, 255, 255, 0.9)';
          context.textAlign = 'center';
          context.textBaseline = 'middle';
          const labelText = item.area ? `Lote: ${item.lotSize} • ${item.area}` : `Lote: ${item.lotSize}`;
          context.fillText(labelText, 256, 64);

          const textTexture = new THREE.CanvasTexture(canvas);
          textTexture.minFilter = THREE.LinearFilter;

          textMaterial = new THREE.MeshBasicMaterial({
            map: textTexture,
            transparent: true,
            opacity: 0,
            depthWrite: false
          });
          const textPlane = new THREE.Mesh(textPlaneGeometry, textMaterial);
          textPlane.position.y = -2.8;
          card.add(textPlane);
        }

        card.position.setFromSphericalCoords(radius, phi, theta);
        card.lookAt(0, 0, 0);

        galleryGroup.add(card);
        cards.push(card);

        const delay = Math.min(index * 0.06, 0.35);
        gsap.to(material, { opacity: 1, duration: 0.75, delay });
        if (textMaterial) gsap.to(textMaterial, { opacity: 1, duration: 0.75, delay });

        hideLoaderOnceReady();
      },
      undefined,
      () => {
        hideLoaderOnceReady();
      }
    );
  });
};

/* ==========================================================================
   6. POINTER, WHEEL & TOUCH INTERACTION (MOBILE-FIRST & THROTTLED)
   ========================================================================== */
const detailOverlay = document.getElementById('detail-overlay');
const detailTitle = document.getElementById('detail-title');
const detailSubtitle = document.getElementById('detail-subtitle');
const detailSpecs = document.getElementById('detail-specs');
const detailDesc = document.getElementById('detail-desc');
const detailWhatsappBtn = document.getElementById('detail-whatsapp-btn');
const detailVideoWrapper = document.getElementById('detail-video-wrapper');
const detailFacadesContainer = document.getElementById('detail-facades-container');
const detailPlansContainer = document.getElementById('detail-plans-container');
const backBtn = document.getElementById('back-btn');

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

// Hover raycast otimizado com throttle (não roda durante drag nem bloqueia 60fps)
const updateHoverCursor = throttle((clientX, clientY) => {
  if (isDetailView || isDragging || cards.length === 0) return;
  pointerVec.set(
    (clientX / window.innerWidth) * 2 - 1,
    -(clientY / window.innerHeight) * 2 + 1
  );
  raycaster.setFromCamera(pointerVec, camera);
  const intersects = raycaster.intersectObjects(cards, false);
  document.body.style.cursor = intersects.length > 0 ? 'pointer' : 'grab';
}, 90);

// Suporte a Pinch-to-Zoom suave no Mobile
const activePointers = new Map();
let initialPinchDistance = null;
let initialPinchFov = baseFov;

const getPinchDistance = () => {
  const pts = Array.from(activePointers.values());
  if (pts.length < 2) return 0;
  return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
};

const onPointerDown = (e) => {
  if (isDetailView || isUIElement(e.target)) return;

  activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (activePointers.size === 2) {
    isDragging = false;
    hasMoved = true;
    initialPinchDistance = getPinchDistance();
    initialPinchFov = targetFov;
    return;
  }

  isDragging = true;
  hasMoved = false;
  pointerDownPos = { x: e.clientX, y: e.clientY };
  previousMousePosition = { x: e.clientX, y: e.clientY };
  if (e.pointerType === 'mouse') {
    document.body.style.cursor = 'grabbing';
  }
};

const onPointerMove = (e) => {
  if (isDetailView) return;

  if (activePointers.has(e.pointerId)) {
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  }

  // Pinch-to-zoom com 2 dedos no mobile
  if (activePointers.size === 2 && initialPinchDistance > 0) {
    const currentDist = getPinchDistance();
    const scale = initialPinchDistance / Math.max(20, currentDist);
    targetFov = THREE.MathUtils.clamp(initialPinchFov * scale, 35, 92);
    return;
  }

  if (!isDragging) {
    if (e.pointerType === 'mouse' && !isUIElement(e.target)) {
      updateHoverCursor(e.clientX, e.clientY);
    }
    return;
  }

  const totalDeltaX = e.clientX - pointerDownPos.x;
  const totalDeltaY = e.clientY - pointerDownPos.y;

  const moveThreshold = e.pointerType === 'touch' ? 12 : 5;
  if (Math.hypot(totalDeltaX, totalDeltaY) > moveThreshold) {
    hasMoved = true;
  }

  const deltaMoveX = e.clientX - previousMousePosition.x;
  const deltaMoveY = e.clientY - previousMousePosition.y;

  const sensitivity = e.pointerType === 'touch' ? 0.0045 : 0.0038;
  targetRotation.y += deltaMoveX * sensitivity;
  targetRotation.x = THREE.MathUtils.clamp(
    targetRotation.x + deltaMoveY * sensitivity,
    -Math.PI / 3.2,
    Math.PI / 3.2
  );

  previousMousePosition = { x: e.clientX, y: e.clientY };
};

const onPointerUp = (e) => {
  activePointers.delete(e.pointerId);
  if (activePointers.size < 2) {
    initialPinchDistance = null;
  }

  if (isDetailView) return;
  const wasDragging = isDragging;
  isDragging = false;
  if (e.pointerType === 'mouse') {
    document.body.style.cursor = 'grab';
  }

  if (!wasDragging || hasMoved || isUIElement(e.target)) return;

  camera.updateMatrixWorld();
  galleryGroup.updateMatrixWorld(true);

  pointerVec.set(
    (e.clientX / window.innerWidth) * 2 - 1,
    -(e.clientY / window.innerHeight) * 2 + 1
  );

  raycaster.setFromCamera(pointerVec, camera);
  const intersects = raycaster.intersectObjects(cards, true);

  if (intersects.length > 0) {
    const selectedCard = getCardFromIntersection(intersects[0].object);
    if (selectedCard) {
      openDetail(selectedCard);
    }
  }
};

const onPointerCancel = (e) => {
  if (e && e.pointerId !== undefined) {
    activePointers.delete(e.pointerId);
  } else {
    activePointers.clear();
  }
  initialPinchDistance = null;
  isDragging = false;
  document.body.style.cursor = 'grab';
};

window.addEventListener('wheel', (e) => {
  if (isDetailView || isUIElement(e.target)) return;
  targetFov = THREE.MathUtils.clamp(targetFov + e.deltaY * 0.04, 32, 92);
}, { passive: true });

window.addEventListener('pointerdown', onPointerDown, { passive: true });
window.addEventListener('pointermove', onPointerMove, { passive: true });
window.addEventListener('pointerup', onPointerUp, { passive: true });
window.addEventListener('pointercancel', onPointerCancel, { passive: true });
window.addEventListener('pointerleave', onPointerCancel, { passive: true });

/* ==========================================================================
   7. PROJECT DETAIL OVERLAY
   ========================================================================== */
const openDetail = (card) => {
  if (isDetailView) return;
  isDetailView = true;
  history.pushState({ view: 'detail' }, '', '#projeto');
  activeCard = card;
  const data = card.userData;

  trackEvent('visualizar_projeto', {
    projeto_titulo: data.title || 'Projeto',
    projeto_lote: data.lotSize || ''
  });

  detailTitle.innerText = data.title || '';
  detailSubtitle.innerText = data.subtitle || '';
  detailDesc.innerText = data.desc || '';

  detailSpecs.innerHTML = '';
  const badges = [
    data.houseType ? `🏠 ${data.houseType}` : null,
    data.lotSize ? `📏 Lote: ${data.lotSize}` : null,
    data.area ? `📐 Área: ${data.area}` : null,
    data.bedrooms ? `🛏️ ${data.bedrooms}` : null,
    data.garage ? `🚗 ${data.garage}` : null,
    data.status ? `✨ ${data.status}` : null
  ].filter(Boolean);

  const specsFragment = document.createDocumentFragment();
  badges.forEach(text => {
    const span = document.createElement('span');
    span.className = 'spec-badge';
    span.innerText = text;
    specsFragment.appendChild(span);
  });
  detailSpecs.appendChild(specsFragment);

  if (detailWhatsappBtn) {
    let basePhone = '5544998641000';
    if (siteSettings.whatsapp) {
      const phoneMatch = siteSettings.whatsapp.match(/(\d{10,15})/);
      if (phoneMatch) basePhone = phoneMatch[1];
    }
    const msg = `Olá! Vi o projeto "${data.title || ''}" (${data.lotSize ? `Lote ${data.lotSize}` : ''}) no site da Level Construtora e gostaria de mais informações.`;
    detailWhatsappBtn.href = `https://wa.me/${basePhone}?text=${encodeURIComponent(msg)}`;
    detailWhatsappBtn.onclick = () => {
      trackEvent('clique_whatsapp_projeto', {
        projeto_titulo: data.title || 'Projeto'
      });
    };
  }

  if (detailVideoWrapper) {
    const embedUrl = getYoutubeEmbedUrl(data.videoUrl);
    if (embedUrl) {
      detailVideoWrapper.style.display = 'block';
      detailVideoWrapper.innerHTML = `<iframe src="${embedUrl}" title="${data.title || 'Vídeo do Projeto'}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
    } else {
      detailVideoWrapper.style.display = 'none';
      detailVideoWrapper.innerHTML = '';
    }
  }

  detailFacadesContainer.innerHTML = '';
  const facadesArray = (data.facades || [data.facade]).filter(Boolean);
  const facadesFragment = document.createDocumentFragment();
  facadesArray.forEach((path, idx) => {
    const img = document.createElement('img');
    img.src = path;
    img.alt = `${data.title || 'Projeto'} - Fachada ${idx + 1}`;
    img.loading = idx === 0 ? 'eager' : 'lazy';
    img.decoding = 'async';
    facadesFragment.appendChild(img);
  });
  detailFacadesContainer.appendChild(facadesFragment);

  detailPlansContainer.innerHTML = '';
  const plansArray = (data.plans || [data.plan]).filter(Boolean);
  detailPlansContainer.style.display = plansArray.length > 0 ? 'flex' : 'none';
  const plansFragment = document.createDocumentFragment();
  plansArray.forEach((path, idx) => {
    const img = document.createElement('img');
    img.src = path;
    img.alt = `${data.title || 'Projeto'} - Planta ${idx + 1}`;
    img.loading = 'lazy';
    img.decoding = 'async';
    plansFragment.appendChild(img);
  });
  detailPlansContainer.appendChild(plansFragment);

  card.getWorldPosition(tempWorldPos);
  const camTargetPos = tempWorldPos.clone().multiplyScalar(0.68);

  gsap.to(camera.position, {
    x: camTargetPos.x,
    y: camTargetPos.y,
    z: camTargetPos.z,
    duration: 1.2,
    ease: 'power3.inOut'
  });

  detailOverlay.style.display = 'flex';
  detailOverlay.classList.add('active-detail');
  detailOverlay.scrollTop = 0;

  gsap.to(detailOverlay, {
    autoAlpha: 1,
    duration: 0.75,
    delay: 0.4,
    ease: 'power2.out',
    onComplete: () => {
      isRendering = false;
    }
  });
};

const closeDetail = () => {
  if (!isDetailView) return;
  isRendering = true;
  detailOverlay.classList.remove('active-detail');

  if (detailVideoWrapper) {
    detailVideoWrapper.innerHTML = '';
  }

  // Ao voltar para a galeria, garante que o card ativo esteja centralizado e com zoom padrão (zoom = 1)
  const returnCoords = activeCard && activeCard.userData && activeCard.userData.anchorCoords
    ? activeCard.userData.anchorCoords
    : { x: currentRotation.x, y: currentRotation.y };

  gsap.to(detailOverlay, {
    autoAlpha: 0,
    duration: 0.4,
    ease: 'power2.in',
    onComplete: () => {
      detailOverlay.style.display = 'none';
      focusCameraAt({
        x: returnCoords.x,
        y: returnCoords.y,
        zoom: 1,
        duration: 1.15
      });
      isDetailView = false;
      activeCard = null;
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

/* ==========================================================================
   8. MENU / SEARCH OVERLAY WITH COORDINATE ANCHORING & ZOOM RESET
   ========================================================================== */
const openSearchBtn = document.getElementById('open-search-btn');
const closeSearchBtn = document.getElementById('close-search-btn');
const searchOverlay = document.getElementById('search-overlay');
const searchOptionsContainer = document.getElementById('search-options-container');
let currentFilter = null;

const closeSearchMenu = () => {
  if (!searchOverlay || !searchOverlay.classList.contains('active')) return;
  if (window.location.hash === '#pesquisa') {
    history.back();
  } else {
    searchOverlay.classList.remove('active');
  }
};

const applyMenuFilterAndFocus = (filterKey, filteredProjects) => {
  currentFilter = filterKey;
  // Reconstrói a galeria ancorando o item principal em (X = 0, Y = 0) e reseta o zoom = 1
  buildGallery(filteredProjects, { resetCamera: true });
  closeSearchMenu();
};

const createMenuButton = (label, isActive, onClick) => {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'submit-btn';
  btn.style.background = isActive ? '#ffffff' : 'transparent';
  btn.style.color = isActive ? '#050505' : '#ffffff';
  btn.style.border = isActive ? '1px solid #ffffff' : '1px solid rgba(255, 255, 255, 0.35)';
  btn.innerText = label;
  btn.addEventListener('click', onClick);
  return btn;
};

const normalizeLotSize = (value) => (value || '').trim().replace(/\s+/g, ' ').toUpperCase();

if (openSearchBtn && searchOverlay && searchOptionsContainer) {
  openSearchBtn.addEventListener('click', () => {
    trackEvent('abrir_filtro_projetos');
    searchOverlay.classList.add('active');
    if (window.location.hash !== '#pesquisa') {
      history.pushState({ view: 'search' }, '', '#pesquisa');
    }

    const sizes = [...new Set(allProjects.map(p => normalizeLotSize(p.lotSize)).filter(Boolean))];
    searchOptionsContainer.innerHTML = '';

    const fragment = document.createDocumentFragment();

    // Opção 1: Ver Todos (reseta filtro, reseta zoom = 1 e centraliza câmera em X=0, Y=0)
    fragment.appendChild(
      createMenuButton(`Ver Todos (${allProjects.length})`, currentFilter === null, () => {
        applyMenuFilterAndFocus(null, allProjects);
      })
    );

    // Opção 2: Filtro por Medida de Lote
    if (sizes.length > 0) {
      const sizeLabel = document.createElement('p');
      sizeLabel.className = 'menu-section-label';
      sizeLabel.innerText = 'Por Medida de Lote';
      fragment.appendChild(sizeLabel);

      sizes.forEach(size => {
        fragment.appendChild(
          createMenuButton(`Lote ${size}`, currentFilter === size, () => {
            const filtered = allProjects.filter(p => normalizeLotSize(p.lotSize) === size);
            applyMenuFilterAndFocus(size, filtered);
          })
        );
      });
    }

    searchOptionsContainer.appendChild(fragment);
  });
}

if (closeSearchBtn) {
  closeSearchBtn.addEventListener('click', closeSearchMenu);
}

if (searchOverlay) {
  // Permite fechar o menu clicando fora do modal (no backdrop)
  searchOverlay.addEventListener('click', (e) => {
    if (e.target === searchOverlay) {
      closeSearchMenu();
    }
  });
}

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (searchOverlay && searchOverlay.classList.contains('active')) {
      closeSearchMenu();
    } else if (isDetailView) {
      if (window.location.hash === '#projeto') history.back();
      else closeDetail();
    }
  }
});

window.addEventListener('popstate', () => {
  if (isDetailView) {
    closeDetail();
  }
  if (searchOverlay && searchOverlay.classList.contains('active')) {
    searchOverlay.classList.remove('active');
  }
});

/* ==========================================================================
   9. FAST PARALLEL INITIALIZATION & SOCIAL LINKS
   ========================================================================== */
const linkInstagram = document.getElementById('link-instagram');
const linkFacebook = document.getElementById('link-facebook');
const linkYoutube = document.getElementById('link-youtube');
const linkWhatsapp = document.getElementById('link-whatsapp');
const footerAddressText = document.getElementById('footer-address-text');
const siteLogos = document.querySelectorAll('.site-logo');

if (linkWhatsapp) {
  linkWhatsapp.addEventListener('click', () => {
    trackEvent('clique_whatsapp_rodape');
  });
}

const updateSocialLink = (element, url, enabled) => {
  if (!element) return;
  if (enabled === false || !url || url.trim() === '' || url.trim() === '#') {
    element.style.display = 'none';
  } else {
    element.style.display = 'inline-flex';
    element.href = url.trim();
  }
};

const initApp = async () => {
  try {
    const cacheBuster = Date.now();
    // Carregamento paralelo para reduzir pela metade o tempo de espera na inicialização
    const [settingsRes, projectsRes] = await Promise.all([
      fetch(`/api/settings?t=${cacheBuster}`, { cache: 'no-store' }).catch(() => null),
      fetch(`/api/projects?t=${cacheBuster}`, { cache: 'no-store' }).catch(() => null)
    ]);

    if (settingsRes && settingsRes.ok) {
      const data = await settingsRes.json();
      siteSettings = data || {};

      let cleanNumber = '5544998641000';
      if (data.whatsapp) {
        const match = data.whatsapp.match(/(\d{10,15})/);
        if (match) cleanNumber = match[1];
      }

      const customMsg = data.whatsappMsg !== undefined && data.whatsappMsg !== ''
        ? data.whatsappMsg
        : 'Olá! Encontrei a construtora no Google, gostaria de mais informações.';

      const whatsUrl = `https://wa.me/${cleanNumber}?text=${encodeURIComponent(customMsg)}`;

      updateSocialLink(linkInstagram, data.instagram, data.instagramEnabled);
      updateSocialLink(linkFacebook, data.facebook, data.facebookEnabled);
      updateSocialLink(linkYoutube, data.youtube, data.youtubeEnabled);
      updateSocialLink(linkWhatsapp, whatsUrl, data.whatsappEnabled);

      if (footerAddressText && data.address) {
        footerAddressText.innerText = data.address;
      }

      siteLogos.forEach(img => {
        if (data.hasLogo === false) {
          img.style.display = 'none';
        } else {
          img.style.display = 'block';
          img.src = `/images/logo.png?t=${data.logoUpdatedAt || cacheBuster}`;
        }
      });
    }

    if (projectsRes && projectsRes.ok) {
      const rawProjects = await projectsRes.json();
      allProjects = mergeProjectMeta(rawProjects, siteSettings);
      buildGallery(allProjects, { resetCamera: true });
    } else {
      buildGallery([], { resetCamera: true });
    }
  } catch (err) {
    console.error('Erro ao inicializar:', err);
    buildGallery([], { resetCamera: true });
  }
};

initApp();

document.body.style.cursor = 'grab';

/* ==========================================================================
   10. HIGH-EFFICIENCY 60FPS RENDER LOOP & DEBOUNCED RESIZE
   ========================================================================== */
document.addEventListener('visibilitychange', () => {
  isTabVisible = !document.hidden;
});

let lastFrameTime = performance.now();

const tick = (now = performance.now()) => {
  requestAnimationFrame(tick);

  const deltaSeconds = Math.min((now - lastFrameTime) / 1000, 0.1);
  lastFrameTime = now;

  if (!isTabVisible) return;

  if (!isDetailView) {
    // Interpolação independente de taxa de quadros (frame-rate independent damping)
    const damping = 1 - Math.pow(0.001, deltaSeconds);

    currentRotation.x += (targetRotation.x - currentRotation.x) * damping;
    currentRotation.y += (targetRotation.y - currentRotation.y) * damping;

    galleryGroup.rotation.x = currentRotation.x;
    galleryGroup.rotation.y = currentRotation.y;

    if (!isDragging && activePointers.size === 0 && now > autoRotatePauseUntil) {
      targetRotation.y -= 0.032 * deltaSeconds;
    }

    if (Math.abs(camera.fov - targetFov) > 0.01) {
      camera.fov += (targetFov - camera.fov) * damping;
      camera.updateProjectionMatrix();
    }
  }

  if (isRendering) {
    renderer.render(scene, camera);
  }
};

requestAnimationFrame(tick);

const handleResize = debounce(() => {
  const width = window.innerWidth;
  const height = Math.max(1, window.innerHeight);

  baseFov = getIdealBaseFov();
  targetFov = THREE.MathUtils.clamp(baseFov / currentZoom, 32, 95);

  camera.aspect = width / height;
  camera.fov = targetFov;
  camera.updateProjectionMatrix();

  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
}, 120);

window.addEventListener('resize', handleResize, { passive: true });
document.addEventListener('contextmenu', event => event.preventDefault());
