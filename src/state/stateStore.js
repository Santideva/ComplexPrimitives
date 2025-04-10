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

export const stateStore = {
  // Use a Set for sessionShapes for fast insertion, deletion, and uniqueness.
  sessionShapes: new Set(),
  visualUpdateCallbacks: [], // Storage for visual update callbacks
  
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
  
  // ---------------------------------------------------------------------------
  // NEW: createShapeFromSerialized()
  // ---------------------------------------------------------------------------
  /**
   * createShapeFromSerialized
   * This factory method is used by the persistence module to reconstruct shapes 
   * from their serialized data.
   * 
   * Input:
   *  - type: A string representing the shape type ("triangle", "arc", "line", etc.)
   *  - data: A plain object containing the serialized parameters.
   * 
   * The method uses a switch statement to choose the appropriate constructor.
   * If a shape type is unknown, it logs a warning and returns null.
   */
  createShapeFromSerialized(type, data) {
    let shape = null;
    try {
      switch (type.toLowerCase()) {
        case "triangle":
          // Construct a TrianglePrimitive using the data.
          shape = new TrianglePrimitive(data);
          break;
        case "arc":
          // Construct an ArcPrimitive using the data.
          shape = new ArcPrimitive(data);
          break;
        case "line":
          // Use ComplexShape2D for line segments.
          shape = new ComplexShape2D(data);
          break;
        default:
          logger.warn(`Unknown shape type during deserialization: ${type}`);
          break;
      }
    } catch (error) {
      logger.error(`Error deserializing shape of type ${type}: ${error.message}`);
      shape = null;
    }
    return shape;
  }
  
  // ---------------------------------------------------------------------------
  // End of stateStore object.
  // ---------------------------------------------------------------------------
};
