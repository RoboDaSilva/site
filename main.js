import * as THREE from 'three';
import gsap from 'gsap';

// --- SETUP ---
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

// --- DATA FETCHING & GALLERY BUILD ---
let allProjects = [];

const fetchProjects = async () => {
  try {
    const res = await fetch('/api/projects');
    return await res.json();
  } catch (err) {
    console.error('Failed to fetch projects', err);
    return [];
  }
};

const buildGallery = (projects) => {
  while(galleryGroup.children.length > 0){ 
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
  
  let galleryItems = [];
  if (projects.length > 0) {
    const count = projects.length;
    for (let i = 0; i < count; i++) {
      galleryItems.push({
        ...projects[i],
        uniqueId: i
      });
    }
    
    radius = Math.max(8, 2.8 * Math.sqrt(count));

  } else {
    loaderEl.innerText = "No projects found";
    return;
  }

  let loadedCount = 0;
  loaderEl.style.display = 'block';
  gsap.to(loaderEl, { opacity: 1, duration: 0.3 });

  galleryItems.forEach((item, index) => {
    const facadePath = item.facades ? item.facades[0] : item.facade;
    const imgUrl = facadePath;
    
    textureLoader.load(imgUrl, (texture) => {
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
        context.font = "300 36px Inter, sans-serif";
        context.fillStyle = "rgba(255, 255, 255, 0.7)";
        context.textAlign = "center";
        context
