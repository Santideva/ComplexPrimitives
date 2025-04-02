// File: src/state/stateStore.js
import { 
  createBlendedPrimitive, 
  weightedRUnion, 
  weightedRIntersection, 
  weightedRDifference 
} from "../utils/SDFBlending.js";
import { distanceMappingRegistry, identityMapping } from "../utils/DistanceMapping.js";
import { logger } from "../utils/logger.js";

export const stateStore = {
  shapes: [],
  visualUpdateCallbacks: [], // Add storage for visual update callbacks
  
  addShape(shape) {
    this.shapes.push(shape);
    console.log(`Shape with id ${shape.id} added. Total shapes: ${this.shapes.length}`);
    return shape.id; // Return ID for convenience
  },
  
  getShape(shapeId) {
    return this.shapes.find(s => s.id === shapeId);
  },
  
  getShapes() {
    return this.shapes;
  },
  
  removeShape(shapeId) {
    const index = this.shapes.findIndex(s => s.id === shapeId);
    if (index >= 0) {
      const shape = this.shapes[index];
      this.shapes.splice(index, 1);
      console.log(`Shape with id ${shapeId} removed. Total shapes: ${this.shapes.length}`);
      return shape;
    }
    return null;
  },
  
  clear() {
    this.shapes = [];
    console.log("State store cleared.");
  },
  
  // Add method to register visual update callbacks
  onVisualUpdate(callback) {
    if (typeof callback === 'function') {
      this.visualUpdateCallbacks.push(callback);
      logger.debug(`Visual update callback registered. Total callbacks: ${this.visualUpdateCallbacks.length}`);
      return true;
    }
    logger.warn("Attempted to register invalid visual update callback");
    return false;
  },
  
  // Add method to trigger visual updates
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
      // Update the shape's distanceMapper using the new configuration
      if (mapperName && typeof mapperName === 'string') {
        if (distanceMappingRegistry[mapperName]) {
          // Use the factory if parameters are needed
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
        // Recompute SDF if the shape has an updateCompositeSDF method
        if (typeof shape.updateCompositeSDF === 'function') {
          shape.updateCompositeSDF();
        }
        console.log(`Updated shape ${shape.id} mapper to ${mapperName} with params:`, mapperParams);
        
        // Trigger visual update after updating the mapper
        this.triggerVisualUpdate(shape.id);
      }
    }
  },
  
  // Update for the setShapeBlendParams method to trigger visual updates
  setShapeBlendParams(shapeId, blendParams) {
    const shape = this.getShape(shapeId);
    if (shape && typeof shape.setBlendParams === 'function') {
      shape.setBlendParams(blendParams);
      console.log(`Updated blend params for shape ${shapeId}:`, blendParams);
      this.triggerVisualUpdate(shapeId);
      return true;
    }
    return false;
  },
  
  // Update for the addBlendPrimitive method to trigger visual updates
  addBlendPrimitive(shapeId, primitiveId, operation = null) {
    const shape = this.getShape(shapeId);
    const primitive = this.getShape(primitiveId);
    
    if (shape && primitive && typeof shape.addBlendPrimitive === 'function') {
      // Prevent adding a shape to its own blend list
      if (shapeId === primitiveId) {
        console.warn("Cannot add a shape to its own blend list");
        return false;
      }
      
      shape.addBlendPrimitive(primitive, operation);
      console.log(`Added primitive ${primitiveId} to shape ${shapeId} with operation: ${operation || 'current'}`);
      this.triggerVisualUpdate(shapeId);
      return true;
    }
    return false;
  },
  
  // Update for the removeBlendPrimitive method to trigger visual updates
  removeBlendPrimitive(shapeId, primitiveId) {
    const shape = this.getShape(shapeId);
    
    if (shape && shape.blendParams && shape.blendParams.primitives) {
      const index = shape.blendParams.primitives.findIndex(p => p.id === primitiveId);
      if (index >= 0) {
        shape.blendParams.primitives.splice(index, 1);
        shape.updateCompositeSDF();
        console.log(`Removed primitive ${primitiveId} from shape ${shapeId}`);
        this.triggerVisualUpdate(shapeId);
        return true;
      }
    }
    return false;
  },
  
  // Update for the clearBlendPrimitives method to trigger visual updates
  clearBlendPrimitives(shapeId) {
    const shape = this.getShape(shapeId);
    if (shape && typeof shape.clearBlendPrimitives === 'function') {
      shape.clearBlendPrimitives();
      console.log(`Cleared all blend primitives from shape ${shapeId}`);
      this.triggerVisualUpdate(shapeId);
      return true;
    }
    return false;
  },
  
  // Create a new shape by blending multiple existing shapes
  createBlendedShape(primitiveIds, params = {}) {
    // Ensure we have valid primitives
    const primitivesToBlend = primitiveIds
      .map(id => this.getShape(id))
      .filter(shape => shape !== undefined);
    
    if (primitivesToBlend.length === 0) {
      console.warn("No valid primitives found for blending");
      return null;
    }
    
    // Create the blended primitive using the SDFBlending utility
    const blendedShape = createBlendedPrimitive(primitivesToBlend, params);
    
    // Add the new shape to the stateStore and return it
    this.shapes.push(blendedShape);
    console.log(`Created blended shape with ${primitivesToBlend.length} primitives. Total shapes: ${this.shapes.length}`);
    
    // Trigger visual update for the new shape
    this.triggerVisualUpdate(blendedShape.id);
    
    return blendedShape;
  },
  
  // Update for the setBasePrimitive method to trigger visual updates
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
  }
};