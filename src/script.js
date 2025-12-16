import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

/**
 * Base
 */
const canvas = document.querySelector("canvas.webgl");
const scene = new THREE.Scene();

// Нічний туман
scene.fog = new THREE.FogExp2("#020208", 0.02);

/**
 * Loaders
 */
const loadingBarElement = document.querySelector(".loading-bar");
const loadingOverlay = document.querySelector(".loading-overlay");

const loadingManager = new THREE.LoadingManager(
  () => {
    window.setTimeout(() => {
      loadingOverlay.classList.add("ended");
      loadingBarElement.style.transform = "";
    }, 500);
  },
  (itemUrl, itemsLoaded, itemsTotal) => {
    const progressRatio = itemsLoaded / itemsTotal;
    loadingBarElement.style.transform = `scaleX(${progressRatio})`;
  }
);

const gltfLoader = new GLTFLoader(loadingManager);
const rgbeLoader = new RGBELoader(loadingManager);
const textureLoader = new THREE.TextureLoader(loadingManager);
const audioLoader = new THREE.AudioLoader(loadingManager);

/**
 * Textures
 */
// Floor
const floorColorTexture = textureLoader.load("/textures/floor/color.jpg");
const floorNormalTexture = textureLoader.load("/textures/floor/normal.jpg");
const floorDispTexture = textureLoader.load("/textures/floor/disp.jpg");

floorColorTexture.colorSpace = THREE.SRGBColorSpace;
[floorColorTexture, floorNormalTexture, floorDispTexture].forEach((tex) => {
  tex.repeat.set(8, 8);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
});

// Pedestal
const pedestalColorTexture = textureLoader.load("/textures/pedestal/color.jpg");
const pedestalNormalTexture = textureLoader.load(
  "/textures/pedestal/normal.jpg"
);
pedestalColorTexture.colorSpace = THREE.SRGBColorSpace;

/**
 * Environment map
 */
rgbeLoader.load(
  "/textures/environmentMaps/night_forest.hdr",
  (environmentMap) => {
    environmentMap.mapping = THREE.EquirectangularReflectionMapping;
    scene.background = environmentMap;
    scene.environment = environmentMap;
    scene.backgroundBlurriness = 0;
    scene.backgroundIntensity = 0.16;
    scene.environmentIntensity = 0.16;
  }
);

/**
 * Floor
 */
const floorGeometry = new THREE.PlaneGeometry(40, 40, 100, 100);
const floorMaterial = new THREE.MeshStandardMaterial({
  map: floorColorTexture,
  normalMap: floorNormalTexture,
  displacementMap: floorDispTexture,
  displacementScale: 0.3,
  roughness: 0.8,
  metalness: 0.1,
});
const floor = new THREE.Mesh(floorGeometry, floorMaterial);
floor.rotation.x = -Math.PI * 0.5;
floor.position.y = -2.4;
floor.receiveShadow = true;
scene.add(floor);

/**
 * Pedestal
 */
const pedestalGeo = new THREE.CylinderGeometry(1.6, 2.0, 2.4, 64);
const pedestalMat = new THREE.MeshStandardMaterial({
  map: pedestalColorTexture,
  normalMap: pedestalNormalTexture,
  roughness: 0.4,
  metalness: 0.1,
});
const pedestal = new THREE.Mesh(pedestalGeo, pedestalMat);
pedestal.position.y = -1.2;
pedestal.receiveShadow = true;
pedestal.castShadow = true;
scene.add(pedestal);

/**
 * Bushes
 */
const bushGeometry = new THREE.IcosahedronGeometry(1, 0);
const bushMaterial = new THREE.MeshStandardMaterial({
  color: "#2d5a2d",
  roughness: 0.8,
});

const bushesCount = 80;
const bushes = new THREE.InstancedMesh(bushGeometry, bushMaterial, bushesCount);

const dummy = new THREE.Object3D();

for (let i = 0; i < bushesCount; i++) {
  const angle = Math.random() * Math.PI * 2;
  const radius = 12 + Math.random() * 8;

  const x = Math.sin(angle) * radius;
  const z = Math.cos(angle) * radius;

  dummy.position.set(x, -2.2, z);

  const scale = 1 + Math.random() * 1.5;
  dummy.scale.set(scale, scale, scale);

  dummy.rotation.y = Math.random() * Math.PI;

  dummy.updateMatrix();
  bushes.setMatrixAt(i, dummy.matrix);
}
bushes.castShadow = true;
bushes.receiveShadow = true;
scene.add(bushes);

/**
 * SHADER: Mystic Mist
 */
const mistVertexShader = `
    varying vec2 vUv;
    varying vec3 vPosition;
    void main() {
        vUv = uv;
        vPosition = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

const mistFragmentShader = `
    uniform float uTime;
    varying vec2 vUv;

    void main() {
        float wave = sin(vUv.y * 10.0 - uTime * 3.0) * 0.5 + 0.5;
        float wobble = sin(vUv.x * 20.0 + uTime) * 0.1;
        float alpha = (1.0 - vUv.y) * vUv.y * 2.5;
        vec3 color = vec3(0.1, 0.2, 0.4); 
        float pattern = wave + wobble;
        gl_FragColor = vec4(color, alpha * pattern * 0.15); 
    }
`;

const mistMaterial = new THREE.ShaderMaterial({
  vertexShader: mistVertexShader,
  fragmentShader: mistFragmentShader,
  uniforms: { uTime: { value: 0 } },
  transparent: true,
  side: THREE.DoubleSide,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});

const mistMesh = new THREE.Mesh(
  new THREE.CylinderGeometry(2.2, 2.5, 1.5, 32, 1, true),
  mistMaterial
);
mistMesh.position.y = -1.8;
scene.add(mistMesh);

/**
 * Particles: Fireflies
 */
const particlesGeometry = new THREE.BufferGeometry();
const particlesCount = 500;
const posArray = new Float32Array(particlesCount * 3);
const scalesArray = new Float32Array(particlesCount);

for (let i = 0; i < particlesCount; i++) {
  const i3 = i * 3;
  const angle = Math.random() * Math.PI * 2;
  const radius = 4 + Math.random() * 11;

  const x = Math.cos(angle) * radius;
  const z = Math.sin(angle) * radius;

  posArray[i3] = x;
  posArray[i3 + 1] = Math.random() * 8;
  posArray[i3 + 2] = z;

  scalesArray[i] = Math.random();
}

particlesGeometry.setAttribute(
  "position",
  new THREE.BufferAttribute(posArray, 3)
);
particlesGeometry.setAttribute(
  "aScale",
  new THREE.BufferAttribute(scalesArray, 1)
);

const particlesMaterial = new THREE.PointsMaterial({
  size: 0.1,
  color: "#aa5500",
  transparent: true,
  opacity: 0.6,
  sizeAttenuation: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});
const fireflies = new THREE.Points(particlesGeometry, particlesMaterial);
scene.add(fireflies);

/**
 * Model
 */
gltfLoader.load("/models/statue_of_a_hunter.glb", (gltf) => {
  const model = gltf.scene;
  const scaleValue = 0.8;
  model.scale.set(scaleValue, scaleValue, scaleValue);
  model.updateMatrixWorld();

  const box = new THREE.Box3().setFromObject(model);
  const center = new THREE.Vector3();
  box.getCenter(center);
  model.position.x += model.position.x - center.x + 0.2;
  model.position.z += model.position.z - center.z;
  model.position.y += model.position.y - box.min.y;

  model.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      if (child.material) {
        child.material.roughness = 0.4;
        child.material.metalness = 0.6;
      }
    }
  });
  scene.add(model);
});

/**
 * Lights
 */
const moonLight = new THREE.DirectionalLight("#6688ff", 0.6);
moonLight.position.set(5, 10, -5);
moonLight.castShadow = true;
moonLight.shadow.mapSize.set(2048, 2048);
scene.add(moonLight);

const fillLight = new THREE.DirectionalLight("#ffaa33", 0.1);
fillLight.position.set(-5, 0, 5);
scene.add(fillLight);

const rimLight = new THREE.SpotLight("#00ffff", 2);
rimLight.position.set(0, 5, -5);
rimLight.lookAt(0, 2, 0);
scene.add(rimLight);

// === ДВА МАГІЧНИХ СВІТЛА БІЛЯ НІГ ===
// Світло спереду
const heroLightFront = new THREE.PointLight("#00ffff", 2, 6);
heroLightFront.position.set(0, -0.5, 0.5);
scene.add(heroLightFront);

// Світло ззаду (НОВЕ)
const heroLightBack = new THREE.PointLight("#00ffff", 2, 6);
heroLightBack.position.set(0, -0.5, -1); // Дзеркальна позиція по Z
scene.add(heroLightBack);

/**
 * Sizes
 */
const sizes = { width: window.innerWidth, height: window.innerHeight };
window.addEventListener("resize", () => {
  sizes.width = window.innerWidth;
  sizes.height = window.innerHeight;
  camera.aspect = sizes.width / sizes.height;
  camera.updateProjectionMatrix();
  renderer.setSize(sizes.width, sizes.height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  effectComposer.setSize(sizes.width, sizes.height);
  effectComposer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});

/**
 * Camera & Controls
 */
const camera = new THREE.PerspectiveCamera(
  75,
  sizes.width / sizes.height,
  0.1,
  100
);
camera.position.set(3, 0.5, 6);
scene.add(camera);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI / 2 - 0.02;
controls.target.set(0, 2.0, 0);
controls.minDistance = 1.2;
controls.maxDistance = 10;

// AUDIO
const listener = new THREE.AudioListener();
camera.add(listener);
const sound = new THREE.Audio(listener);
audioLoader.load("/sounds/background.mp3", function (buffer) {
  sound.setBuffer(buffer);
  sound.setLoop(true);
  sound.setVolume(0.5);
});
window.addEventListener("click", () => {
  if (sound.buffer && !sound.isPlaying) {
    sound.play();
  }
  if (sound.context.state === "suspended") {
    sound.context.resume();
  }
});

/**
 * Renderer
 */
const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
renderer.toneMapping = THREE.ReinhardToneMapping;
renderer.toneMappingExposure = 0.8;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setSize(sizes.width, sizes.height);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

/**
 * POST-PROCESSING
 */
const renderPass = new RenderPass(scene, camera);
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(sizes.width, sizes.height),
  1.5,
  0.4,
  0.85
);
bloomPass.strength = 0.3;
bloomPass.radius = 0.5;
bloomPass.threshold = 0.2;

const effectComposer = new EffectComposer(renderer);
effectComposer.addPass(renderPass);
effectComposer.addPass(bloomPass);

/**
 * Animate
 */
const clock = new THREE.Clock();

const tick = () => {
  const elapsedTime = clock.getElapsedTime();
  controls.update();

  mistMaterial.uniforms.uTime.value = elapsedTime;

  fireflies.rotation.y = elapsedTime * 0.05;
  const positions = fireflies.geometry.attributes.position.array;
  for (let i = 0; i < particlesCount; i++) {
    const i3 = i * 3;
    const x = particlesGeometry.attributes.position.array[i3];
    fireflies.geometry.attributes.position.array[i3 + 1] =
      Math.sin(elapsedTime + x) * 0.5 + 4;
  }
  fireflies.geometry.attributes.position.needsUpdate = true;

  effectComposer.render();
  window.requestAnimationFrame(tick);
};

tick();
