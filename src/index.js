// File: src/index.js
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CameraManager } from "./rendering/cameraManager.js";
import { LightingManager } from "./rendering/LightingManager.js";
import { TextureLoader } from "./rendering/TextureLoader.js";
import { ComplexShape2D } from "./Geometry/ComplexShape2d.js";
import { stateStore } from "./state/stateStore.js";
import { logger } from "./utils/logger.js";
import { createPolynomialMapping } from "./utils/DistanceMapping.js";
import { translateFace } from "./Geometry/FaceTransformations.js";
import * as dat from "dat.gui";

// 1. Create Scene
const scene = new THREE.Scene();

// 2. Camera Setup via CameraManager
const cameraManager = new CameraManager();
const camera = cameraManager.getCamera();

// 3. Renderer Setup
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById("viewport").appendChild(renderer.domElement);

// 4. Controls
const controls = new OrbitControls(camera, renderer.domElement);

// 5. Lighting via LightingManager
const lightingManager = new LightingManager(scene);

// 6. Texture Loader (optional usage)
const textureLoader = new TextureLoader();
// If you have a texture, e.g. "assets/myTexture.png":
// const myTexture = textureLoader.loadTexture("assets/myTexture.png");

// 7. Create a ComplexShape2D
const polyMapping = createPolynomialMapping([0, 1, 0.5]);
const squareShape = new ComplexShape2D({
  metric: { center: { x: 0.5, y: 0.5 }, scale: 1, polyCoeffs: [0, 1, 0.5] },
  color: { h: 200, s: 0.8, l: 0.6, a: 1 },
  distanceMapper: polyMapping
});

// Add shape to state store
stateStore.addShape(squareShape);
logger.info(`Total shapes in state store: ${stateStore.getShapes().length}`);

// Example SDF usage
const samplePoint = { x: 0.75, y: 0.75 };
logger.debug(`SDF at samplePoint: ${squareShape.computeSDF(samplePoint)}`);

// Translate the face
translateFace(squareShape.face, { dx: 2, dy: 3 });
logger.debug(`Shape ${squareShape.id} face translated.`);

// Convert geometry to Three.js object for rendering
const points = squareShape.face.vertices.map(v => new THREE.Vector3(v.position.x, v.position.y, 0));
const geometry = new THREE.BufferGeometry().setFromPoints(points);
const lineMaterial = new THREE.LineBasicMaterial({ color: 0x0000ff });
const lineLoop = new THREE.LineLoop(geometry, lineMaterial);
scene.add(lineLoop);

// 8. dat.gui Setup
const gui = new dat.GUI();
gui.add(lightingManager.ambientLight, "intensity", 0, 2).name("Ambient Intensity");
gui.add(lightingManager.directionalLight, "intensity", 0, 2).name("Directional Intensity");

// 9. Render Loop
camera.position.set(0, 0, 5);
controls.update();

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();

// 10. Handle Resize
window.addEventListener("resize", () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  cameraManager.updateAspect(window.innerWidth, window.innerHeight);
});
