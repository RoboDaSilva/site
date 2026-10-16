import * as THREE from 'three';
import gsap from 'gsap';

/* ==========================================================================
   1. UTILITIES: DEBOUNCE, THROTTLE, TOAST & RESPONSIVE VIEWPORT METRICS
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

const toastEl = document.getElementById('ui-toast');
let toastTimer = null;
const showToast = (msg, duration = 2600) => {
  if (!toastEl) return;
  toastEl.innerText = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.classList.remove('show');
  }, duration);
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
const textureCache = new Map();
const maxAnisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 4);
const loaderEl = document.getElementById('loader');
const gestureHintEl = document.getElementById('gesture-hint');
let gestureHintDismissed = false;

const dismissGestureHint = () => {
  if (gestureHintDismissed || !gestureHintEl) return;
  gestureHintDismissed = true;
  gsap.to(gestureHintEl, {
    autoAlpha: 0,
    y: 8,
    duration: 0.4,
    ease: 'power2.out',
    onComplete: () => {
      gestureHintEl.style.display = 'none';
    }
  });
};

// Geometrias compartilhadas (evita realocação na GPU e vazamento de memória)
const cardGeometry = new THREE.PlaneGeometry(5.4, 4.5);
const textPlaneGeometry = new THREE.PlaneGeometry(4.9, 1.35);

let cards = [];
let filteredGalleryItems = [];
let radius = 12;
let allProjects = [];
let siteSettings = {};
let galleryBuildId = 0;
let hoveredCard = null;

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

  autoRotatePauseUntil = performance.now() + pauseAutoRotateMs;

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
   4. ANALYTICS, WHATSAPP HELPER & DATA UNPACKING
   ========================================================================== */
const trackEvent = (eventName, params = {}) => {
  if (typeof window.gtag === 'function') {
    window.gtag('event', eventName, params);
  }
};

const getCleanWhatsappPhone = () => {
  let basePhone = '5544998641000';
  if (siteSettings && siteSettings.whatsapp) {
    const phoneMatch = String(siteSettings.whatsapp).match(/(\d{10,15})/);
    if (phoneMatch) basePhone = phoneMatch[1];
  }
  return basePhone;
};

const buildWhatsappUrl = (message) => {
  const phone = getCleanWhatsappPhone();
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
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
   5. GALLERY BUILDER WITH CACHED TEXTURES & 2-LINE 3D LABELS
   ========================================================================== */
const clearGallery = () => {
  hoveredCard = null;
  while (galleryGroup.children.length > 0) {
    const child = galleryGroup.children[0];
    if (child.material) {
      // Não descartamos texturas de imagem que estão no textureCache para troca instantânea de filtros
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

const createCardLabelMesh = (item) => {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 176;
  const ctx = canvas.getContext('2d');

  // Linha 1: Título do Projeto
  const titleText = (item.title || 'Projeto Level').slice(0, 32);
  ctx.font = '600 34px Inter, sans-serif';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(titleText, 320, 62);

  // Linha 2: Tipologia • Medida de Lote • Área
  const subParts = [
    item.houseType || null,
    item.lotSize ? `Lote ${item.lotSize}` : null,
    item.area || null
  ].filter(Boolean);

  if (subParts.length > 0) {
    ctx.font = '400 25px Inter, sans-serif';
    ctx.fillStyle = 'rgba(229, 193, 88, 0.92)';
    ctx.fillText(subParts.join(' • '), 320, 118);
  }

  const textTexture = new THREE.CanvasTexture(canvas);
  textTexture.minFilter = THREE.LinearFilter;

  const textMaterial = new THREE.MeshBasicMaterial({
    map: textTexture,
    transparent: true,
    opacity: 0,
    depthWrite: false
  });

  const textPlane = new THREE.Mesh(textPlaneGeometry, textMaterial);
  textPlane.position.y = -2.92;
  return { textPlane, textMaterial };
};

const loadCachedTexture = (url, onLoad, onError) => {
  if (textureCache.has(url)) {
    onLoad(textureCache.get(url));
    return;
  }
  textureLoader.load(
    url,
    (texture) => {
      texture.anisotropy = maxAnisotropy;
      texture.generateMipmaps = true;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      textureCache.set(url, texture);
      onLoad(texture);
    },
    undefined,
    onError
  );
};

const buildGallery = (projects, { resetCamera = true, onReady = null } = {}) => {
  const currentBuildId = ++galleryBuildId;
  clearGallery();

  const galleryItems = (projects || []).filter(p => {
    const facadePath = p.facades ? p.facades[0] : p.facade;
    return Boolean(facadePath);
  });
  filteredGalleryItems = galleryItems;

  if (galleryItems.length === 0) {
    if (loaderEl) {
      loaderEl.innerText = 'Nenhum projeto encontrado para este filtro';
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
  let loadedCount = 0;

  if (loaderEl) {
    loaderEl.innerText = 'Carregando Galeria...';
    loaderEl.style.display = 'block';
    gsap.to(loaderEl, { opacity: 1, duration: 0.2 });
  }

  const hideLoaderOnceReady = () => {
    if (currentBuildId !== galleryBuildId) return;
    loadedCount++;
    if (!firstLoaded && loaderEl) {
      firstLoaded = true;
      gsap.to(loaderEl, {
        opacity: 0,
        duration: 0.35,
        onComplete: () => {
          loaderEl.style.display = 'none';
        }
      });
    }
    if (loadedCount === count && typeof onReady === 'function') {
      onReady();
    }
  };

  galleryItems.forEach((item, index) => {
    const imgUrl = item.facades ? item.facades[0] : item.facade;
    const { phi, theta } = computeCardSphericalCoords(index, count);

    const anchorCoords = {
      x: phi - Math.PI / 2,
      y: Math.PI - theta
    };

    loadCachedTexture(
      imgUrl,
      (texture) => {
        if (currentBuildId !== galleryBuildId) return;

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

        const { textPlane, textMaterial } = createCardLabelMesh(item);
        card.add(textPlane);

        card.position.setFromSphericalCoords(radius, phi, theta);
        card.lookAt(0, 0, 0);

        galleryGroup.add(card);
        cards.push(card);

        const delay = Math.min(index * 0.05, 0.3);
        gsap.to(material, { opacity: 1, duration: 0.65, delay });
        gsap.to(textMaterial, { opacity: 1, duration: 0.65, delay });

        hideLoaderOnceReady();
      },
      () => {
        hideLoaderOnceReady();
      }
    );
  });
};

/* ==========================================================================
   6. POINTER, WHEEL, HOVER MICRO-INTERACTION & TOUCH (MOBILE-FIRST)
   ========================================================================== */
const detailOverlay = document.getElementById('detail-overlay');
const detailTitle = document.getElementById('detail-title');
const detailSubtitle = document.getElementById('detail-subtitle');
const detailSpecs = document.getElementById('detail-specs');
const detailDesc = document.getElementById('detail-desc');
const detailWhatsappBtn = document.getElementById('detail-whatsapp-btn');
const detailAdaptBtn = document.getElementById('detail-adapt-btn');
const detailBottomWhatsappBtn = document.getElementById('detail-bottom-whatsapp-btn');
const detailOpenSimulatorBtn = document.getElementById('detail-open-simulator-btn');
const detailVideoWrapper = document.getElementById('detail-video-wrapper');
const detailFacadesContainer = document.getElementById('detail-facades-container');
const detailPlansSection = document.getElementById('detail-plans-section');
const detailPlansContainer = document.getElementById('detail-plans-container');
const detailFavBtn = document.getElementById('detail-fav-btn');
const detailShareBtn = document.getElementById('detail-share-btn');
const prevProjectBtn = document.getElementById('prev-project-btn');
const nextProjectBtn = document.getElementById('next-project-btn');
const prevProjectTitle = document.getElementById('prev-project-title');
const nextProjectTitle = document.getElementById('next-project-title');
const detailStickyBar = document.getElementById('detail-sticky-bar');
const stickyBarTitle = document.getElementById('sticky-bar-title');
const stickyBarLot = document.getElementById('sticky-bar-lot');
const stickyBarWhatsapp = document.getElementById('sticky-bar-whatsapp');
const backBtn = document.getElementById('back-btn');

const isUIElement = (target) => {
  if (!target || typeof target.closest !== 'function') return false;
  return Boolean(
    target.closest('#search-overlay') ||
    target.closest('#simulator-overlay') ||
    target.closest('#compare-overlay') ||
    target.closest('#lightbox-overlay') ||
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

const setHoveredCard = (card) => {
  if (hoveredCard === card) return;
  if (hoveredCard) {
    gsap.to(hoveredCard.scale, { x: 1, y: 1, z: 1, duration: 0.28, ease: 'power2.out' });
  }
  hoveredCard = card;
  if (hoveredCard) {
    gsap.to(hoveredCard.scale, { x: 1.06, y: 1.06, z: 1.06, duration: 0.28, ease: 'power2.out' });
  }
};

// Hover raycast otimizado com throttle + micro-interação 3D nos cards
const updateHoverCursor = throttle((clientX, clientY) => {
  if (isDetailView || isDragging || cards.length === 0) return;
  pointerVec.set(
    (clientX / window.innerWidth) * 2 - 1,
    -(clientY / window.innerHeight) * 2 + 1
  );
  raycaster.setFromCamera(pointerVec, camera);
  const intersects = raycaster.intersectObjects(cards, false);
  if (intersects.length > 0) {
    const hitCard = getCardFromIntersection(intersects[0].object);
    setHoveredCard(hitCard);
    document.body.style.cursor = 'pointer';
  } else {
    setHoveredCard(null);
    document.body.style.cursor = 'grab';
  }
}, 85);

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

  dismissGestureHint();
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
  dismissGestureHint();
  targetFov = THREE.MathUtils.clamp(targetFov + e.deltaY * 0.04, 32, 92);
}, { passive: true });

window.addEventListener('pointerdown', onPointerDown, { passive: true });
window.addEventListener('pointermove', onPointerMove, { passive: true });
window.addEventListener('pointerup', onPointerUp, { passive: true });
window.addEventListener('pointercancel', onPointerCancel, { passive: true });
window.addEventListener('pointerleave', onPointerCancel, { passive: true });

/* ==========================================================================
   7. FULLSCREEN LIGHTBOX CONTROLLER (ZOOM & PAN FOR FLOOR PLANS)
   ========================================================================== */
const lightboxOverlay = document.getElementById('lightbox-overlay');
const lightboxImg = document.getElementById('lightbox-img');
const lightboxCaption = document.getElementById('lightbox-caption');
const lightboxZoomBtn = document.getElementById('lightbox-zoom-btn');
const lightboxCloseBtn = document.getElementById('lightbox-close-btn');
const lightboxPrevBtn = document.getElementById('lightbox-prev-btn');
const lightboxNextBtn = document.getElementById('lightbox-next-btn');
const lightboxStage = document.getElementById('lightbox-stage');

let lightboxItems = [];
let lightboxIndex = 0;
let isLightboxZoomed = false;
let lbPan = { x: 0, y: 0 };
let lbDragStart = null;

const applyLightboxTransform = () => {
  if (!lightboxImg) return;
  const scale = isLightboxZoomed ? 2.25 : 1;
  lightboxImg.style.transform = `translate(${lbPan.x}px, ${lbPan.y}px) scale(${scale})`;
  lightboxImg.classList.toggle('zoomed', isLightboxZoomed);
  if (lightboxZoomBtn) {
    lightboxZoomBtn.innerText = isLightboxZoomed ? '🔍 Zoom -' : '🔍 Zoom +';
  }
};

const resetLightboxZoom = () => {
  isLightboxZoomed = false;
  lbPan = { x: 0, y: 0 };
  applyLightboxTransform();
};

const renderLightboxSlide = () => {
  if (!lightboxItems.length || !lightboxImg) return;
  const item = lightboxItems[lightboxIndex];
  resetLightboxZoom();
  lightboxImg.src = item.src;
  lightboxImg.alt = item.caption || 'Imagem ampliada';
  if (lightboxCaption) {
    lightboxCaption.innerText = `${item.caption} (${lightboxIndex + 1}/${lightboxItems.length})`;
  }
};

const openLightbox = (items, startIndex = 0) => {
  if (!lightboxOverlay || !items || !items.length) return;
  lightboxItems = items;
  lightboxIndex = startIndex;
  renderLightboxSlide();
  lightboxOverlay.classList.add('active');
  trackEvent('abrir_lightbox_imagem', {
    legenda: items[startIndex]?.caption || ''
  });
};

const closeLightbox = () => {
  if (!lightboxOverlay) return;
  lightboxOverlay.classList.remove('active');
  resetLightboxZoom();
};

if (lightboxCloseBtn) lightboxCloseBtn.addEventListener('click', closeLightbox);
if (lightboxZoomBtn) {
  lightboxZoomBtn.addEventListener('click', () => {
    isLightboxZoomed = !isLightboxZoomed;
    if (!isLightboxZoomed) lbPan = { x: 0, y: 0 };
    applyLightboxTransform();
  });
}
if (lightboxPrevBtn) {
  lightboxPrevBtn.addEventListener('click', () => {
    if (!lightboxItems.length) return;
    lightboxIndex = (lightboxIndex - 1 + lightboxItems.length) % lightboxItems.length;
    renderLightboxSlide();
  });
}
if (lightboxNextBtn) {
  lightboxNextBtn.addEventListener('click', () => {
    if (!lightboxItems.length) return;
    lightboxIndex = (lightboxIndex + 1) % lightboxItems.length;
    renderLightboxSlide();
  });
}
if (lightboxStage && lightboxImg) {
  lightboxImg.addEventListener('dblclick', () => {
    isLightboxZoomed = !isLightboxZoomed;
    if (!isLightboxZoomed) lbPan = { x: 0, y: 0 };
    applyLightboxTransform();
  });

  lightboxStage.addEventListener('pointerdown', (e) => {
    if (e.target === lightboxStage && !isLightboxZoomed) {
      closeLightbox();
      return;
    }
    if (!isLightboxZoomed) return;
    lbDragStart = { x: e.clientX - lbPan.x, y: e.clientY - lbPan.y };
  });

  lightboxStage.addEventListener('pointermove', (e) => {
    if (!isLightboxZoomed || !lbDragStart) return;
    lbPan.x = THREE.MathUtils.clamp(e.clientX - lbDragStart.x, -480, 480);
    lbPan.y = THREE.MathUtils.clamp(e.clientY - lbDragStart.y, -380, 380);
    applyLightboxTransform();
  });

  const endLbDrag = () => { lbDragStart = null; };
  lightboxStage.addEventListener('pointerup', endLbDrag);
  lightboxStage.addEventListener('pointercancel', endLbDrag);
}

/* ==========================================================================
   8. FAVORITES & SIDE-BY-SIDE PROJECT COMPARATOR
   ========================================================================== */
const FAVORITES_KEY = 'level_favorited_projects_v2';
const openCompareBtn = document.getElementById('open-compare-btn');
const compareOverlay = document.getElementById('compare-overlay');
const closeCompareBtn = document.getElementById('close-compare-btn');
const clearCompareBtn = document.getElementById('clear-compare-btn');
const compareGridContainer = document.getElementById('compare-grid-container');
const compareWhatsappCta = document.getElementById('compare-whatsapp-cta');

const getFavoriteIds = () => {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch (e) {
    return [];
  }
};

const saveFavoriteIds = (ids) => {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(ids));
  } catch (e) {}
  updateFavoritesUI();
};

const toggleFavoriteProject = (projectId) => {
  const idStr = String(projectId);
  let favs = getFavoriteIds();
  if (favs.includes(idStr)) {
    favs = favs.filter(id => id !== idStr);
    showToast('Removido dos favoritos');
  } else {
    if (favs.length >= 4) {
      favs.shift();
    }
    favs.push(idStr);
    showToast('Projeto salvo para comparação! ⭐');
    trackEvent('favoritar_projeto', { projeto_id: idStr });
  }
  saveFavoriteIds(favs);
};

const updateFavoritesUI = () => {
  const favs = getFavoriteIds();
  const validFavProjects = allProjects.filter(p => favs.includes(String(p.id)));

  if (openCompareBtn) {
    if (validFavProjects.length > 0) {
      openCompareBtn.style.display = 'inline-flex';
      openCompareBtn.innerText = `★ FAVORITOS (${validFavProjects.length})`;
    } else {
      openCompareBtn.style.display = 'none';
    }
  }

  if (activeCard && detailFavBtn) {
    const isFav = favs.includes(String(activeCard.userData.id));
    detailFavBtn.classList.toggle('is-favorited', isFav);
    detailFavBtn.innerText = isFav ? '★ FAVORITADO' : '♡ FAVORITAR';
  }
};

const renderCompareModal = () => {
  if (!compareGridContainer) return;
  const favs = getFavoriteIds();
  const favProjects = allProjects.filter(p => favs.includes(String(p.id)));
  compareGridContainer.innerHTML = '';

  if (favProjects.length === 0) {
    compareGridContainer.innerHTML = '<p style="color:#999; padding: 1.5rem 0;">Você ainda não favoritou nenhum projeto. Abra um projeto na galeria e clique em "♡ Favoritar" para comparar lado a lado.</p>';
    return;
  }

  favProjects.forEach(proj => {
    const thumb = (proj.facades && proj.facades[0]) ? proj.facades[0] : (proj.facade || '');
    const cardEl = document.createElement('div');
    cardEl.className = 'compare-card';
    cardEl.innerHTML = `
      ${thumb ? `<img src="${thumb}" alt="${proj.title}" loading="lazy" />` : ''}
      <h3>${proj.title || 'Projeto'}</h3>
      <ul class="compare-specs-list">
        <li><strong>Tipologia:</strong> ${proj.houseType || 'Residencial'}</li>
        <li><strong>Lote Ideal:</strong> ${proj.lotSize || 'Sob consulta'}</li>
        <li><strong>Área:</strong> ${proj.area || 'Sob consulta'}</li>
        <li><strong>Quartos:</strong> ${proj.bedrooms || '-'}</li>
        <li><strong>Garagem:</strong> ${proj.garage || '-'}</li>
      </ul>
      <div class="compare-card-actions">
        <button type="button" class="submit-btn view-fav-btn" style="padding: 0.55rem 0.75rem; font-size: 0.76rem;">Ver Planta</button>
        <button type="button" class="sim-prev-btn remove-fav-btn" title="Remover">✕</button>
      </div>
    `;

    cardEl.querySelector('.view-fav-btn').addEventListener('click', () => {
      compareOverlay.classList.remove('active');
      const targetCard = cards.find(c => String(c.userData.id) === String(proj.id));
      if (targetCard) {
        openDetail(targetCard);
      }
    });

    cardEl.querySelector('.remove-fav-btn').addEventListener('click', () => {
      toggleFavoriteProject(proj.id);
      renderCompareModal();
    });

    compareGridContainer.appendChild(cardEl);
  });

  if (compareWhatsappCta) {
    const titles = favProjects.map(p => `${p.title} (${p.lotSize || ''})`).join(', ');
    const msg = `Olá! Selecionei estes projetos favoritos no site da Level Construtora: ${titles}. Gostaria de comparar a viabilidade e valores.`;
    compareWhatsappCta.href = buildWhatsappUrl(msg);
  }
};

if (openCompareBtn && compareOverlay) {
  openCompareBtn.addEventListener('click', () => {
    renderCompareModal();
    compareOverlay.classList.add('active');
  });
}
if (closeCompareBtn && compareOverlay) {
  closeCompareBtn.addEventListener('click', () => compareOverlay.classList.remove('active'));
}
if (clearCompareBtn) {
  clearCompareBtn.addEventListener('click', () => {
    saveFavoriteIds([]);
    renderCompareModal();
  });
}
if (compareOverlay) {
  compareOverlay.addEventListener('click', (e) => {
    if (e.target === compareOverlay) compareOverlay.classList.remove('active');
  });
}

/* ==========================================================================
   9. PROJECT DETAIL OVERLAY, DEEP LINKING & SEQUENTIAL NAVIGATION
   ========================================================================== */
const populateDetailContent = (card) => {
  activeCard = card;
  const data = card.userData;

  trackEvent('visualizar_projeto', {
    projeto_id: String(data.id || ''),
    projeto_titulo: data.title || 'Projeto',
    projeto_lote: data.lotSize || '',
    projeto_tipo: data.houseType || ''
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

  // CTAs de WhatsApp Contextualizados
  const primaryMsg = `Olá! Vi o projeto "${data.title || ''}" (${data.lotSize ? `Lote ${data.lotSize}` : ''}) no site da Level Construtora e gostaria de mais informações e orçamento.`;
  const adaptMsg = `Olá! Gostei muito do projeto "${data.title || ''}" no site da Level Construtora, mas gostaria de adaptar a planta para a medida do meu terreno.`;
  const primaryWaUrl = buildWhatsappUrl(primaryMsg);
  const adaptWaUrl = buildWhatsappUrl(adaptMsg);

  if (detailWhatsappBtn) {
    detailWhatsappBtn.href = primaryWaUrl;
    detailWhatsappBtn.onclick = () => {
      trackEvent('clique_whatsapp_projeto', { projeto_titulo: data.title || 'Projeto', posicao: 'topo' });
    };
  }
  if (detailBottomWhatsappBtn) {
    detailBottomWhatsappBtn.href = primaryWaUrl;
    detailBottomWhatsappBtn.onclick = () => {
      trackEvent('clique_whatsapp_projeto', { projeto_titulo: data.title || 'Projeto', posicao: 'rodape_planta' });
    };
  }
  if (detailAdaptBtn) {
    detailAdaptBtn.href = adaptWaUrl;
    detailAdaptBtn.onclick = () => {
      trackEvent('clique_adaptar_planta', { projeto_titulo: data.title || 'Projeto' });
    };
  }
  if (stickyBarTitle) stickyBarTitle.innerText = data.title || 'Projeto';
  if (stickyBarLot) stickyBarLot.innerText = [data.houseType, data.lotSize ? `Lote ${data.lotSize}` : ''].filter(Boolean).join(' • ');
  if (stickyBarWhatsapp) {
    stickyBarWhatsapp.href = primaryWaUrl;
    stickyBarWhatsapp.onclick = () => {
      trackEvent('clique_whatsapp_projeto', { projeto_titulo: data.title || 'Projeto', posicao: 'sticky_mobile' });
    };
  }

  updateFavoritesUI();

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

  const facadesArray = (data.facades || [data.facade]).filter(Boolean);
  const plansArray = (data.plans || [data.plan]).filter(Boolean);

  const allLightboxImages = [
    ...facadesArray.map((src, i) => ({ src, caption: `${data.title || 'Projeto'} — Fachada ${i + 1}` })),
    ...plansArray.map((src, i) => ({ src, caption: `${data.title || 'Projeto'} — Planta Humanizada ${i + 1}` }))
  ];

  detailFacadesContainer.innerHTML = '';
  const facadesFragment = document.createDocumentFragment();
  facadesArray.forEach((path, idx) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'zoomable-img-wrapper';
    wrapper.innerHTML = `
      <img src="${path}" alt="${data.title || 'Projeto'} - Fachada ${idx + 1}" loading="${idx === 0 ? 'eager' : 'lazy'}" decoding="async" />
      <span class="zoom-badge-hint">🔍 Ampliar Perspectiva</span>
    `;
    wrapper.addEventListener('click', () => openLightbox(allLightboxImages, idx));
    facadesFragment.appendChild(wrapper);
  });
  detailFacadesContainer.appendChild(facadesFragment);

  detailPlansContainer.innerHTML = '';
  if (detailPlansSection) {
    detailPlansSection.style.display = plansArray.length > 0 ? 'flex' : 'none';
  }
  const plansFragment = document.createDocumentFragment();
  plansArray.forEach((path, idx) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'zoomable-img-wrapper';
    wrapper.innerHTML = `
      <img src="${path}" alt="${data.title || 'Projeto'} - Planta ${idx + 1}" loading="lazy" decoding="async" />
      <span class="zoom-badge-hint">🔍 Dar Zoom na Planta</span>
    `;
    wrapper.addEventListener('click', () => openLightbox(allLightboxImages, facadesArray.length + idx));
    plansFragment.appendChild(wrapper);
  });
  detailPlansContainer.appendChild(plansFragment);

  // Configura botões Próximo / Anterior Projeto
  if (cards.length > 1) {
    const currentIndex = cards.indexOf(card);
    const prevCard = cards[(currentIndex - 1 + cards.length) % cards.length];
    const nextCard = cards[(currentIndex + 1) % cards.length];

    if (prevProjectTitle) prevProjectTitle.innerText = prevCard.userData.title || 'Anterior';
    if (nextProjectTitle) nextProjectTitle.innerText = nextCard.userData.title || 'Próximo';

    if (prevProjectBtn) {
      prevProjectBtn.onclick = () => {
        populateDetailContent(prevCard);
        detailOverlay.scrollTo({ top: 0, behavior: 'smooth' });
      };
    }
    if (nextProjectBtn) {
      nextProjectBtn.onclick = () => {
        populateDetailContent(nextCard);
        detailOverlay.scrollTo({ top: 0, behavior: 'smooth' });
      };
    }
  }
};

const openDetail = (card) => {
  if (!card) return;
  setHoveredCard(null);
  const data = card.userData;

  if (!isDetailView) {
    isDetailView = true;
    const shareUrl = `${window.location.pathname}?projeto=${encodeURIComponent(data.id)}#projeto`;
    history.pushState({ view: 'detail', projectId: data.id }, '', shareUrl);
  }

  populateDetailContent(card);

  card.getWorldPosition(tempWorldPos);
  const camTargetPos = tempWorldPos.clone().multiplyScalar(0.68);

  gsap.to(camera.position, {
    x: camTargetPos.x,
    y: camTargetPos.y,
    z: camTargetPos.z,
    duration: 1.15,
    ease: 'power3.inOut'
  });

  detailOverlay.style.display = 'flex';
  detailOverlay.classList.add('active-detail');
  detailOverlay.scrollTop = 0;

  gsap.to(detailOverlay, {
    autoAlpha: 1,
    duration: 0.7,
    delay: 0.35,
    ease: 'power2.out',
    onComplete: () => {
      isRendering = false;
    }
  });
};

const closeDetail = () => {
  if (!isDetailView) return;
  closeLightbox();
  isRendering = true;
  detailOverlay.classList.remove('active-detail');
  if (detailStickyBar) detailStickyBar.classList.remove('visible');

  if (detailVideoWrapper) {
    detailVideoWrapper.innerHTML = '';
  }

  const returnCoords = activeCard && activeCard.userData && activeCard.userData.anchorCoords
    ? activeCard.userData.anchorCoords
    : { x: currentRotation.x, y: currentRotation.y };

  gsap.to(detailOverlay, {
    autoAlpha: 0,
    duration: 0.38,
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
      history.replaceState(null, '', window.location.pathname);
      closeDetail();
    }
  });
}

if (detailFavBtn) {
  detailFavBtn.addEventListener('click', () => {
    if (activeCard && activeCard.userData) {
      toggleFavoriteProject(activeCard.userData.id);
    }
  });
}

if (detailShareBtn) {
  detailShareBtn.addEventListener('click', async () => {
    if (!activeCard || !activeCard.userData) return;
    const data = activeCard.userData;
    const shareUrl = `${window.location.origin}/?projeto=${encodeURIComponent(data.id)}`;
    const shareTitle = `${data.title || 'Projeto'} | Level Construtora`;
    const shareText = `Confira o projeto ${data.title || ''} (${data.lotSize ? `Lote ${data.lotSize}` : ''}) da Level Construtora:`;

    trackEvent('compartilhar_projeto', { projeto_titulo: data.title || '' });

    if (navigator.share) {
      try {
        await navigator.share({ title: shareTitle, text: shareText, url: shareUrl });
        return;
      } catch (e) {}
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      showToast('Link direto do projeto copiado! 🔗');
    } catch (e) {
      showToast('Link pronto na barra de endereços!');
    }
  });
}

// Sticky bar visibility on mobile scroll + GA4 Floor Plan View tracking
if (detailOverlay) {
  detailOverlay.addEventListener('scroll', throttle(() => {
    if (!detailStickyBar) return;
    if (detailOverlay.scrollTop > 340) {
      detailStickyBar.classList.add('visible');
    } else {
      detailStickyBar.classList.remove('visible');
    }
  }, 100), { passive: true });
}

if (detailPlansSection && 'IntersectionObserver' in window) {
  const plansObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && activeCard && activeCard.userData) {
        trackEvent('visualizar_planta_projeto', {
          projeto_titulo: activeCard.userData.title || 'Projeto'
        });
      }
    });
  }, { threshold: 0.35 });
  plansObserver.observe(detailPlansSection);
}

/* ==========================================================================
   10. MULTI-CRITERIA FILTER MENU (BY HOUSE TYPE & LOT SIZE)
   ========================================================================== */
const openSearchBtn = document.getElementById('open-search-btn');
const closeSearchBtn = document.getElementById('close-search-btn');
const searchOverlay = document.getElementById('search-overlay');
const searchOptionsContainer = document.getElementById('search-options-container');

let filterState = {
  houseType: null,
  lotSize: null
};

const normalizeLotSize = (value) => (value || '').trim().replace(/\s+/g, ' ').toUpperCase();

const updateFilterButtonBadge = () => {
  if (!openSearchBtn) return;
  const activeParts = [filterState.houseType, filterState.lotSize ? `LOTE ${filterState.lotSize}` : null].filter(Boolean);
  if (activeParts.length > 0) {
    openSearchBtn.innerText = `FILTRO: ${activeParts.join(' • ')}`;
    openSearchBtn.classList.add('active-filter-btn');
  } else {
    openSearchBtn.innerText = 'PESQUISAR PROJETOS';
    openSearchBtn.classList.remove('active-filter-btn');
  }
};

const getFilteredProjects = () => {
  return allProjects.filter(p => {
    const matchType = !filterState.houseType || (p.houseType || '').toLowerCase() === filterState.houseType.toLowerCase();
    const matchLot = !filterState.lotSize || normalizeLotSize(p.lotSize) === filterState.lotSize;
    return matchType && matchLot;
  });
};

const closeSearchMenu = () => {
  if (!searchOverlay || !searchOverlay.classList.contains('active')) return;
  if (window.location.hash === '#pesquisa') {
    history.back();
  } else {
    searchOverlay.classList.remove('active');
  }
};

const applyCombinedFilters = () => {
  const filtered = getFilteredProjects();
  updateFilterButtonBadge();
  trackEvent('selecionar_filtro_projetos', {
    filtro_tipo: filterState.houseType || 'Todos',
    filtro_lote: filterState.lotSize || 'Todos',
    qtd_resultados: filtered.length
  });
  buildGallery(filtered, { resetCamera: true });
  closeSearchMenu();
};

const createMenuButton = (label, isActive, onClick) => {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'submit-btn';
  btn.style.background = isActive ? '#ffffff' : 'transparent';
  btn.style.color = isActive ? '#050505' : '#ffffff';
  btn.style.border = isActive ? '1px solid #ffffff' : '1px solid rgba(255, 255, 255, 0.3)';
  btn.innerText = label;
  btn.addEventListener('click', onClick);
  return btn;
};

const renderSearchModalOptions = () => {
  if (!searchOptionsContainer) return;
  searchOptionsContainer.innerHTML = '';
  const fragment = document.createDocumentFragment();

  const isAllActive = !filterState.houseType && !filterState.lotSize;
  fragment.appendChild(
    createMenuButton(`Ver Todos os Projetos (${allProjects.length})`, isAllActive, () => {
      filterState.houseType = null;
      filterState.lotSize = null;
      applyCombinedFilters();
    })
  );

  // Seção 1: Por Tipologia de Imóvel
  const types = [...new Set(allProjects.map(p => (p.houseType || '').trim()).filter(Boolean))];
  if (types.length > 0) {
    const typeLabel = document.createElement('p');
    typeLabel.className = 'menu-section-label';
    typeLabel.innerText = 'Por Tipologia de Imóvel';
    fragment.appendChild(typeLabel);

    const typeGrid = document.createElement('div');
    typeGrid.className = 'filter-chips-grid';

    types.forEach(type => {
      const count = allProjects.filter(p => (p.houseType || '').trim() === type).length;
      const isSelected = filterState.houseType === type;
      typeGrid.appendChild(
        createMenuButton(`${type} (${count})`, isSelected, () => {
          filterState.houseType = isSelected ? null : type;
          applyCombinedFilters();
        })
      );
    });
    fragment.appendChild(typeGrid);
  }

  // Seção 2: Por Medida de Lote
  const sizes = [...new Set(allProjects.map(p => normalizeLotSize(p.lotSize)).filter(Boolean))];
  if (sizes.length > 0) {
    const sizeLabel = document.createElement('p');
    sizeLabel.className = 'menu-section-label';
    sizeLabel.innerText = 'Por Medida de Lote';
    fragment.appendChild(sizeLabel);

    const sizeGrid = document.createElement('div');
    sizeGrid.className = 'filter-chips-grid';

    sizes.forEach(size => {
      const count = allProjects.filter(p => normalizeLotSize(p.lotSize) === size).length;
      const isSelected = filterState.lotSize === size;
      sizeGrid.appendChild(
        createMenuButton(`Lote ${size} (${count})`, isSelected, () => {
          filterState.lotSize = isSelected ? null : size;
          applyCombinedFilters();
        })
      );
    });
    fragment.appendChild(sizeGrid);
  }

  // Banner de Captura para Lotes com Medidas Especiais
  const customBanner = document.createElement('div');
  customBanner.className = 'custom-lot-banner';
  const customLotMsg = 'Olá! Estou no site da Level Construtora e meu terreno possui uma medida específica. Gostaria de conversar sobre um projeto personalizado.';
  customBanner.innerHTML = `
    <strong>📏 Seu terreno tem outra medida?</strong>
    <p>Desenvolvemos projetos 100% personalizados para lotes regulares, irregulares ou em esquina em Maringá e região.</p>
    <a href="${buildWhatsappUrl(customLotMsg)}" target="_blank" rel="noopener noreferrer">Solicitar Projeto Sob Medida</a>
  `;
  fragment.appendChild(customBanner);

  searchOptionsContainer.appendChild(fragment);
};

if (openSearchBtn && searchOverlay) {
  openSearchBtn.addEventListener('click', () => {
    trackEvent('abrir_filtro_projetos');
    renderSearchModalOptions();
    searchOverlay.classList.add('active');
    if (window.location.hash !== '#pesquisa') {
      history.pushState({ view: 'search' }, '', '#pesquisa');
    }
  });
}

if (closeSearchBtn) closeSearchBtn.addEventListener('click', closeSearchMenu);
if (searchOverlay) {
  searchOverlay.addEventListener('click', (e) => {
    if (e.target === searchOverlay) closeSearchMenu();
  });
}

/* ==========================================================================
   11. INTERACTIVE 4-STEP OBRA & VIABILITY SIMULATOR (P4)
   ========================================================================== */
const openSimulatorBtn = document.getElementById('open-simulator-btn');
const closeSimulatorBtn = document.getElementById('close-simulator-btn');
const simulatorOverlay = document.getElementById('simulator-overlay');
const simulatorProgressBar = document.getElementById('simulator-progress-bar');
const simAreaRange = document.getElementById('sim-area-range');
const simAreaDisplay = document.getElementById('sim-area-display');
const simLotInput = document.getElementById('sim-lot-input');
const simStep3Next = document.getElementById('sim-step3-next');
const simSummaryBox = document.getElementById('sim-summary-box');
const simRecommendationsList = document.getElementById('sim-recommendations-list');
const simWhatsappCta = document.getElementById('sim-whatsapp-cta');
const simResetBtn = document.getElementById('sim-reset-btn');
const simFilterGalleryBtn = document.getElementById('sim-filter-gallery-btn');

const simState = {
  step: 1,
  landStatus: '',
  houseType: '',
  area: '220 m²',
  lotSize: '',
  scope: ''
};

const goToSimulatorStep = (stepNumber) => {
  simState.step = stepNumber;
  const steps = document.querySelectorAll('.sim-step');
  steps.forEach(el => {
    el.classList.toggle('active', Number(el.dataset.step) === stepNumber);
  });
  if (simulatorProgressBar) {
    const pct = Math.min(100, Math.round((stepNumber / 5) * 100));
    simulatorProgressBar.style.width = `${pct}%`;
  }
  if (stepNumber === 5) {
    renderSimulatorResults();
  }
};

const openSimulator = () => {
  if (!simulatorOverlay) return;
  trackEvent('iniciar_simulador_obra');
  goToSimulatorStep(1);
  simulatorOverlay.classList.add('active');
};

const closeSimulator = () => {
  if (!simulatorOverlay) return;
  simulatorOverlay.classList.remove('active');
};

if (openSimulatorBtn) openSimulatorBtn.addEventListener('click', openSimulator);
if (detailOpenSimulatorBtn) {
  detailOpenSimulatorBtn.addEventListener('click', () => {
    openSimulator();
  });
}
if (closeSimulatorBtn) closeSimulatorBtn.addEventListener('click', closeSimulator);
if (simulatorOverlay) {
  simulatorOverlay.addEventListener('click', (e) => {
    if (e.target === simulatorOverlay) closeSimulator();
  });
}

if (simAreaRange && simAreaDisplay) {
  simAreaRange.addEventListener('input', (e) => {
    const val = Number(e.target.value);
    const formatted = val >= 450 ? '450+ m²' : `${val} m²`;
    simAreaDisplay.innerText = formatted;
    simState.area = formatted;
  });
}

document.querySelectorAll('.sim-option-card').forEach(btn => {
  btn.addEventListener('click', () => {
    const field = btn.dataset.field;
    const value = btn.dataset.value;
    if (field) simState[field] = value;

    if (simState.step === 1) goToSimulatorStep(2);
    else if (simState.step === 2) goToSimulatorStep(3);
    else if (simState.step === 4) goToSimulatorStep(5);
  });
});

document.querySelectorAll('.sim-prev-btn[data-prev]').forEach(btn => {
  btn.addEventListener('click', () => {
    goToSimulatorStep(Number(btn.dataset.prev));
  });
});

if (simStep3Next) {
  simStep3Next.addEventListener('click', () => {
    simState.lotSize = simLotInput ? simLotInput.value.trim() : '';
    goToSimulatorStep(4);
  });
}

if (simResetBtn) {
  simResetBtn.addEventListener('click', () => goToSimulatorStep(1));
}

const renderSimulatorResults = () => {
  trackEvent('concluir_simulador_obra', {
    terreno: simState.landStatus,
    tipologia: simState.houseType,
    area_estimada: simState.area,
    escopo: simState.scope
  });

  if (simSummaryBox) {
    simSummaryBox.innerHTML = `
      <div><strong>• Terreno:</strong> ${simState.landStatus || 'A definir'} ${simState.lotSize ? `(${simState.lotSize})` : ''}</div>
      <div><strong>• Tipologia Preferida:</strong> ${simState.houseType || 'Aberta'}</div>
      <div><strong>• Área Estimada:</strong> ${simState.area}</div>
      <div><strong>• Escopo:</strong> ${simState.scope}</div>
    `;
  }

  // Encontra projetos compatíveis no portfólio
  let matches = allProjects.filter(p => {
    if (!simState.houseType || simState.houseType === 'Indiferente') return true;
    return (p.houseType || '').toLowerCase() === simState.houseType.toLowerCase();
  });

  if (matches.length === 0) matches = allProjects.slice(0, 3);
  else matches = matches.slice(0, 3);

  if (simRecommendationsList) {
    simRecommendationsList.innerHTML = '';
    if (matches.length === 0) {
      simRecommendationsList.innerHTML = '<p style="font-size:0.82rem; color:#999;">Criaremos um estudo exclusivo sob medida para o seu perfil.</p>';
    } else {
      matches.forEach(proj => {
        const thumb = (proj.facades && proj.facades[0]) ? proj.facades[0] : (proj.facade || '');
        const itemBtn = document.createElement('button');
        itemBtn.type = 'button';
        itemBtn.className = 'sim-rec-item';
        itemBtn.innerHTML = `
          ${thumb ? `<img src="${thumb}" alt="${proj.title}" />` : ''}
          <div class="sim-rec-info">
            <strong>${proj.title || 'Projeto Level'}</strong>
            <span>${[proj.houseType, proj.lotSize ? `Lote ${proj.lotSize}` : '', proj.area].filter(Boolean).join(' • ')}</span>
          </div>
        `;
        itemBtn.addEventListener('click', () => {
          closeSimulator();
          const targetCard = cards.find(c => String(c.userData.id) === String(proj.id));
          if (targetCard) openDetail(targetCard);
        });
        simRecommendationsList.appendChild(itemBtn);
      });
    }
  }

  if (simWhatsappCta) {
    const briefingMsg = [
      'Olá! Fiz a simulação de obra no site da Level Construtora e gostaria de conversar com um especialista:',
      `• Terreno: ${simState.landStatus}${simState.lotSize ? ` (${simState.lotSize})` : ''}`,
      `• Tipologia: ${simState.houseType}`,
      `• Área Estimada: ${simState.area}`,
      `• Objetivo: ${simState.scope}`
    ].join('\n');
    simWhatsappCta.href = buildWhatsappUrl(briefingMsg);
  }

  if (simFilterGalleryBtn) {
    simFilterGalleryBtn.onclick = () => {
      closeSimulator();
      if (isDetailView) closeDetail();
      filterState.houseType = (simState.houseType && simState.houseType !== 'Indiferente') ? simState.houseType : null;
      filterState.lotSize = null;
      applyCombinedFilters();
    };
  }
};

/* ==========================================================================
   12. KEYBOARD & HISTORY NAVIGATION
   ========================================================================== */
window.addEventListener('keydown', (e) => {
  if (lightboxOverlay && lightboxOverlay.classList.contains('active')) {
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft' && lightboxPrevBtn) lightboxPrevBtn.click();
    if (e.key === 'ArrowRight' && lightboxNextBtn) lightboxNextBtn.click();
    return;
  }

  if (e.key === 'Escape') {
    if (simulatorOverlay && simulatorOverlay.classList.contains('active')) {
      closeSimulator();
    } else if (compareOverlay && compareOverlay.classList.contains('active')) {
      compareOverlay.classList.remove('active');
    } else if (searchOverlay && searchOverlay.classList.contains('active')) {
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
   13. FAST PARALLEL INITIALIZATION, DEEP LINKING & SOCIAL LINKS
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

const checkInitialDeepLink = () => {
  const params = new URLSearchParams(window.location.search);
  let targetId = params.get('projeto');
  if (!targetId && window.location.hash.startsWith('#projeto-')) {
    targetId = window.location.hash.replace('#projeto-', '');
  }
  if (!targetId) return;

  const targetCard = cards.find(c => String(c.userData.id) === String(targetId));
  if (targetCard) {
    openDetail(targetCard);
  }
};

const initApp = async () => {
  try {
    const cacheBuster = Date.now();
    const [settingsRes, projectsRes] = await Promise.all([
      fetch(`/api/settings?t=${cacheBuster}`, { cache: 'no-store' }).catch(() => null),
      fetch(`/api/projects?t=${cacheBuster}`, { cache: 'no-store' }).catch(() => null)
    ]);

    if (settingsRes && settingsRes.ok) {
      const data = await settingsRes.json();
      siteSettings = data || {};

      const customMsg = data.whatsappMsg !== undefined && data.whatsappMsg !== ''
        ? data.whatsappMsg
        : 'Olá! Encontrei a construtora no Google, gostaria de mais informações.';

      const whatsUrl = buildWhatsappUrl(customMsg);

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
      updateFavoritesUI();
      buildGallery(allProjects, {
        resetCamera: true,
        onReady: checkInitialDeepLink
      });
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
   14. HIGH-EFFICIENCY 60FPS RENDER LOOP & DEBOUNCED RESIZE
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
