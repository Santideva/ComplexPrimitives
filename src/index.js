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
function updateGeometry(time = 0) {
  // Remove the existing line from the scene
  scene.remove(line);
  
  // Use the new createLineObject method to get an updated line object with time
  line = lineSegmentShape.createLineObject(time);
  
  // Add the new line to the scene
  scene.add(line);
  
  logger.info("Line segment updated with new mapping parameters.");
}

// Extend ComplexShape2D prototype to handle time parameter if needed
if (!ComplexShape2D.prototype.createLineObject) {
  ComplexShape2D.prototype.createLineObject = function(time = 0) {
    // Apply distance mapping with time parameter
    const mappedPoints = this.vertices.map(vertex => {
      // Assuming the distanceMapper now accepts a time parameter
      const originalPos = vertex.position;
      const mappedDistance = this.distanceMapper(
        Math.sqrt((originalPos.x - 0.5) ** 2 + (originalPos.y - 0.5) ** 2),
        time
      );
      
      // Apply the mapped distance back to create the new point
      const angle = Math.atan2(originalPos.y - 0.5, originalPos.x - 0.5);
      const x = 0.5 + mappedDistance * Math.cos(angle);
      const y = 0.5 + mappedDistance * Math.sin(angle);
      
      return new THREE.Vector3(x, y, 0);
    });
    
    const geometry = new THREE.BufferGeometry().setFromPoints(mappedPoints);
    const material = new THREE.LineBasicMaterial({
      color: new THREE.Color().setHSL(
        this.color.h / 360,
        this.color.s,
        this.color.l
      )
    });
    
    return new THREE.Line(geometry, material);
  };
}

// ADD the visual update callback - right after the updateGeometry function definition
stateStore.onVisualUpdate((shapeId) => {
  if (shapeId === lineSegmentShape.id) {
    updateGeometry();
  }
});

// Initialize stateStore with default mapping configuration
stateStore.updateMappingConfig({
  mappingType: "polynomial",
  polyCoeffs: initialPolyCoeffs,
  a: 1,
  b: 1,
  c: 0,
  e: 0,
  blendFactor: 0.5,
  frequency: 1.0,
  recursionLimit: 3
});

// 8. dat.GUI Setup for User Interaction
const gui = new dat.GUI();

// Lighting Controls
const lightingFolder = gui.addFolder("Lighting");
lightingFolder.add(lightingManager.ambientLight, "intensity", 0, 2).name("Ambient Intensity");
lightingFolder.add(lightingManager.directionalLight, "intensity", 0, 2).name("Directional Intensity");

// Distance Mapping Controls
const mapperFolder = gui.addFolder("Distance Mapping");

// Store GUI parameters
const mappingParams = {
  a: 1,
  b: 1,
  c: 0,
  e: 0,
  polyCoeffs: initialPolyCoeffs.join(",")
};

// Add dropdown for mapping type selection
mapperFolder.add(stateStore, "selectedMappingType", [
  "identity", "polynomial", "exponential", "logarithmic", 
  "sinusoidal", "power", "composite", "periodic", 
  "temporal", "recursive", "sequential", "blended"
])
.name("Mapping Type")
.onChange(() => {
  stateStore.applyGlobalMappingToShape(lineSegmentShape.id);
  logger.info(`Mapper type updated to: ${stateStore.selectedMappingType}`);
});

// Add controllers for different parameters
mapperFolder.add(stateStore, "blendFactor", 0, 1).step(0.01)
  .name("Blend Factor")
  .onChange(() => {
    stateStore.updateMappingConfig({ blendFactor: stateStore.blendFactor });
    stateStore.applyGlobalMappingToShape(lineSegmentShape.id);
  });

mapperFolder.add(stateStore, "timeFrequency", 0.1, 5).step(0.1)
  .name("Time Frequency")
  .onChange(() => {
    stateStore.updateMappingConfig({ frequency: stateStore.timeFrequency });
    stateStore.applyGlobalMappingToShape(lineSegmentShape.id);
  });
  
// Add controller for amplitude
mapperFolder.add(stateStore, "amplitude", 0, 2).step(0.1)
  .name("Amplitude")
  .onChange(() => {
    // Update the mapping configuration with the new amplitude
    stateStore.updateMappingConfig({ amplitude: stateStore.amplitude });
    stateStore.applyGlobalMappingToShape(lineSegmentShape.id);
    logger.info(`Amplitude updated to: ${stateStore.amplitude}`);
  });  

mapperFolder.add(stateStore, "recursionLimit", 1, 5).step(1)
  .name("Recursion Depth")
  .onChange(() => {
    stateStore.updateMappingConfig({ recursionLimit: stateStore.recursionLimit });
    stateStore.applyGlobalMappingToShape(lineSegmentShape.id);
  });

// Add controllers for polynomial coefficients
mapperFolder.add(mappingParams, "polyCoeffs")
  .name("Poly Coeffs (comma-separated)")
  .onFinishChange(val => {
    const coeffs = val.split(",").map(Number);
    stateStore.updateMappingConfig({ polyCoeffs: coeffs });
    stateStore.applyGlobalMappingToShape(lineSegmentShape.id);
    logger.info(`Polynomial coefficients updated to: ${coeffs}`);
  });

// Add controllers for common function parameters
mapperFolder.add(mappingParams, "a", 0.1, 5).step(0.1)
  .name("Scale Factor (a)")
  .onChange(() => {
    stateStore.updateMappingConfig({ a: mappingParams.a });
    stateStore.applyGlobalMappingToShape(lineSegmentShape.id);
  });

mapperFolder.add(mappingParams, "b", 0.1, 5).step(0.1)
  .name("Rate Factor (b)")
  .onChange(() => {
    stateStore.updateMappingConfig({ b: mappingParams.b });
    stateStore.applyGlobalMappingToShape(lineSegmentShape.id);
  });

mapperFolder.add(mappingParams, "c", -2, 2).step(0.1)
  .name("Offset (c)")
  .onChange(() => {
    stateStore.updateMappingConfig({ c: mappingParams.c });
    stateStore.applyGlobalMappingToShape(lineSegmentShape.id);
  });

mapperFolder.add(mappingParams, "e", -2, 2).step(0.1)
  .name("Additional Offset (e)")
  .onChange(() => {
    stateStore.updateMappingConfig({ e: mappingParams.e });
    stateStore.applyGlobalMappingToShape(lineSegmentShape.id);
  });

mapperFolder.open();

// 9. Animation Loop with time tracking
let startTime = performance.now();

function animate() {
  const currentTime = (performance.now() - startTime) / 1000.0; // Time in seconds
  
  // Update geometry with time parameter for time-dependent mappings
  if (["temporal", "sequential", "blended"].includes(stateStore.selectedMappingType)) {
    updateGeometry(currentTime);
  }
  
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

// Set initial camera position and start animation
camera.position.set(0, 0, 5);
controls.update();
animate();

// 10. Handle Window Resize
window.addEventListener("resize", () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  cameraManager.updateAspect(window.innerWidth, window.innerHeight);
});