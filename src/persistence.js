// persistence.js

// -----------------------------------------------------------------------------
// Module Dependencies
// -----------------------------------------------------------------------------
// Dexie is used to interact with IndexedDB.
// stateStore holds the current session shapes and related state.
// logger provides logging capabilities.
// We also import ComplexShape2D to check for fallback low-level serialization
// in case a shape does not implement getSerializableParameters().
import Dexie from 'dexie';
import { stateStore } from './state/stateStore.js';
import { logger } from './utils/logger.js';
import { ComplexShape2D } from './Geometry/ComplexShape2d.js';

// =============================================================================
// 1. SETUP: Initialize Dexie Database and Define Schema
// =============================================================================

// Create a new Dexie database instance.
const db = new Dexie('MathShapeDB');

// Define the database schema for version 1:
// - 'shapes' table: stores each shape record with primary key 'id',
//   and indexes on 'type' and 'createdAt' (to support ordering and querying).
// - 'metadata' table: stores scene-level metadata as key-value pairs.
db.version(1).stores({
  shapes: 'id, type, createdAt',
  metadata: 'key'
});

// =============================================================================
// 2. CAPTURE & FILTER FUNCTIONS
// =============================================================================

/**
 * captureVisualState
 * Iterates over all shapes in stateStore.sessionShapes and marks those
 * that are currently rendered as persistent.
 */
export function captureVisualState() {
  let flaggedCount = 0;
  try {
    stateStore.sessionShapes.forEach(shape => {
      try {
        if (shape.rendered === true) {
          shape.persistent = true;
          flaggedCount++;
        }
      } catch (error) {
        logger.error(`Error flagging shape ${shape.id}: ${error.message}`);
      }
    });
    logger.info(`Successfully flagged ${flaggedCount} shapes as persistent`);
    return flaggedCount > 0;
  } catch (error) {
    logger.error(`Failed to capture visual state: ${error.message}`);
    return false;
  }
}

/**
 * getOrderedPersistentShapes
 * Filters the shapes marked as persistent and returns an array ordered by creation time.
 */
export function getOrderedPersistentShapes() {
  try {
    const persistentShapes = Array.from(stateStore.sessionShapes)
      .filter(shape => shape.persistent === true);
    const orderedShapes = persistentShapes.sort((a, b) => a.createdAt - b.createdAt);
    logger.info(`Retrieved ${orderedShapes.length} persistent shapes, ordered by creation time`);
    return orderedShapes;
  } catch (error) {
    logger.error(`Failed to get ordered persistent shapes: ${error.message}`);
    return [];
  }
}

// =============================================================================
// 3. SERIALIZATION FUNCTION
// =============================================================================

/**
 * serializeShapesForStorage
 * Creates a serializable representation of the persistent shapes along with scene metadata.
 * It uses the high-level method getSerializableParameters() if available.
 * Otherwise, it falls back to low-level serialization logic based on common properties
 * (such as vertices for line segments). This fallback is particularly useful for shapes
 * like ComplexShape2D where we can extract vertex data.
 */
export function serializeShapesForStorage() {
  try {
    const orderedShapes = getOrderedPersistentShapes();

    if (orderedShapes.length === 0) {
      logger.warn("No persistent shapes found to serialize");
      return null;
    }

    // For each shape, create a serializable record.
    const serializableShapes = orderedShapes.map(shape => {
      try {
        let parameters = {};

        // High-level serialization: use the shape's own method if provided.
        if (typeof shape.getSerializableParameters === 'function') {
          parameters = shape.getSerializableParameters();
        } else {
          // Low-level fallback:
          // If the shape is an instance of ComplexShape2D, we assume it has vertices.
          if (shape instanceof ComplexShape2D && shape.vertices) {
            parameters.vertices = shape.vertices.map(v => ({
              position: { x: v.position.x, y: v.position.y },
              // If color information is needed, include it.
              color: v.color
            }));
            // Also include any basic metric information if available.
            if (shape.metric !== undefined) {
              parameters.metric = { ...shape.metric };
            }
            // Optionally, include blend parameters.
            if (shape.blendParams !== undefined) {
              parameters.blendParams = { ...shape.blendParams };
            }
          } else {
            // Generic fallback for other shapes: attempt to extract common properties.
            if (shape.size !== undefined) parameters.size = shape.size;
            if (shape.position !== undefined) {
              parameters.position = { 
                x: shape.position.x || 0, 
                y: shape.position.y || 0 
              };
            }
            if (shape.rotation !== undefined) parameters.rotation = shape.rotation;
            if (shape.color !== undefined) parameters.color = { ...shape.color };

            // Type-specific fallback:
            if (shape.type === 'triangle') {
              if (shape.cornerRounding !== undefined) parameters.cornerRounding = shape.cornerRounding;
              if (shape.edgeSmoothness !== undefined) parameters.edgeSmoothness = [...shape.edgeSmoothness];
            } else if (shape.type === 'arc') {
              if (shape.radius !== undefined) parameters.radius = shape.radius;
              if (shape.startAngle !== undefined) parameters.startAngle = shape.startAngle;
              if (shape.endAngle !== undefined) parameters.endAngle = shape.endAngle;
              if (shape.segments !== undefined) parameters.segments = shape.segments;
              if (shape.thickness !== undefined) parameters.thickness = shape.thickness;
            }
          }
        }

        // Return a plain object representing the shape.
        return {
          id: shape.id,
          type: shape.type || 'unknown',
          createdAt: shape.createdAt,
          data: parameters,
          // Serialize the distance mapper by saving its name or identifier.
          distanceMapperName: shape.distanceMapperName || 
                              (shape.distanceMapper && shape.distanceMapper.name) || 
                              'identity'
        };
      } catch (shapeError) {
        logger.error(`Error serializing shape ${shape.id}: ${shapeError.message}`);
        return null;
      }
    }).filter(shape => shape !== null);

    // Prepare scene-level metadata (e.g., mapping configuration, version, timestamp).
    const sceneMetadata = {
      version: '1.0',
      timestamp: Date.now(),
      mappingConfig: {
        selectedMappingType: stateStore.selectedMappingType,
        blendFactor: stateStore.blendFactor,
        timeFrequency: stateStore.timeFrequency,
        recursionLimit: stateStore.recursionLimit,
        amplitude: stateStore.amplitude,
        polyCoeffs: stateStore.mappingParams ? stateStore.mappingParams.polyCoeffs : [0, 1, 0],
        a: stateStore.mappingParams ? stateStore.mappingParams.a : 1,
        b: stateStore.mappingParams ? stateStore.mappingParams.b : 1,
        c: stateStore.mappingParams ? stateStore.mappingParams.c : 0,
        e: stateStore.mappingParams ? stateStore.mappingParams.e : 0
      }
    };

    logger.info(`Successfully serialized ${serializableShapes.length} shapes`);
    return { shapes: serializableShapes, metadata: sceneMetadata };
  } catch (error) {
    logger.error(`Failed to serialize shapes: ${error.message}`);
    return null;
  }
}

// =============================================================================
// 4. SAVE AND LOAD FUNCTIONS USING DEXIE
// =============================================================================

/**
 * saveScene
 * This function captures the current visual state, serializes the data,
 * and then saves it to IndexedDB via Dexie.
 */
export async function saveScene(sceneName = 'default') {
  try {
    const captured = captureVisualState();
    if (!captured) {
      logger.warn("No shapes were flagged as persistent during capture");
      return false;
    }

    const serializedData = serializeShapesForStorage();
    if (!serializedData) {
      logger.error("Failed to serialize visual state");
      return false;
    }

    // Clear existing scene data from the Dexie tables.
    await db.shapes.clear();
    await db.metadata.clear();

    // Save each shape record into the 'shapes' table.
    await db.shapes.bulkPut(serializedData.shapes);

    // Add scene-level metadata into the 'metadata' table, using a fixed key (e.g., 'scene').
    await db.metadata.put({ key: 'scene', value: { sceneName, ...serializedData.metadata } });

    // Reset persistence flags after saving.
    resetPersistenceFlags();

    logger.info(`Visual state saved successfully as scene '${sceneName}'`);
    return true;
  } catch (error) {
    logger.error(`Failed to save visual state: ${error.message}`);
    return false;
  }
}

/**
 * loadScene
 * Loads the saved scene from Dexie, reconstructs the shapes, and restores scene metadata.
 * This function assumes that stateStore provides methods for clearing the current scene
 * and for creating shapes from serialized data.
 */
export async function loadScene() {
  try {
    // Retrieve all shape records.
    const savedShapes = await db.shapes.toArray();
    // Retrieve scene metadata.
    const metaRecord = await db.metadata.get('scene');

    if (!savedShapes || savedShapes.length === 0) {
      logger.warn("No scene data found in IndexedDB");
      return false;
    }

    // Clear the current stateStore scene.
    stateStore.clear();

    // For each saved shape, reconstruct the shape using stateStore's factory method.
    savedShapes.forEach(record => {
      // Assumes stateStore.createShapeFromSerialized(type, data) exists.
      const shape = stateStore.createShapeFromSerialized(record.type, record.data);
      if (shape) {
        // Ensure the shape's id and createdAt are preserved.
        shape.id = record.id;
        shape.createdAt = record.createdAt;
        // Optionally, set distance mapper info if needed.
        shape.distanceMapperName = record.distanceMapperName;
        stateStore.addShape(shape);
      }
    });

    // Restore scene-level metadata (e.g., mapping configuration).
    if (metaRecord && metaRecord.value) {
      const meta = metaRecord.value;
      // Update stateStore mapping configuration as needed.
      stateStore.selectedMappingType = meta.mappingConfig.selectedMappingType;
      stateStore.blendFactor = meta.mappingConfig.blendFactor;
      stateStore.timeFrequency = meta.mappingConfig.timeFrequency;
      stateStore.recursionLimit = meta.mappingConfig.recursionLimit;
      stateStore.amplitude = meta.mappingConfig.amplitude;
      // Additional metadata restoration can be added here.
    }

    logger.info(`Scene '${metaRecord?.value?.sceneName || 'default'}' loaded successfully from IndexedDB`);
    return true;
  } catch (error) {
    logger.error(`Failed to load scene: ${error.message}`);
    return false;
  }
}

// =============================================================================
// 5. END-OF-SESSION PERSISTENCE & GARBAGE COLLECTION
// =============================================================================

/**
 * autoSaveAndGarbageCollect
 * Designed for end-of-session persistence, this function automatically saves the current scene
 * and then performs garbage collection on stateStore to remove stale or unrendered shapes.
 * It returns true if both operations succeed.
 */
export async function autoSaveAndGarbageCollect() {
  try {
    // Auto-save the current scene.
    const saved = await saveScene('autosave');
    if (!saved) {
      logger.error("Auto-save failed.");
      return false;
    }
    logger.info("Auto-save completed successfully.");

    // Perform garbage collection using stateStore's method (assumed to exist).
    if (typeof stateStore.runGarbageCollection === 'function') {
      stateStore.runGarbageCollection();
      logger.info("Garbage collection executed successfully.");
    } else {
      logger.warn("stateStore.runGarbageCollection is not implemented.");
    }
    return true;
  } catch (error) {
    logger.error(`Failed in autoSaveAndGarbageCollect: ${error.message}`);
    return false;
  }
}

// =============================================================================
// 6. RESET PERSISTENCE FLAGS FUNCTION
// =============================================================================

/**
 * resetPersistenceFlags
 * Clears the 'persistent' flag on all shapes after saving.
 */
export function resetPersistenceFlags() {
  try {
    let count = 0;
    stateStore.sessionShapes.forEach(shape => {
      if (shape.persistent === true) {
        shape.persistent = false;
        count++;
      }
    });
    logger.info(`Reset persistence flags for ${count} shapes`);
    return true;
  } catch (error) {
    logger.error(`Failed to reset persistence flags: ${error.message}`);
    return false;
  }
}

// =============================================================================
// 7. UI INTEGRATION: DAT.GUI AND STANDALONE BUTTON
// =============================================================================

/**
 * addSaveButtonToGUI
 * Adds a 'Save Current State' button to the dat.GUI interface.
 */
export function addSaveButtonToGUI(gui) {
  const saveFolder = gui.addFolder('Save/Restore');
  const saveController = {
    saveState: async function() {
      const success = await saveScene();
      if (success) {
        alert("Visual state saved successfully!");
      } else {
        alert("Failed to save visual state. Check console for details.");
      }
    }
  };
  saveFolder.add(saveController, 'saveState').name('Save Current State');
  saveFolder.open();
}

/**
 * setupSaveButton
 * Sets up an event listener for a standalone HTML button (if it exists) with id 'saveButton'.
 */
export function setupSaveButton() {
  const saveButton = document.getElementById('saveButton');
  if (saveButton) {
    saveButton.addEventListener('click', async () => {
      const success = await saveScene();
      if (success) {
        alert("Visual state saved successfully!");
      } else {
        alert("Failed to save visual state. Check console for details.");
      }
    });
    logger.info("Save button event listener set up");
  }
}

/**
 * initializeSaveFeature
 * Initializes the save feature by wiring up both the dat.GUI button and the standalone HTML button.
 * This function should be called from index.js after the GUI is initialized.
 */
export function initializeSaveFeature(gui) {
  if (gui) {
    addSaveButtonToGUI(gui);
  }
  setupSaveButton();
  logger.info("Save feature initialized");
}
