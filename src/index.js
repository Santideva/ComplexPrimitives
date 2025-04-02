// File: src/index.js
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CameraManager } from "./rendering/cameraManager.js";
import { LightingManager } from "./rendering/LightingManager.js";
import { TextureLoader } from "./rendering/TextureLoader.js";
import { ComplexShape2D } from "./Geometry/ComplexShape2d.js";
import { stateStore } from "./state/stateStore.js";
import { logger } from "./utils/logger.js";
import { createPolynomialMapping, distanceMappingRegistry } from "./utils/DistanceMapping.js";
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

// 6. Create Line Segment Primitive with Initial Polynomial Mapper
const initialPolyCoeffs = [0, 1, 0.5];
const polyMapping = createPolynomialMapping(initialPolyCoeffs);
const lineSegmentShape = new ComplexShape2D({
  metric: { center: { x: 0.5, y: 0.5 }, scale: 1, polyCoeffs: initialPolyCoeffs },
  color: { h: 200, s: 0.8, l: 0.6, a: 1 },
  distanceMapper: polyMapping
});
stateStore.addShape(lineSegmentShape);
logger.info("Line segment shape initialized.");

// 7. Convert Geometry to Three.js Object and Render
let points = [
  new THREE.Vector3(lineSegmentShape.vertices[0].position.x, lineSegmentShape.vertices[0].position.y, 0),
  new THREE.Vector3(lineSegmentShape.vertices[1].position.x, lineSegmentShape.vertices[1].position.y, 0)
];
const geometry = new THREE.BufferGeometry().setFromPoints(points);
const lineMaterial = new THREE.LineBasicMaterial({ color: 0x0000ff });
let line = new THREE.Line(geometry, lineMaterial);
scene.add(line);

// Function to update geometry in real-time when GUI parameters change
function updateGeometry() {
  scene.remove(line);
  
  points = [
    new THREE.Vector3(lineSegmentShape.vertices[0].position.x, lineSegmentShape.vertices[0].position.y, 0),
    new THREE.Vector3(lineSegmentShape.vertices[1].position.x, lineSegmentShape.vertices[1].position.y, 0)
  ];
  geometry.setFromPoints(points);
  
  line = new THREE.Line(geometry, lineMaterial);
  scene.add(line);
  
  logger.info("Line segment updated with new mapping parameters.");
}

// 8. dat.GUI Setup for User Interaction
const gui = new dat.GUI();

// Lighting Controls
gui.add(lightingManager.ambientLight, "intensity", 0, 2).name("Ambient Intensity");
gui.add(lightingManager.directionalLight, "intensity", 0, 2).name("Directional Intensity");

// Distance Mapping Controls
const mapperOptions = {
  mapper: 'polynomial',
  polyCoeffs: initialPolyCoeffs.join(",")
};

const mapperFolder = gui.addFolder("Distance Mapping");
mapperFolder.add(mapperOptions, "mapper", Object.keys(distanceMappingRegistry))
  .name("Mapper Type")
  .onChange(val => {
    if (val === "polynomial") {
      const coeffs = mapperOptions.polyCoeffs.split(",").map(Number);
      lineSegmentShape.distanceMapper = createPolynomialMapping(coeffs);
    } else {
      lineSegmentShape.distanceMapper = distanceMappingRegistry[val];
    }
    updateGeometry();
    logger.info(`Mapper updated to: ${val}`);
  });

mapperFolder.add(mapperOptions, "polyCoeffs")
  .name("Poly Coeffs (comma-separated)")
  .onFinishChange(val => {
    if (mapperOptions.mapper === "polynomial") {
      const coeffs = val.split(",").map(Number);
      lineSegmentShape.distanceMapper = createPolynomialMapping(coeffs);
      updateGeometry();
      logger.info(`Polynomial coefficients updated to: ${coeffs}`);
    }
  });
mapperFolder.open();

// 9. Animation Loop
camera.position.set(0, 0, 5);
controls.update();

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();

// 10. Handle Window Resize
window.addEventListener("resize", () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  cameraManager.updateAspect(window.innerWidth, window.innerHeight);
});