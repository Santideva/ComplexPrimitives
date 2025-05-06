// Import Three.js and related modules.
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
import * as meshCreator from "./utils/meshCreator.js";



// Import derived primitives (Triangle and Arc).
import { TrianglePrimitive, ArcPrimitive } from "./Primitives/primaryDerivativePrimitives.js";

// -----------------------------------------------------------------------------
// Import Persistence Module and its functions.
import { initializeSaveFeature, saveScene, loadScene, addLoadButtonToGUI, autoSaveAndGarbageCollect } from "./persistence.js";
import { SchurComposition } from "./Primitives/SchurComposition.js";


// 1. Create Scene.
const scene = new THREE.Scene();

// 2. Camera Setup via CameraManager.
const cameraManager = new CameraManager();
const camera = cameraManager.getCamera();

// 3. Renderer Setup.
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById("viewport").appendChild(renderer.domElement);


// ─── Schur‐UI DOM references ────────────────────────────────────────────────
const baseSelect = document.getElementById('base-shapes');
const composeBtn = document.getElementById('compose-btn');
if (!baseSelect || !composeBtn) {
  console.error("Missing #base-shapes or #compose-btn in HTML");
}

const schurParams = {
  baseIds:    [],         // will be filled by the <select>
  operations: ['union'],  // etc…
  weight:    8,
  rotation:   0,
  scale:      1,
  posX:       0,
  posY:       0
};


// A helper to refresh the <select> options whenever shapes change:
function refreshBaseShapeOptions() {
  baseSelect.innerHTML = '';
  stateStore.getShapes().forEach(shape => {
    const opt = document.createElement('option');
    opt.value = shape.id;
    opt.textContent = `#${shape.id} (${shape.constructor.name})`;

    baseSelect.appendChild(opt);
  });
}

// initial population
refreshBaseShapeOptions();
// keep it up-to-date
stateStore.onVisualUpdate(refreshBaseShapeOptions);

baseSelect.addEventListener('change', () => {
  schurParams.baseIds = Array.from(baseSelect.selectedOptions)
                             .map(opt => Number(opt.value));
});
composeBtn.addEventListener('click', instantiateSchur);

// 4. Controls.
const controls = new OrbitControls(camera, renderer.domElement);

// 5. Lighting via LightingManager.
const lightingManager = new LightingManager(scene);

// -----------------------------------------------------------------------------
// Helper functions for adding and removing shapes from the scene.
// These ensure the rendered flag is updated immediately when an object is added/removed.
function addShapeToScene(shape) {
  if (!shape.object) {
    logger.warn(`Shape ${shape.id} has no object to add.`);
    return;
  }
  scene.add(shape.object);
  shape.rendered = true; // Explicitly mark as rendered.
}

function removeShapeFromScene(shape) {
  if (!shape.object) {
    logger.warn(`Shape ${shape.id} has no object to remove.`);
    return;
  }
  scene.remove(shape.object);
  shape.rendered = false; // Explicitly mark as not rendered.
}

// -----------------------------------------------------------------------------
// VISUAL‐PIPELINE HELPERS for persistence.loadScene()
// -----------------------------------------------------------------------------

/** Remove every visual from the Three.js scene. */
function clearVisuals() {
  // 1. Remove every object from the Three.js scene
  scene.children.slice().forEach(obj => scene.remove(obj));

  // 2. If there’s a “current” primitive, take it out of the state store too
  if (currentPrimitive) {
    // helper from above
    removeShapeFromScene(currentPrimitive);
    stateStore.removeShape(currentPrimitive.instance.id || currentPrimitive.id);
    currentPrimitive = null;
  }
}


/**
 * Build and add the mesh/line for a shape,
 * then mark it rendered.
 */
function createVisual(shape) {
  let mesh;

  // Prefer createObject(), fall back to createLineObject(0)
  if (typeof shape.createObject === 'function') {
    mesh = shape.createObject();
  } else if (typeof shape.createLineObject === 'function') {
    mesh = shape.createLineObject(0);
  }

  if (!mesh) {
    console.warn(`Shape ${shape.id} could not create a visual.`);
    return;
  }

  shape.object   = mesh;
  addShapeToScene(shape);   // your helper: scene.add + shape.rendered = true
}

/** Fire a final render pass. */
function triggerRender() {
  renderer.render(scene, camera);
}


// -----------------------------------------------------------------------------
// 6. Define a function to instantiate the chosen primitive.
let currentPrimitive = null;  // Global variable for currently active primitive.
let currentSchur = null;

function instantiatePrimitive(type) {
  // Remove any existing primitive using our helper.
  if (currentPrimitive) {
    removeShapeFromScene(currentPrimitive);
    stateStore.removeShape(currentPrimitive.id);
    currentPrimitive = null;
  }

  switch (type.toLowerCase()) {
    case "line":
      {
        const initialPolyCoeffs = [0, 1, 0.5];
        const polyMapping = createPolynomialMapping(initialPolyCoeffs);
        const lineSegmentShape = new ComplexShape2D({
          metric: { center: { x: 0.5, y: 0.5 }, scale: 1, polyCoeffs: initialPolyCoeffs },
          color: { h: 200, s: 0.8, l: 0.6, a: 1 },
          distanceMapper: polyMapping
        });
        stateStore.addShape(lineSegmentShape);
        logger.info("Line segment shape instantiated.");
        currentPrimitive = { instance: lineSegmentShape, type: "line" };
        currentPrimitive.object = lineSegmentShape.createLineObject();
        refreshBaseShapeOptions();
      }
      break;
    case "triangle":
      {
        const triangle = new TrianglePrimitive({
          size: 1,
          rotation: 0,
          position: { x: -1, y: 0 },
          cornerRounding: 0,
          edgeSmoothness: [0, 0, 0],
          color: { h: 210, s: 0.8, l: 0.6, a: 1 },
          blendSmoothness: 8
        });
        triangle.registerWithStateStore(stateStore);
        stateStore.addShape(triangle);
        logger.info("Triangle primitive instantiated.");
        currentPrimitive = { instance: triangle, type: "triangle" };
        currentPrimitive.object = triangle.createObject();
      }
      break;
    case "arc":
      {
        const arc = new ArcPrimitive({
          radius: 1.5,
          startAngle: 0,
          endAngle: Math.PI,
          segments: 8,
          position: { x: 1, y: 0 },
          thickness: 0,
          color: { h: 30, s: 0.9, l: 0.5, a: 1 },
          blendSmoothness: 8
        });
        arc.registerWithStateStore(stateStore);
        stateStore.addShape(arc);
        logger.info("Arc primitive instantiated.");
        currentPrimitive = { instance: arc, type: "arc" };
        currentPrimitive.object = arc.createObject();
      }
      break;
    default:
      console.warn("Unknown primitive type. Defaulting to line.");
      instantiatePrimitive("line");
      return;
  }
  // Use our helper to add the new object to the scene.
  addShapeToScene(currentPrimitive);
}

/**
 * Instantiate a SchurComposition from user‐selected IDs & params.
 */
function instantiateSchur() {
  // Remove old Schur if any
  if (currentSchur) {
    removeShapeFromScene(currentSchur);
    stateStore.removeShape(currentSchur.id);
    currentSchur = null;
  }

  // Gather base shapes
  const bases = schurParams.baseIds
    .map(id => stateStore.getShape(id))
    .filter(s => !!s);
  if (bases.length < 2) {
    alert("Pick at least 2 shapes to compose.");
    return;
  }

  // Create new SchurComposition
  const schur = new SchurComposition({
    shapes: bases,
    operations: schurParams.operations,
    weights: [ schurParams.weight ],
    rotation: schurParams.rotation,
    scale: schurParams.scale,
    position: { x: schurParams.posX, y: schurParams.posY },
    blendSmoothness: schurParams.weight,     // fallback
    color: { h: 0, s: 0, l: 0.8, a: 1 }          // or pick from UI
  });

  stateStore.addShape(schur);
  // Track dependencies for cycle‐guard and persistence
  refreshBaseShapeOptions();
  stateStore.dependencyMap.set(
    schur.id,
    new Set(schurParams.baseIds)
  );

  // Render
  // ─── Render via meshCreator based on user choice ────────────────────────
  // inside instantiateSchur(), right after gathering `schur` and before scene.add:
  let threeObj;
  const bounds2D = [ -2, -2, 2, 2 ];
  const bounds3D = [ -2, -2, -2, 2, 2, 2 ];

  switch (renderParams.method) {
    case "contours (2D)": {
      // marchingSquares + buildLineSegments
      const loops = meshCreator.marchingSquares(
        pt => schur.computeSDF(pt),
        bounds2D, 150
      );
      const geometry = meshCreator.buildLineSegments(loops);
      threeObj = new THREE.LineSegments(
        geometry,
        new THREE.LineBasicMaterial({ color: 0x3366ff })
      );
      break;
    }

    case "fill (2D)": {
      // get zero‐level loops & triangulate
      const loops = meshCreator.marchingSquares(
        pt => schur.computeSDF(pt),
        bounds2D, 150
      );
      threeObj = meshCreator.createContourMesh(loops);
      break;
    }

    case "arcs": {
      // extract points → fitArcs → createArcObject
      const loops = meshCreator.marchingSquares(
        pt => schur.computeSDF(pt),
        bounds2D, 150
      );
      const pts = loops.flat();
      const arcs = meshCreator.fitArcs(pts);
      threeObj = meshCreator.createArcObject(arcs, { segments: 64 });
      break;
    }

    case "surface (3D)": {
      // marchingCubes for a full 3D surface
      threeObj = meshCreator.createSDFMesh(
        schur,
        bounds3D,
        { resolution: 50, wireframe: false, isoLevel: 0 }
      );
      break;
    }

    default:
      console.warn(`Unknown render method: ${renderParams.method}`);
      threeObj = new THREE.Group();
  }

  // finally:
  schur.object   = threeObj;
  scene.add(threeObj);
  schur.rendered = true;

}


// ─── Hook up HTML controls to Schur logic ───────────────────────────────────
baseSelect.addEventListener('change', () => {
  // Update the array of selected IDs
  schurParams.baseIds = Array.from(baseSelect.selectedOptions)
                             .map(opt => Number(opt.value));
});

composeBtn.addEventListener('click', () => {
  if (schurParams.baseIds.length < 2) {
    alert("Select at least two base shapes.");
    return;
  }
  instantiateSchur();
});


// Initially instantiate the line primitive.
instantiatePrimitive("line");

// 7. Function to update geometry for time-dependent mappings.
function updateGeometry(time = 0) {
  if (currentPrimitive && currentPrimitive.type === "line") {
    // Remove the current object and update it.
    removeShapeFromScene(currentPrimitive);
    currentPrimitive.object = currentPrimitive.instance.createLineObject(time);
    addShapeToScene(currentPrimitive);
    logger.info("Line segment updated with new mapping parameters.");
  }
}

// Extend ComplexShape2D prototype if needed.
if (!ComplexShape2D.prototype.createLineObject) {
  ComplexShape2D.prototype.createLineObject = function(time = 0) {
    const mappedPoints = this.vertices.map(vertex => {
      const originalPos = vertex.position;
      const mappedDistance = this.distanceMapper(
        Math.sqrt((originalPos.x - 0.5) ** 2 + (originalPos.y - 0.5) ** 2),
        time
      );
      const angle = Math.atan2(originalPos.y - 0.5, originalPos.x - 0.5);
      const x = 0.5 + mappedDistance * Math.cos(angle);
      const y = 0.5 + mappedDistance * Math.sin(angle);
      return new THREE.Vector3(x, y, 0);
    });
    const geometry = new THREE.BufferGeometry().setFromPoints(mappedPoints);
    const material = new THREE.LineBasicMaterial({
      color: new THREE.Color().setHSL(this.color.h / 360, this.color.s, this.color.l)
    });
    return new THREE.Line(geometry, material);
  };
}

// Register visual update callback for the line segment.
stateStore.onVisualUpdate((shapeId) => {
  if (currentPrimitive && shapeId === currentPrimitive.instance.id && currentPrimitive.type === "line") {
    updateGeometry();
  }
});

// Initialize mapping configuration.
stateStore.updateMappingConfig({
  mappingType: "polynomial",
  polyCoeffs: [0, 1, 0.5],
  a: 1,
  b: 1,
  c: 0,
  e: 0,
  blendFactor: 0.5,
  frequency: 1.0,
  recursionLimit: 3
});

// -----------------------------------------------------------------------------
// Set up dat.GUI for User Interaction.
// -----------------------------------------------------------------------------
const gui = new dat.GUI();

// --- Position the GUI on the left side.
gui.domElement.style.position = "absolute";
gui.domElement.style.left = "0px";
gui.domElement.style.top = "10px";

// --- Add primitive selection controls.
const primitiveSelection = { primitive: "Line" };
gui.add(primitiveSelection, "primitive", ["Line", "Triangle", "Arc"])
  .name("Select Primitive")
  .onChange((value) => {
    instantiatePrimitive(value);
  });

// --- Add Lighting controls.
const lightingFolder = gui.addFolder("Lighting");
lightingFolder.add(lightingManager.ambientLight, "intensity", 0, 2).name("Ambient Intensity");
lightingFolder.add(lightingManager.directionalLight, "intensity", 0, 2).name("Directional Intensity");

// --- Add Distance Mapping controls.
const mapperFolder = gui.addFolder("Distance Mapping");
const mappingParams = {
  a: 1,
  b: 1,
  c: 0,
  e: 0,
  polyCoeffs: [0, 1, 0.5].join(",")
};
mapperFolder.add(stateStore, "selectedMappingType", [
  "identity", "polynomial", "exponential", "logarithmic", 
  "sinusoidal", "power", "composite", "periodic", 
  "temporal", "recursive", "sequential", "blended"
])
  .name("Mapping Type")
  .onChange(() => {
    if (currentPrimitive && currentPrimitive.type === "line") {
      stateStore.applyGlobalMappingToShape(currentPrimitive.instance.id);
      logger.info(`Mapper type updated to: ${stateStore.selectedMappingType}`);
    }
  });
mapperFolder.add(stateStore, "blendFactor", 0, 1).step(0.01)
  .name("Blend Factor")
  .onChange(() => {
    if (currentPrimitive && currentPrimitive.type === "line") {
      stateStore.updateMappingConfig({ blendFactor: stateStore.blendFactor });
      stateStore.applyGlobalMappingToShape(currentPrimitive.instance.id);
    }
  });
mapperFolder.add(stateStore, "timeFrequency", 0.1, 5).step(0.1)
  .name("Time Frequency")
  .onChange(() => {
    if (currentPrimitive && currentPrimitive.type === "line") {
      stateStore.updateMappingConfig({ frequency: stateStore.timeFrequency });
      stateStore.applyGlobalMappingToShape(currentPrimitive.instance.id);
    }
  });
mapperFolder.add(stateStore, "amplitude", 0, 2).step(0.1)
  .name("Amplitude")
  .onChange(() => {
    if (currentPrimitive && currentPrimitive.type === "line") {
      stateStore.updateMappingConfig({ amplitude: stateStore.amplitude });
      stateStore.applyGlobalMappingToShape(currentPrimitive.instance.id);
      logger.info(`Amplitude updated to: ${stateStore.amplitude}`);
    }
  });
mapperFolder.add(stateStore, "recursionLimit", 1, 5).step(1)
  .name("Recursion Depth")
  .onChange(() => {
    if (currentPrimitive && currentPrimitive.type === "line") {
      stateStore.updateMappingConfig({ recursionLimit: stateStore.recursionLimit });
      stateStore.applyGlobalMappingToShape(currentPrimitive.instance.id);
    }
  });
mapperFolder.add(mappingParams, "polyCoeffs")
  .name("Poly Coeffs (comma-separated)")
  .onFinishChange(val => {
    const coeffs = val.split(",").map(Number);
    if (currentPrimitive && currentPrimitive.type === "line") {
      stateStore.updateMappingConfig({ polyCoeffs: coeffs });
      stateStore.applyGlobalMappingToShape(currentPrimitive.instance.id);
      logger.info(`Polynomial coefficients updated to: ${coeffs}`);
    }
  });
mapperFolder.add(mappingParams, "a", 0.1, 5).step(0.1)
  .name("Scale Factor (a)")
  .onChange(() => {
    if (currentPrimitive && currentPrimitive.type === "line") {
      stateStore.updateMappingConfig({ a: mappingParams.a });
      stateStore.applyGlobalMappingToShape(currentPrimitive.instance.id);
    }
  });
mapperFolder.add(mappingParams, "b", 0.1, 5).step(0.1)
  .name("Rate Factor (b)")
  .onChange(() => {
    if (currentPrimitive && currentPrimitive.type === "line") {
      stateStore.updateMappingConfig({ b: mappingParams.b });
      stateStore.applyGlobalMappingToShape(currentPrimitive.instance.id);
    }
  });
mapperFolder.add(mappingParams, "c", -2, 2).step(0.1)
  .name("Offset (c)")
  .onChange(() => {
    if (currentPrimitive && currentPrimitive.type === "line") {
      stateStore.updateMappingConfig({ c: mappingParams.c });
      stateStore.applyGlobalMappingToShape(currentPrimitive.instance.id);
    }
  });
mapperFolder.add(mappingParams, "e", -2, 2).step(0.1)
  .name("Additional Offset (e)")
  .onChange(() => {
    if (currentPrimitive && currentPrimitive.type === "line") {
      stateStore.updateMappingConfig({ e: mappingParams.e });
      stateStore.applyGlobalMappingToShape(currentPrimitive.instance.id);
    }
  });
mapperFolder.open();

// --- Add controls for Triangle primitives.
const triangleFolder = gui.addFolder("Triangle Controls");
const triangleParams = {
  size: 1,
  rotation: 0,
  cornerRounding: 0,
  posX: -1,
  posY: 0
};
triangleFolder.add(triangleParams, "size", 0.1, 5).onChange((value) => {
  if (currentPrimitive && currentPrimitive.type === "triangle") {
    currentPrimitive.instance.updateParameters({ size: value });
    stateStore.triggerVisualUpdate(currentPrimitive.instance.id);
  }
});
triangleFolder.add(triangleParams, "rotation", 0, Math.PI * 2).onChange((value) => {
  if (currentPrimitive && currentPrimitive.type === "triangle") {
    currentPrimitive.instance.updateParameters({ rotation: value });
    stateStore.triggerVisualUpdate(currentPrimitive.instance.id);
  }
});
triangleFolder.add(triangleParams, "cornerRounding", 0, 2).onChange((value) => {
  if (currentPrimitive && currentPrimitive.type === "triangle") {
    currentPrimitive.instance.updateParameters({ cornerRounding: value });
    stateStore.triggerVisualUpdate(currentPrimitive.instance.id);
  }
});
triangleFolder.add(triangleParams, "posX", -5, 5).onChange((value) => {
  if (currentPrimitive && currentPrimitive.type === "triangle") {
    currentPrimitive.instance.updateParameters({ position: { x: value, y: triangleParams.posY } });
    stateStore.triggerVisualUpdate(currentPrimitive.instance.id);
  }
});
triangleFolder.add(triangleParams, "posY", -5, 5).onChange((value) => {
  if (currentPrimitive && currentPrimitive.type === "triangle") {
    currentPrimitive.instance.updateParameters({ position: { x: triangleParams.posX, y: value } });
    stateStore.triggerVisualUpdate(currentPrimitive.instance.id);
  }
});
triangleFolder.open();

// --- Add controls for Arc primitives.
const arcFolder = gui.addFolder("Arc Controls");
const arcParams = {
  radius: 1.5,
  startAngle: 0,
  endAngle: Math.PI,
  segments: 8,
  thickness: 0,
  posX: 1,
  posY: 0
};
arcFolder.add(arcParams, "radius", 0.1, 5).onChange((value) => {
  if (currentPrimitive && currentPrimitive.type === "arc") {
    currentPrimitive.instance.updateParameters({ radius: value });
    stateStore.triggerVisualUpdate(currentPrimitive.instance.id);
  }
});
arcFolder.add(arcParams, "startAngle", 0, Math.PI * 2).onChange((value) => {
  if (currentPrimitive && currentPrimitive.type === "arc") {
    currentPrimitive.instance.updateParameters({ startAngle: value });
    stateStore.triggerVisualUpdate(currentPrimitive.instance.id);
  }
});
arcFolder.add(arcParams, "endAngle", 0, Math.PI * 2).onChange((value) => {
  if (currentPrimitive && currentPrimitive.type === "arc") {
    currentPrimitive.instance.updateParameters({ endAngle: value });
    stateStore.triggerVisualUpdate(currentPrimitive.instance.id);
  }
});
arcFolder.add(arcParams, "segments", 3, 20).step(1).onChange((value) => {
  if (currentPrimitive && currentPrimitive.type === "arc") {
    currentPrimitive.instance.updateParameters({ segments: value });
    stateStore.triggerVisualUpdate(currentPrimitive.instance.id);
  }
});
arcFolder.add(arcParams, "thickness", 0, 2).onChange((value) => {
  if (currentPrimitive && currentPrimitive.type === "arc") {
    currentPrimitive.instance.updateParameters({ thickness: value });
    stateStore.triggerVisualUpdate(currentPrimitive.instance.id);
  }
});
arcFolder.add(arcParams, "posX", -5, 5).onChange((value) => {
  if (currentPrimitive && currentPrimitive.type === "arc") {
    currentPrimitive.instance.updateParameters({ position: { x: value, y: arcParams.posY } });
    stateStore.triggerVisualUpdate(currentPrimitive.instance.id);
  }
});
arcFolder.add(arcParams, "posY", -5, 5).onChange((value) => {
  if (currentPrimitive && currentPrimitive.type === "arc") {
    currentPrimitive.instance.updateParameters({ position: { x: arcParams.posX, y: value } });
    stateStore.triggerVisualUpdate(currentPrimitive.instance.id);
  }
});
arcFolder.open();

// --- Add Schur Composition controls
const schurFolder = gui.addFolder("Schur Composition");

// 1️⃣ Multi‐select for base shapes (ids)
const availableIds = () => stateStore.getShapes().map(s => s.id);


schurFolder.add(schurParams, "operations", ["union","intersection","difference"])
           .name("Operation").onChange(val => schurParams.operations = [val]);
           schurFolder.add(schurParams, "weight", 0, 10).name("Smoothness");
schurFolder.add(schurParams, "rotation", 0, Math.PI*2).name("Rotation");
schurFolder.add(schurParams, "scale", 0.1, 5).name("Scale");
schurFolder.add(schurParams, "posX", -5, 5).name("Translate X");
schurFolder.add(schurParams, "posY", -5, 5).name("Translate Y");
schurFolder.open();

// after schurFolder.open();
schurFolder.__controllers.forEach(ctrl =>
  ctrl.onChange(() => {
    if (!currentSchur) return;

    // Pull the up‐to‐date params out of schurParams
    const {
      baseIds,
      operations,
      weights,
      rotation,
      scale,
      posX,
      posY
    } = schurParams;

    // Tell the existing SchurComposition to update
    currentSchur.updateParameters({
      shapes: baseIds.map(id => stateStore.getShape(id)),
      operations,
      weights,
      rotation,
      scale,
      position: { x: posX, y: posY }
    });

    // Re‐render it
    removeShapeFromScene(currentSchur);
    currentSchur.object = currentSchur.createObject();
    addShapeToScene(currentSchur);
  })
);

// ─── Pick how to render the composed shape ─────────────────────────────────
const renderMethods = ["contours (2D)", "fill (2D)", "arcs", "surface (3D)"];
const renderParams  = { method: renderMethods[0] };

schurFolder.add(renderParams, "method", renderMethods)
  .name("Render As")
  .onChange(() => {
    if (currentSchur) instantiateSchur();
  });



// -----------------------------------------------------------------------------
// Integration of Persistence Functionality.
// -----------------------------------------------------------------------------
// 1. Initialize the persistence controls (save and load buttons) in the GUI.
initializeSaveFeature(gui);  // This adds a save button (and optionally a load button if implemented).
const loadController = {
  loadState: async () => {
    const success = await loadScene({ clearVisuals, createVisual, triggerRender });
    alert(success
      ? "Scene loaded successfully!"
      : "Failed to load scene. See console for details.");
  }
};

gui.add(loadController, 'loadState').name('Load Saved Scene');


// 2. Optionally, you can also set up a keyboard shortcut or additional GUI control for loading.
// (For example, if you implement addLoadButtonToGUI() in persistence.js, you can call it here.)

// 3. Link Auto-Save and Garbage Collection with Session End.
window.addEventListener('beforeunload', async (event) => {
  await autoSaveAndGarbageCollect();
  // Optionally, you can prompt the user here.
});

// -----------------------------------------------------------------------------
// Animation Loop with Time Tracking.
// -----------------------------------------------------------------------------
// In the alternative approach, we no longer poll for the rendered flag in the loop,
// because the flag is now set when shapes are added or removed.
let startTime = performance.now();
function animate() {
  const currentTime = (performance.now() - startTime) / 1000.0; // Time in seconds.
  
  // (Optional) For debugging, you could call a sanity check here.
  // sanityCheckRenderFlags();

  // For the line primitive, update geometry if needed.
  if (currentPrimitive && currentPrimitive.type === "line" &&
      ["temporal", "sequential", "blended"].includes(stateStore.selectedMappingType)) {
    updateGeometry(currentTime);
  }
  
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

// Set initial camera position and start animation.
camera.position.set(0, 0, 5);
controls.update();
animate();

// -----------------------------------------------------------------------------
// Hybrid Garbage Collection Trigger.
// -----------------------------------------------------------------------------
setInterval(() => {
  stateStore.runGarbageCollection();
}, 5 * 60 * 1000);

// Optionally, trigger threshold-based garbage collection.
function thresholdBasedGC() {
  const THRESHOLD = 5000;
  if (stateStore.sessionShapes.size > THRESHOLD) {
    stateStore.runGarbageCollection();
  }
}
// You could call thresholdBasedGC() after each addShape or periodically.

// -----------------------------------------------------------------------------
// Handle Window Resize.
// -----------------------------------------------------------------------------
window.addEventListener("resize", () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  cameraManager.updateAspect(window.innerWidth, window.innerHeight);
});
