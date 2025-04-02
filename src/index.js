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

// 6. Texture Loader (optional usage)
const textureLoader = new TextureLoader();
// e.g., const myTexture = textureLoader.loadTexture("assets/myTexture.png");

// 7. Create a ComplexShape2D with an initial polynomial mapper.
// Since our default primitive is now a line-segment, we expect it to use two vertices.
const initialPolyCoeffs = [0, 1, 0.5];
const polyMapping = createPolynomialMapping(initialPolyCoeffs);
const lineSegmentShape = new ComplexShape2D({
  // For a line-segment, we could also pass specific start/end information via vertices or metric properties.
  // Here we assume default vertices will be used (two vertices for a line segment).
  metric: { center: { x: 0.5, y: 0.5 }, scale: 1, polyCoeffs: initialPolyCoeffs },
  color: { h: 200, s: 0.8, l: 0.6, a: 1 },
  distanceMapper: polyMapping
});

// Add shape to state store
stateStore.addShape(lineSegmentShape);
logger.info(`Total shapes in state store: ${stateStore.getShapes().length}`);

// Example SDF usage for debugging
const samplePoint = { x: 0.75, y: 0.75 };
logger.debug(`SDF at samplePoint: ${lineSegmentShape.computeSDF(samplePoint)}`);

// Translate the face (for demonstration)
// Since a line-segment primitive doesn't create a face, check for its existence first.
if (lineSegmentShape.face) {
  translateFace(lineSegmentShape.face, { dx: 2, dy: 3 });
  logger.debug(`Shape ${lineSegmentShape.id} face translated.`);
} else {
  logger.debug(`Shape ${lineSegmentShape.id} has no face to translate.`);
}

// Convert geometry to Three.js object for rendering.
// For a line-segment, we create a line from its two endpoints.
// We assume the vertices array holds the endpoints.
let points = [
  new THREE.Vector3(lineSegmentShape.vertices[0].position.x, lineSegmentShape.vertices[0].position.y, 0),
  new THREE.Vector3(lineSegmentShape.vertices[1].position.x, lineSegmentShape.vertices[1].position.y, 0)
];
const geometry = new THREE.BufferGeometry().setFromPoints(points);
const lineMaterial = new THREE.LineBasicMaterial({ color: 0x0000ff });
const line = new THREE.Line(geometry, lineMaterial);
scene.add(line);

// Function to update the geometry when mapper parameters change.
function updateGeometry() {
  points = [
    new THREE.Vector3(lineSegmentShape.vertices[0].position.x, lineSegmentShape.vertices[0].position.y, 0),
    new THREE.Vector3(lineSegmentShape.vertices[1].position.x, lineSegmentShape.vertices[1].position.y, 0)
  ];
  geometry.setFromPoints(points);
  geometry.attributes.position.needsUpdate = true;
}

// 8. dat.gui Setup
const gui = new dat.GUI();

// Existing lighting controls
gui.add(lightingManager.ambientLight, "intensity", 0, 2).name("Ambient Intensity");
gui.add(lightingManager.directionalLight, "intensity", 0, 2).name("Directional Intensity");

// New folder for Distance Mapping
const mapperOptions = {
  mapper: 'polynomial',
  polyCoeffs: initialPolyCoeffs.join(",") // Represent coefficients as comma-separated string
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
    updateGeometry(); // Trigger re-calculation/update of geometry
    logger.debug(`Distance mapper updated to ${val}`);
  });

// Controller for polynomial coefficients (only used if polynomial is selected)
mapperFolder.add(mapperOptions, "polyCoeffs")
  .name("Poly Coeffs (comma separated)")
  .onFinishChange(val => {
    if (mapperOptions.mapper === "polynomial") {
      const coeffs = val.split(",").map(Number);
      lineSegmentShape.distanceMapper = createPolynomialMapping(coeffs);
      updateGeometry();
      logger.debug(`Polynomial coefficients updated to: ${coeffs}`);
    }
  });
mapperFolder.open();

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
