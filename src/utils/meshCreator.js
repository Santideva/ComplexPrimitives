// File: src/utils/meshCreator.js
// A unified mesh-generation utility: 2D isolines, 3D isosurfaces, Delaunay, and curve/arc fitting

import * as THREE from 'three';
// instead of objects/…
import { MarchingCubes } from 'three/examples/jsm/objects/MarchingCubes.js';


import Delaunator from 'delaunator';
import { logger } from './logger.js';

/**
 * Marching Squares: extract 2D contour lines from an SDF function
 * @param {Function} sdfFn  -- (point:{x,y}) → signed distance
 * @param {Array<number>} bounds -- [xmin,ymin,xmax,ymax]
 * @param {number} resolution -- number of cells per axis
 * @returns {Array<Array<{x:number,y:number}>>} array of contour loops
 */
export function marchingSquares(sdfFn, bounds, resolution = 100) {
  logger.info(`Starting marching squares with resolution: ${resolution}`);
  logger.debug(`Bounds: [${bounds.join(', ')}]`);
  
  const [xmin, ymin, xmax, ymax] = bounds;
  const dx = (xmax - xmin) / resolution;
  const dy = (ymax - ymin) / resolution;
  
  // Precompute grid of SDF values
  logger.debug('Computing SDF grid...');
  const grid = [];
  let minSDF = Infinity;
  let maxSDF = -Infinity;
  
  for (let j = 0; j <= resolution; j++) {
    const row = [];
    const y = ymin + j * dy;
    for (let i = 0; i <= resolution; i++) {
      const x = xmin + i * dx;
      const value = sdfFn({ x, y });
      
      // Track min/max for debugging
      minSDF = Math.min(minSDF, value);
      maxSDF = Math.max(maxSDF, value);
      
      row.push(value);
    }
    grid.push(row);
  }
  
  logger.debug(`Grid computation complete. Size: ${grid.length}x${grid[0].length}`);
  logger.debug(`SDF value range: [${minSDF.toFixed(4)}, ${maxSDF.toFixed(4)}]`);
  
  // If all values are on the same side of the contour, we won't find any contours
  if ((minSDF >= 0 && maxSDF >= 0) || (minSDF <= 0 && maxSDF <= 0)) {
    logger.warn('All SDF values are on the same side of zero. No contours will be found.');
    return [];
  }

  // All possible marching squares edge configurations
  // Each entry maps to the edges that the contour passes through
  // Format: [start_edge, end_edge] where edges are numbered 0-3:
  // 0: bottom edge, 1: right edge, 2: top edge, 3: left edge
  const edgeTable = {
    1: [[3, 0]], // Bottom-left corner is inside
    2: [[0, 1]], // Bottom-right corner is inside
    3: [[3, 1]], // Bottom edge is inside
    4: [[1, 2]], // Top-right corner is inside
    5: [[3, 2], [1, 0]], // Ambiguous case - diagonal (bottom-left and top-right)
    6: [[0, 2]], // Right edge is inside
    7: [[3, 2]], // Everything except top-left is inside
    8: [[2, 3]], // Top-left corner is inside
    9: [[2, 0]], // Left edge is inside
    10: [[2, 1], [3, 0]], // Ambiguous case - diagonal (top-left and bottom-right)
    11: [[2, 1]], // Everything except top-right is inside
    12: [[1, 3]], // Top edge is inside
    13: [[1, 0]], // Everything except bottom-right is inside
    14: [[0, 3]], // Everything except bottom-left is inside
    // 0 and 15 are not in the table (all outside or all inside)
  };

  // Calculate linear interpolation along an edge
  function interpolate(edge, i, j, value1, value2) {
    const t = value1 / (value1 - value2); // Linear interpolation factor
    
    // Calculate position based on which edge we're on
    switch(edge) {
      case 0: // Bottom edge: (i,j) to (i+1,j)
        return { 
          x: xmin + (i + t) * dx, 
          y: ymin + j * dy 
        };
      case 1: // Right edge: (i+1,j) to (i+1,j+1)
        return { 
          x: xmin + (i + 1) * dx, 
          y: ymin + (j + t) * dy 
        };
      case 2: // Top edge: (i+1,j+1) to (i,j+1)
        return { 
          x: xmin + (i + 1 - t) * dx, 
          y: ymin + (j + 1) * dy 
        };
      case 3: // Left edge: (i,j+1) to (i,j)
        return { 
          x: xmin + i * dx, 
          y: ymin + (j + 1 - t) * dy 
        };
    }
  }

  // Generate a lookup table for all cells and their edge crossings
  const cellCrossings = [];
  
  for (let j = 0; j < resolution; j++) {
    cellCrossings[j] = [];
    for (let i = 0; i < resolution; i++) {
      // Get the values at the four corners of the cell
      const values = [
        grid[j][i],       // Bottom-left
        grid[j][i+1],     // Bottom-right
        grid[j+1][i+1],   // Top-right
        grid[j+1][i]      // Top-left
      ];
      
      // Calculate the cell case (0-15)
      let caseIndex = 0;
      for (let k = 0; k < 4; k++) {
        if (values[k] < 0) {
          caseIndex |= (1 << k);
        }
      }
      
      // Store the cell's case index and interpolated edge positions
      const cell = { 
        caseIndex,
        edges: []
      };
      
      // Look up the edge crossings for this case
      const edgePairs = edgeTable[caseIndex];
      if (edgePairs) {
        // For each edge pair, calculate the crossing points
        for (const [edge1, edge2] of edgePairs) {
          // Calculate each edge's interpolated point
          const corners = [
            [0, 3], // Corners for edge 0 (bottom)
            [1, 2], // Corners for edge 1 (right)
            [2, 3], // Corners for edge 2 (top)
            [0, 3]  // Corners for edge 3 (left)
          ];
          
          const c1 = corners[edge1][0];
          const c2 = corners[edge1][1];
          const pt1 = interpolate(
            edge1, i, j, 
            values[c1], values[c2]
          );
          
          const c3 = corners[edge2][0];
          const c4 = corners[edge2][1];
          const pt2 = interpolate(
            edge2, i, j,
            values[c3], values[c4]
          );
          
          cell.edges.push([pt1, pt2]);
        }
      }
      
      cellCrossings[j][i] = cell;
    }
  }
  
  logger.debug('Cell crossings computed');
  
  // Count cells with contour crossings
  let cellsWithCrossings = 0;
  for (let j = 0; j < resolution; j++) {
    for (let i = 0; i < resolution; i++) {
      if (cellCrossings[j][i].edges.length > 0) {
        cellsWithCrossings++;
      }
    }
  }
  
  logger.debug(`Cells with contour crossings: ${cellsWithCrossings}`);
  
  // If we have no crossings, return empty result
  if (cellsWithCrossings === 0) {
    logger.info('No contour crossings found in grid');
    return [];
  }
  
  // Trace contours using the cell crossing information
  const contours = [];
  const visited = new Set();
  
  function cellKey(i, j, edgeIndex) {
    return `${i},${j},${edgeIndex}`;
  }
  
  // Look for unvisited cells with contour crossings
  for (let j = 0; j < resolution; j++) {
    for (let i = 0; i < resolution; i++) {
      const cell = cellCrossings[j][i];
      
      // Skip if no contour or already visited
      if (cell.edges.length === 0) continue;
      
      // For each edge pair in this cell
      for (let e = 0; e < cell.edges.length; e++) {
        const key = cellKey(i, j, e);
        if (visited.has(key)) continue;
        
        // Start a new contour
        const contour = [];
        
        // Add the first edge pair's points
        const [pt1, pt2] = cell.edges[e];
        contour.push(pt1, pt2);
        visited.add(key);
        
        // Trace this contour until it closes or reaches a boundary
        let completed = false;
        let iterations = 0;
        const MAX_ITERATIONS = resolution * resolution * 2; // Safety limit
        
        // We'll start with a simplified tracer that just collects edge pairs
        // In a more advanced implementation, we would follow the contour
        // by finding adjacent cells that share an edge with our current endpoint
        
        let currI = i;
        let currJ = j;
        
        while (!completed && iterations < MAX_ITERATIONS) {
          iterations++;
          
          // Check adjacent cells (simplified - just checking east first)
          let found = false;
          
          // Check neighboring cells - right
          if (currI < resolution - 1) {
            const neighborCell = cellCrossings[currJ][currI + 1];
            if (neighborCell.edges.length > 0) {
              for (let ne = 0; ne < neighborCell.edges.length; ne++) {
                const neighborKey = cellKey(currI + 1, currJ, ne);
                if (!visited.has(neighborKey)) {
                  const [nextPt1, nextPt2] = neighborCell.edges[ne];
                  
                  // If any point is close to our last point, add it
                  const lastPoint = contour[contour.length - 1];
                  const d1 = Math.hypot(nextPt1.x - lastPoint.x, nextPt1.y - lastPoint.y);
                  const d2 = Math.hypot(nextPt2.x - lastPoint.x, nextPt2.y - lastPoint.y);
                  
                  if (d1 < dx/2) {
                    contour.push(nextPt2);
                    visited.add(neighborKey);
                    currI += 1;
                    found = true;
                    break;
                  } else if (d2 < dx/2) {
                    contour.push(nextPt1);
                    visited.add(neighborKey);
                    currI += 1;
                    found = true;
                    break;
                  }
                }
              }
            }
          }
          
          // If we didn't find a neighbor to the right, try other directions
          if (!found) {
            completed = true; // For now, just stop when we can't find a continuation
          }
        }
        
        if (contour.length > 2) {
          contours.push(contour);
        }
      }
    }
  }
  
  logger.info(`Marching squares completed. Found ${contours.length} contours.`);
  return contours;
}

/**
 * Marching Cubes: extract 3D isosurface from a volumetric SDF
 * @param {Function} sdfFn3D -- (pt:{x,y,z})→number
 * @param {Array<number>} bounds3D -- [xmin,ymin,zmin,xmax,ymax,zmax]
 * @param {number} resolution -- grid resolution per axis
 * @param {Object} options -- additional options
 * @param {number} [options.isoLevel=0] -- the isovalue to extract (0 for surface)
 * @param {boolean} [options.useThreeMC=true] -- use Three.js MarchingCubes or custom impl
 * @returns {THREE.Mesh|{vertices:Float32Array, indices:Uint32Array}} mesh or buffer data
 */
export function marchingCubes(sdfFn3D, bounds3D, resolution = 50, options = {}) {
  logger.info(`Starting marching cubes with resolution: ${resolution}`);
  logger.debug(`Bounds: [${bounds3D.join(', ')}]`);
  logger.debug(`Options: ${JSON.stringify(options)}`);
  
  const [xmin, ymin, zmin, xmax, ymax, zmax] = bounds3D;
  const isoLevel = options.isoLevel !== undefined ? options.isoLevel : 0;
  const useThreeMC = options.useThreeMC !== undefined ? options.useThreeMC : true;
  
  // Use Three.js MarchingCubes implementation if requested (default)
  if (useThreeMC) {
    logger.debug('Using Three.js MarchingCubes implementation');
    // Create a MarchingCubes object with the resolution
    const size = Math.max(xmax - xmin, ymax - ymin, zmax - zmin);
    const mc = new MarchingCubes(resolution, new THREE.MeshBasicMaterial(), true, true);
    
    // Position and scale the marching cubes object to match the bounds
    mc.position.set(
      (xmin + xmax) / 2,
      (ymin + ymax) / 2,
      (zmin + zmax) / 2
    );
    mc.scale.set(size / 2, size / 2, size / 2);
    
    // Fill the grid with SDF values
    const stepSize = 1 / resolution;
    logger.debug('Filling grid with SDF values...');
    
    let minSDF = Infinity;
    let maxSDF = -Infinity;
    
    for (let i = 0; i < resolution; i++) {
      const x = xmin + (i / resolution) * (xmax - xmin);
      for (let j = 0; j < resolution; j++) {
        const y = ymin + (j / resolution) * (ymax - ymin);
        for (let k = 0; k < resolution; k++) {
          const z = zmin + (k / resolution) * (zmax - zmin);
          
          // Convert to grid coordinates (-1 to 1)
          const nx = (i / resolution) * 2 - 1;
          const ny = (j / resolution) * 2 - 1;
          const nz = (k / resolution) * 2 - 1;
          
          const value = sdfFn3D({ x, y, z });
          
          // Track SDF range for debugging
          minSDF = Math.min(minSDF, value);
          maxSDF = Math.max(maxSDF, value);
          
          mc.setCell(i, j, k, value);
        }
      }
    }
    
    logger.debug(`SDF value range: [${minSDF.toFixed(4)}, ${maxSDF.toFixed(4)}]`);
    
    // Generate the isosurface
    logger.debug(`Generating isosurface with isolation value: ${isoLevel}`);
    mc.isolation = isoLevel;
    logger.info(`Marching cubes completed. Generated geometry with ${geometry.attributes.position.count} vertices.`);
    
    return mc;
  } 
  
  // Alternative: Use web-worker compatible implementation
  // This code would be used if Three.js MarchingCubes is not available or desired
  else {
    logger.debug('Using custom marching cubes implementation');
    // Create a grid of SDF values
    const dx = (xmax - xmin) / resolution;
    const dy = (ymax - ymin) / resolution;
    const dz = (zmax - zmin) / resolution;
    
    const grid = new Float32Array((resolution + 1) * (resolution + 1) * (resolution + 1));
    
    // Fill the grid with SDF values
    logger.debug('Filling grid with SDF values...');
    for (let i = 0; i <= resolution; i++) {
      const x = xmin + i * dx;
      for (let j = 0; j <= resolution; j++) {
        const y = ymin + j * dy;
        for (let k = 0; k <= resolution; k++) {
          const z = zmin + k * dz;
          const idx = i + j * (resolution + 1) + k * (resolution + 1) * (resolution + 1);
          grid[idx] = sdfFn3D({ x, y, z });
        }
      }
    }
    
    logger.debug('Grid computation complete');
    
    // Use a simple marching cubes implementation
    // This is a simplified version - in production use a more robust implementation
    // or a library like isosurface or regl-iso-surface
    
    // Pre-allocate memory for vertices and indices
    const vertices = [];
    const indices = [];
    
    logger.debug('Processing grid cells to extract isosurface...');
    // Process each cube in the grid
    for (let i = 0; i < resolution; i++) {
      for (let j = 0; j < resolution; j++) {
        for (let k = 0; k < resolution; k++) {
          // Get the 8 corners of the cube
          const v = [];
          for (let l = 0; l < 8; l++) {
            const ii = i + ((l & 1) > 0 ? 1 : 0);
            const jj = j + ((l & 2) > 0 ? 1 : 0);
            const kk = k + ((l & 4) > 0 ? 1 : 0);
            const idx = ii + jj * (resolution + 1) + kk * (resolution + 1) * (resolution + 1);
            v.push(grid[idx]);
          }
          
          // Determine which edges have the isosurface crossing them
          // This is where we would use the edge table lookup in a full implementation
          
          // Process cube based on the configuration (simplified)
          // In production, use the full marching cubes tables here
        }
      }
    }
    
    logger.info(`Custom marching cubes completed. Generated ${vertices.length / 3} vertices.`);
    
    // Return raw buffer data
    return {
      vertices: new Float32Array(vertices),
      indices: new Uint32Array(indices)
    };
  }
}

/**
 * Delaunay triangulation using Delaunator library
 * @param {Array<{x:number,y:number}>} points
 * @returns {{ vertices: Float32Array, indices: Uint32Array }} flat buffer data ready for Three.js
 */
export function delaunayTriangulation(points) {
  logger.info(`Starting Delaunay triangulation with ${points?.length || 0} points`);
  
  if (!points || points.length < 3) {
    logger.error('Delaunay triangulation requires at least 3 points');
    throw new Error('Delaunay triangulation requires at least 3 points');
  }
  
  // Format points for Delaunator (flat array [x0, y0, x1, y1, ...])
  const coords = [];
  for (const pt of points) {
    coords.push(pt.x, pt.y);
  }
  
  // Compute Delaunay triangulation
  logger.debug('Computing Delaunay triangulation...');
  const delaunay = Delaunator.from(coords);
  
  logger.debug(`Triangulation completed. Generated ${delaunay.triangles.length / 3} triangles.`);
  
  // Extract vertices and triangle indices
  const vertices = new Float32Array(coords.length + points.length); // x,y,z for each vertex
  for (let i = 0; i < points.length; i++) {
    vertices[i * 3] = points[i].x;     // x
    vertices[i * 3 + 1] = points[i].y; // y
    vertices[i * 3 + 2] = 0;           // z (assuming 2D, set to 0)
  }
  
  logger.info('Delaunay triangulation completed successfully');
  
  // Return vertices and triangulation indices
  return {
    vertices,
    indices: new Uint32Array(delaunay.triangles)
  };
}

/**
 * Creates a THREE.BufferGeometry from Delaunay triangulation
 * @param {Array<{x:number,y:number}>} points
 * @returns {THREE.BufferGeometry}
 */
export function createDelaunayGeometry(points) {
  logger.info(`Creating Delaunay geometry from ${points?.length || 0} points`);
  
  const { vertices, indices } = delaunayTriangulation(points);
  
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  
  // Compute normals for proper lighting
  logger.debug('Computing vertex normals...');
  geometry.computeVertexNormals();
  
  logger.info('Delaunay geometry created successfully');
  return geometry;
}

/**
 * Curve fitting & arc reconstruction
 * @param {Array<{x:number,y:number}>} points  points along a smooth curve
 * @param {Object} options - Additional options
 * @param {number} [options.minArcRadius=1e-6] - Minimum radius to consider valid
 * @param {number} [options.maxArcRadius=1e6] - Maximum radius to consider valid
 * @returns {Array<{cx:number,cy:number,r:number,start:number,end:number}>} arcs
 */
export function fitArcs(points, options = {}) {
  logger.info(`Starting arc fitting with ${points?.length || 0} points`);
  logger.debug(`Options: ${JSON.stringify(options)}`);
  
  if (!points || points.length < 3) {
    logger.warn('Insufficient points for arc fitting (minimum 3 required)');
    return [];
  }
  
  const minArcRadius = options.minArcRadius || 1e-6;
  const maxArcRadius = options.maxArcRadius || 1e6;
  
  const arcs = [];
  // Process points in groups of 3 to fit circular arcs
  logger.debug('Processing point triplets to fit arcs...');
  
  let skippedCollinear = 0;
  let skippedRadiusLimit = 0;
  let arcsFitted = 0;
  
  for (let i = 0; i + 2 < points.length; i += 2) {
    const A = points[i], B = points[i+1], C = points[i+2];
    
    // Calculate the circumcircle of these three points
    const a = B.x - A.x, b = B.y - A.y;
    const c = C.x - A.x, d = C.y - A.y;
    const e = a*(A.x+B.x) + b*(A.y+B.y);
    const f = c*(A.x+C.x) + d*(A.y+C.y);
    const g = 2*(a*(C.y-B.y) - b*(C.x-B.x));
    
    // Skip if the points are nearly collinear (g is close to zero)
    if (Math.abs(g) < 1e-6) {
      skippedCollinear++;
      continue;
    }
    
    // Calculate center and radius
    const cx = (d*e - b*f)/g;
    const cy = (a*f - c*e)/g;
    const r = Math.hypot(A.x-cx, A.y-cy);
    
    // Skip arcs with extreme radii
    if (r < minArcRadius || r > maxArcRadius) {
      skippedRadiusLimit++;
      continue;
    }
    
    // Calculate start and end angles
    const start = Math.atan2(A.y-cy, A.x-cx);
    const end = Math.atan2(C.y-cy, C.x-cx);
    
    // Check that B is actually on this arc between A and C
    const angleB = Math.atan2(B.y-cy, B.x-cx);
    
    // Determine if the arc goes clockwise or counterclockwise
    let isOnArc = false;
    if (start < end) {
      isOnArc = (start < angleB && angleB < end);
    } else {
      isOnArc = (start < angleB || angleB < end);
    }
    
    if (isOnArc) {
      arcs.push({ cx, cy, r, start, end });
      arcsFitted++;
    }
  }
  
  logger.debug(`Arc fitting statistics: ${arcsFitted} arcs fitted, ${skippedCollinear} skipped (collinear), ${skippedRadiusLimit} skipped (radius limits)`);
  logger.info(`Arc fitting completed. Generated ${arcs.length} arcs.`);
  
  return arcs;
}

/**
 * Creates a THREE.Line or LineSegments from arcs
 * @param {Array<{cx:number,cy:number,r:number,start:number,end:number}>} arcs
 * @param {Object} options - Rendering options
 * @param {number} [options.segments=32] - Segments per arc
 * @param {THREE.Material} [options.material] - Material to use
 * @returns {THREE.Object3D} Line segments or curve
 */
export function createArcObject(arcs, options = {}) {
  logger.info(`Creating arc object with ${arcs?.length || 0} arcs`);
  logger.debug(`Options: segments=${options.segments || 32}`);
  
  const segments = options.segments || 32;
  const material = options.material || new THREE.LineBasicMaterial({ color: 0xffffff });
  
  const points = [];
  
  arcs.forEach(arc => {
    let startAngle = arc.start;
    let endAngle = arc.end;
    
    // Ensure proper winding - always go counterclockwise
    if (endAngle < startAngle) {
      endAngle += Math.PI * 2;
    }
    
    // Generate points along the arc
    for (let i = 0; i <= segments; i++) {
      const angle = startAngle + (endAngle - startAngle) * (i / segments);
      const x = arc.cx + arc.r * Math.cos(angle);
      const y = arc.cy + arc.r * Math.sin(angle);
      points.push(new THREE.Vector3(x, y, 0));
    }
  });
  
  logger.debug(`Generated ${points.length} points for arc visualization`);
  
  // Create geometry from points
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  logger.info('Arc object created successfully');
  
  return new THREE.Line(geometry, material);
}

/**
 * Three.js helper: build a LineSegments geometry from 2D contours
 * @param {Array<Array<{x:number,y:number}>>} contours
 * @param {Object} options - Additional options
 * @param {boolean} [options.close=false] - Whether to close each contour loop
 * @returns {THREE.BufferGeometry}
 */
export function buildLineSegments(contours, options = {}) {
  logger.info(`Building line segments from ${contours?.length || 0} contours`);
  
  const close = options.close !== undefined ? options.close : false;
  logger.debug(`Options: close=${close}`);
  
  // Convert contours to flat array of vertices
  let verts = [];
  
  contours.forEach((loop, idx) => {
    if (loop.length < 2) {
      logger.debug(`Skipping contour #${idx} with insufficient points (${loop.length})`);
      return;
    }
    
    const startingVertCount = verts.length / 3;
    
    // Add line segments between consecutive points
    for (let i = 0; i < loop.length - 1; i++) {
      verts.push(loop[i].x, loop[i].y, 0);
      verts.push(loop[i+1].x, loop[i+1].y, 0);
    }
    
    // Optionally close the loop
    if (close && loop.length > 2) {
      verts.push(loop[loop.length-1].x, loop[loop.length-1].y, 0);
      verts.push(loop[0].x, loop[0].y, 0);
    }
    
    logger.debug(`Contour #${idx}: Added ${(verts.length/3 - startingVertCount)/2} line segments`);
  });
  
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  
  logger.info(`Line segments built successfully with ${verts.length/3} vertices (${verts.length/6} segments)`);
  return geometry;
}

/**
 * Creates a filled mesh from 2D contours using triangulation
 * @param {Array<Array<{x:number,y:number}>>} contours
 * @returns {THREE.Mesh} Triangulated mesh
 */
export function createContourMesh(contours) {
  logger.info(`Creating contour mesh from ${contours?.length || 0} contours`);
  
  // Flatten all contours into a single list of points
  const allPoints = [];
  contours.forEach((loop, idx) => {
    logger.debug(`Contour #${idx}: ${loop.length} points`);
    allPoints.push(...loop);
  });
  
  logger.debug(`Total points for triangulation: ${allPoints.length}`);
  
  // If we have enough points, triangulate
  if (allPoints.length >= 3) {
    logger.debug('Creating Delaunay geometry from contour points');
    const geometry = createDelaunayGeometry(allPoints);
    
    logger.info('Contour mesh created successfully');
    return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ 
      color: 0x3366ff,
      side: THREE.DoubleSide
    }));
  }
  
  // Fallback for insufficient points
  logger.warn('Insufficient points for triangulation, creating empty mesh');
  return new THREE.Mesh(
    new THREE.PlaneGeometry(0, 0),
    new THREE.MeshBasicMaterial()
  );
}

/**
 * Create a 3D mesh from a SchurComposition or other SDF primitive
 * @param {Object} sdfObject - Object with computeSDF method
 * @param {Array<number>} bounds - Bounds [xmin,ymin,zmin,xmax,ymax,zmax]
 * @param {Object} options - Additional options
 * @param {number} [options.resolution=32] - Grid resolution
 * @param {boolean} [options.wireframe=false] - Show wireframe
 * @param {number} [options.isoLevel=0] - Isosurface level
 * @returns {THREE.Mesh} 3D mesh representing the isosurface
 */
export function createSDFMesh(sdfObject, bounds, options = {}) {
  logger.info('Creating SDF mesh');
  logger.debug(`Bounds: [${bounds.join(', ')}]`);
  logger.debug(`Options: ${JSON.stringify(options)}`);
  
  const resolution = options.resolution || 32;
  const wireframe = options.wireframe !== undefined ? options.wireframe : false;
  const isoLevel = options.isoLevel !== undefined ? options.isoLevel : 0;
  
  // Create SDF function wrapper
  const sdfFn = (pt) => {
    // Use the object's computeSDF method
    if (sdfObject && typeof sdfObject.computeSDF === 'function') {
      return sdfObject.computeSDF(pt);
    }
    // Or use a direct function
    else if (typeof sdfObject === 'function') {
      return sdfObject(pt);
    }
    
    return Infinity;
  };
  
  // Generate 3D mesh
  logger.debug(`Generating 3D mesh with resolution: ${resolution}, isoLevel: ${isoLevel}`);
  const mesh = marchingCubes(sdfFn, bounds, resolution, { isoLevel });
  
  // Configure material
  if (mesh instanceof THREE.Mesh) {
    mesh.material.wireframe = wireframe;
    mesh.material.flatShading = true;
    
    // If the SDF object has a color, use it
    if (sdfObject && sdfObject.color) {
      logger.debug('Applying SDF object color to mesh');
      mesh.material.color = new THREE.Color(
        sdfObject.color.r || 0.5,
        sdfObject.color.g || 0.5,
        sdfObject.color.b || 0.5
      );
    }
  }
  
  logger.info('SDF mesh created successfully');
  return mesh;
}

/**
 * Create a 2D visualization of an SDF function
 * @param {Object} sdfObject - Object with computeSDF method
 * @param {Array<number>} bounds - [xmin,ymin,xmax,ymax]
 * @param {Object} options - Additional options
 * @param {number} [options.resolution=100] - Grid resolution
 * @param {boolean} [options.fill=true] - Create filled region
 * @param {boolean} [options.outline=true] - Create outline
 * @returns {THREE.Group} Group containing visualizations
 */
export function visualizeSDFContours(sdfObject, bounds, options = {}) {
  logger.info('Visualizing SDF contours');
  logger.debug(`Bounds: [${bounds.join(', ')}]`);
  logger.debug(`Options: ${JSON.stringify(options)}`);
  
  const resolution = options.resolution || 100;
  const fill = options.fill !== undefined ? options.fill : true;
  const outline = options.outline !== undefined ? options.outline : true;
  
  // Create SDF function wrapper
  const sdfFn = (pt) => {
    // Use the object's computeSDF method
    if (sdfObject && typeof sdfObject.computeSDF === 'function') {
      return sdfObject.computeSDF(pt);
    }
    // Or use a direct function
    else if (typeof sdfObject === 'function') {
      return sdfObject(pt);
    }
    
    return Infinity;
  };
  
  // Extract contours
  logger.debug(`Extracting contours with resolution: ${resolution}`);
  const contours = marchingSquares(sdfFn, bounds, resolution);
  
  // Create group to hold all visualizations
  const group = new THREE.Group();
  
  // Add filled mesh if requested
  if (fill && contours.length > 0) {
    logger.debug('Creating filled mesh from contours');
    const mesh = createContourMesh(contours);
    group.add(mesh);
  }
  
  // Add outline if requested
  if (outline && contours.length > 0) {
    logger.debug('Creating outline from contours');
    const lineGeometry = buildLineSegments(contours, { close: true });
    const lineMaterial = new THREE.LineBasicMaterial({ 
      color: 0xffffff,
      linewidth: 1
    });
    const lines = new THREE.LineSegments(lineGeometry, lineMaterial);
    group.add(lines);
  }
  
  logger.info(`SDF visualization created with ${contours.length} contours`);
  return group;
}