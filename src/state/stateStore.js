import { 
  createBlendedPrimitive, 
  weightedRUnion, 
  weightedRIntersection, 
  weightedRDifference 
} from "../utils/SDFBlending.js";
import { 
  distanceMappingRegistry, 
  identityMapping, 
  createMapping 
} from "../utils/DistanceMapping.js";
import { logger } from "../utils/logger.js";
import { TrianglePrimitive, ArcPrimitive } from "../Primitives/primaryDerivativePrimitives.js";
import { ComplexShape2D } from "../Geometry/ComplexShape2d.js";
// Optionally, if you have a base class for fallback:
import { ComplexPrimitive2D } from "../Primitives/ComplexPrimitive2d.js";


export const stateStore = {
  // Use a Set for sessionShapes for fast insertion, deletion, and uniqueness.
  sessionShapes: new Set(),
  visualUpdateCallbacks: [], // Storage for visual update callbacks

  dependencyMap: new Map(),

  // — Helpers for dependency tracking —
  _updateDependencies(shapeId, childIds = []) {
      this.dependencyMap.set(shapeId, childIds);
    },
    _hasCycle(startId, visited = new Set(), stack = new Set()) {
        if (stack.has(startId)) return true;
        if (visited.has(startId)) return false;
        visited.add(startId);
        stack.add(startId);
        for (const childId of this.dependencyMap.get(startId) || []) {
          if (this._hasCycle(childId, visited, stack)) return true;
        }
        stack.delete(startId);
        return false;
       },


  // New mapping configuration properties
  selectedMappingType: "polynomial", // Default mapping type
  baseMapping: identityMapping, // Default base mapping function
  blendFactor: 0.5, // For blended mappings
  timeFrequency: 1.0, // For temporal mappings
  recursionLimit: 3, // For recursive mappings
  amplitude: 1.0,

  // Dynamic distance mapping based on current configuration.
  get distanceMapping() {
    return createMapping(this.selectedMappingType, {
      baseMapper: this.baseMapping,
      baseMappers: [this.baseMapping, identityMapping], // Default second mapper for composite operations.
      blendFactor: this.blendFactor,
      frequency: this.timeFrequency,
      amplitude: this.amplitude, 
      iterations: this.recursionLimit,
      polyCoeffs: [0, 1, 0], // Default linear coefficients.
      a: 1,
      b: 1,
      c: 0,
      e: 0
    });
  },
  
  // Method to update mapping configuration.
  updateMappingConfig(config = {}) {
    const {
      mappingType,
      baseMapper,
      secondaryMapper,
      blendFactor,
      frequency,
      recursionLimit,
      polyCoeffs,
      a, b, c, e,
      amplitude = 1.0  // Provide a default value for amplitude.
    } = config;
    
    if (mappingType) this.selectedMappingType = mappingType;
    if (baseMapper) this.baseMapping = baseMapper;
    if (blendFactor !== undefined) this.blendFactor = blendFactor;
    if (frequency !== undefined) this.timeFrequency = frequency;
    if (recursionLimit !== undefined) this.recursionLimit = recursionLimit;
    if (amplitude !== undefined) this.amplitude = amplitude;

    this.mappingParams = {
      ...this.mappingParams,
      polyCoeffs: polyCoeffs || [0, 1, 0],
      a: a !== undefined ? a : 1,
      b: b !== undefined ? b : 1,
      c: c !== undefined ? c : 0,
      e: e !== undefined ? e : 0,
      secondaryMapper: secondaryMapper || identityMapping
    };
    
    logger.debug(`Updated mapping configuration: ${this.selectedMappingType}`);
    return this.distanceMapping;
  },
  
  // ---------------------------------------------------------------------------
  // Existing methods for shape management.
  // ---------------------------------------------------------------------------
  
  // Add a shape to sessionShapes.
  addShape(shape) {
    // Immediately flag the shape as active.
    shape.active = true;
    // Record the creation time (in milliseconds) for later garbage collection rules.
    shape.createdAt = Date.now();
    // Use our custom flag "rendered" (to be updated by rendering logic).
    shape.rendered = true;
    
    this.sessionShapes.add(shape);
    console.log(
      `Shape added - id: ${shape.id}, active: ${shape.active}, rendered: ${shape.rendered}, createdAt: ${shape.createdAt}. ` +
      `Total shapes in session: ${this.sessionShapes.size}`
    );
    return shape.id;
  },
  
  // Retrieve a shape by its id from sessionShapes.
  getShape(shapeId) {
    for (let shape of this.sessionShapes) {
      if (shape.id === shapeId) return shape;
    }
    return undefined;
  },
  
  // Return all shapes as an array.
  getShapes() {
    return Array.from(this.sessionShapes);
  },
  
  // Remove a shape from sessionShapes by its id.
  removeShape(shapeId) {
    let removedShape = null;
    for (let shape of this.sessionShapes) {
      if (shape.id === shapeId) {
        removedShape = shape;
        break;
      }
    }
    if (removedShape) {
      this.sessionShapes.delete(removedShape);
      console.log(`Shape with id ${shapeId} removed. Total shapes in session: ${this.sessionShapes.size}`);
      return removedShape;
    }
    return null;
  },
  
  // Clear all shapes from sessionShapes.
  clear() {
    this.sessionShapes.clear();
    console.log("State store cleared.");
  },
  
  onVisualUpdate(callback) {
    if (typeof callback === 'function') {
      this.visualUpdateCallbacks.push(callback);
      logger.debug(`Visual update callback registered. Total callbacks: ${this.visualUpdateCallbacks.length}`);
      return true;
    }
    logger.warn("Attempted to register invalid visual update callback");
    return false;
  },
  
  triggerVisualUpdate(shapeId) {
      // Cycle guard
      if (this._hasCycle(shapeId)) {
      console.error(`Cycle detected in dependencies of shape ${shapeId}; update aborted.`);
      return;
      }    
    logger.debug(`Triggering visual update for shape ${shapeId}`);
    this.visualUpdateCallbacks.forEach(callback => {
      try {
        callback(shapeId);
      } catch (error) {
        logger.error(`Error in visual update callback: ${error.message}`);
      }
    });
  },
  
  updateShapeMapper(shapeId, mapperName, mapperParams) {
    const shape = this.getShape(shapeId);
    if (shape) {
      if (mapperName && typeof mapperName === 'string') {
        if (distanceMappingRegistry[mapperName]) {
          if (typeof distanceMappingRegistry[mapperName] === 'function' &&
              distanceMappingRegistry[mapperName].length > 0) {
            shape.distanceMapper = distanceMappingRegistry[mapperName](
              mapperParams.a, mapperParams.b, mapperParams.c, mapperParams.e
            );
          } else {
            shape.distanceMapper = distanceMappingRegistry[mapperName];
          }
        } else {
          console.warn(`Mapper "${mapperName}" not found. Using identity mapping.`);
          shape.distanceMapper = identityMapping;
        }
        if (typeof shape.updateCompositeSDF === 'function') {
          shape.updateCompositeSDF();
        }
        console.log(`Updated shape ${shape.id} mapper to ${mapperName} with params:`, mapperParams);
        this.triggerVisualUpdate(shape.id);
      }
    }
  },
  
  setShapeBlendParams(shapeId, blendParams) {
    const shape = this.getShape(shapeId);
    if (shape && typeof shape.setBlendParams === 'function') {
      shape.setBlendParams(blendParams);
      console.log(`Updated blend params for shape ${shapeId}:`, blendParams);
      this.triggerVisualUpdate(shape.id);
      return true;
    }
    return false;
  },
  
  addBlendPrimitive(shapeId, primitiveId, operation = null) {
    const shape = this.getShape(shapeId);
    const primitive = this.getShape(primitiveId);
    
    if (shape && primitive && typeof shape.addBlendPrimitive === 'function') {
      if (shapeId === primitiveId) {
        console.warn("Cannot add a shape to its own blend list");
        return false;
      }
      
      shape.addBlendPrimitive(primitive, operation);
      console.log(`Added primitive ${primitiveId} to shape ${shapeId} with operation: ${operation || 'current'}`);
      const shape = this.getShape(shapeId);
      this._updateDependencies(
        shapeId,
        shape.blendParams.primitives.map(p => p.id)
      );      
      this.triggerVisualUpdate(shape.id);
      return true;
    }
    return false;
  },
  
  removeBlendPrimitive(shapeId, primitiveId) {
    const shape = this.getShape(shapeId);
    if (shape && shape.blendParams && shape.blendParams.primitives) {
      const index = shape.blendParams.primitives.findIndex(p => p.id === primitiveId);
      if (index >= 0) {
        shape.blendParams.primitives.splice(index, 1);
        shape.updateCompositeSDF();
        console.log(`Removed primitive ${primitiveId} from shape ${shapeId}`);
        this._updateDependencies(
          shapeId,
          shape.blendParams.primitives.map(p => p.id)
        );
        this.triggerVisualUpdate(shape.id);
        return true;
      }
    }
    return false;
  },
  
  clearBlendPrimitives(shapeId) {
    const shape = this.getShape(shapeId);
    if (shape && typeof shape.clearBlendPrimitives === 'function') {
      shape.clearBlendPrimitives();
      console.log(`Cleared all blend primitives from shape ${shapeId}`);
      this._updateDependencies(shapeId, []);      
      this.triggerVisualUpdate(shape.id);
      return true;
    }
    return false;
  },
  
  createBlendedShape(primitiveIds, params = {}) {
    const primitivesToBlend = primitiveIds
      .map(id => this.getShape(id))
      .filter(shape => shape !== undefined);
    
    if (primitivesToBlend.length === 0) {
      console.warn("No valid primitives found for blending");
      return null;
    }
    
    const blendedShape = createBlendedPrimitive(primitivesToBlend, params);
    this.sessionShapes.add(blendedShape);
    console.log(`Created blended shape with ${primitivesToBlend.length} primitives. Total shapes in session: ${this.sessionShapes.size}`);
    this.triggerVisualUpdate(blendedShape.id);
    return blendedShape;
  },
  
  setBasePrimitive(shapeId, primitiveId) {
    const shape = this.getShape(shapeId);
    const primitive = this.getShape(primitiveId);
    
    if (shape && primitive && typeof shape.setBasePrimitive === 'function') {
      shape.setBasePrimitive(primitive);
      console.log(`Set ${primitiveId} as base primitive for shape ${shapeId}`);
      const shape = this.getShape(shapeId);
      const deps  = [primitiveId, ...shape.blendParams.primitives.map(p => p.id)];
      this._updateDependencies(shapeId, deps);      
      this.triggerVisualUpdate(shapeId);
      return true;
    }
    return false;
  },
  
  // Apply the current global mapping configuration to a specific shape.
  applyGlobalMappingToShape(shapeId) {
    const shape = this.getShape(shapeId);
    if (shape) {
      shape.distanceMapper = this.distanceMapping;
      if (typeof shape.updateCompositeSDF === 'function') {
        shape.updateCompositeSDF();
      }
      logger.debug(`Applied global mapping (${this.selectedMappingType}) to shape ${shapeId}`);
      this.triggerVisualUpdate(shapeId);
      return true;
    }
    return false;
  },
  
  // **************** Hybrid Garbage Collection ****************
  // Remove shapes that are not rendered and that were created more than MIN_AGE milliseconds ago.
  runGarbageCollection() {
    const now = Date.now();
    const MIN_AGE = 5 * 60 * 1000; // 10 minutes in milliseconds
    
    // Iterate over the sessionShapes Set.
    for (let shape of this.sessionShapes) {
      // If the shape is older than MIN_AGE and is not rendered, remove it.
      if ((now - shape.createdAt) > MIN_AGE && !shape.rendered) {
        this.sessionShapes.delete(shape);
      }
    }
    console.log(`Garbage Collection complete. Remaining shapes in session: ${this.sessionShapes.size}`);
  },
  
  /**
   * createShapeFromSerialized
   * The method uses a switch statement to choose the appropriate constructor.
   * If a shape type is unknown, it logs a warning and returns null.
   */
  createShapeFromSerialized(type, data) {
    let shape = null;
  
    logger.info(`Deserializing shape of type: "${type}" with data: ${JSON.stringify(data)}`);
  
    try {
      switch (type.toLowerCase()) {
        case "triangle":
          logger.debug(`Creating TrianglePrimitive with data: ${JSON.stringify(data)}`);
          shape = new TrianglePrimitive(data);
          break;
  
        case "arc":
          logger.debug(`Creating ArcPrimitive with data: ${JSON.stringify(data)}`);
          shape = new ArcPrimitive(data);
          break;
  
        case "line":
          logger.debug(`Creating ComplexShape2D (line) with data: ${JSON.stringify(data)}`);
          shape = new ComplexShape2D(data);
          break;
  
        case "complexshape":
          logger.debug(`Creating ComplexShape2D (complex) with data: ${JSON.stringify(data)}`);
          shape = new ComplexShape2D(data);
          break;
  
        case "complexprimitive":
          logger.debug(`Creating ComplexPrimitive2D with data: ${JSON.stringify(data)}`);
          shape = new ComplexPrimitive2D(data);
          break;
  
        case "composite":
          logger.debug(`Creating Composite shape with data: ${JSON.stringify(data)}`);
          // Depending on implementation, composite shapes can be handled as ComplexShape2D or a dedicated composite class.
          shape = new ComplexShape2D(data);
          break;
  
        default:
          logger.warn(`Unknown shape type during deserialization: "${type}". Cannot create shape.`);
          break;
      }
  
      if (shape) {
        // Restore traceability metadata if available
        if (data?.id) {
          shape.id = data.id;  // Optionally restore ID
          logger.info(`Shape rehydrated successfully with ID: ${data.id}`);
        } else {
          logger.info(`Shape rehydrated successfully without ID`);
        }
  
        // Optionally attach distance mapper by name (if serialized)
        if (data?.distanceMapperName) {
          // Assuming getDistanceMapperByName is available in your utilities.
          const mapper = getDistanceMapperByName(data.distanceMapperName);
          if (mapper) {
            shape.distanceMapper = mapper;
            logger.debug(`Attached distance mapper: ${data.distanceMapperName}`);
          } else {
            logger.warn(`Distance mapper "${data.distanceMapperName}" not recognized`);
          }
        }
      }
  
    } catch (error) {
      logger.error(`Error deserializing shape of type "${type}": ${error.message}`);
      shape = null;
    }
  
    return shape;
  }

};
