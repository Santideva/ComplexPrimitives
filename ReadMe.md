/src
├── /geometry
│ ├── Vertex.js // Defines a vertex: position & color
│ ├── Edge.js // Defines an edge: connection between two vertices using a distance mapping function
│ ├── Face.js // Defines a face: a collection of vertices (and optionally edges) that form a surface
│ └── ComplexShape2D.js // High-level 2D shape built from vertices, edges, and a face
│
├── /primitives
│ └── ComplexPrimitive2D.js // Base class for 2D primitives (holds common metric & color logic, transformation, SDF, etc.)
│
└── /utils
└── DistanceMapping.js // Registry and utility functions for remapping distances (e.g., polynomial mapping)

1. Vertex Module
   File: /src/geometry/Vertex.js

Purpose: Encapsulate a point's properties, such as its metric position and its color (using HSLA, for instance).

Interaction:

Used by edges (as endpoints) and faces (as defining corners).

Provides transformation methods to update its position.

2. Edge Module
   File: /src/geometry/Edge.js

Purpose: Represent the “connection” between two vertices. It uses a configurable distance mapping function (provided by the DistanceMapping module) to compute effective distances between vertices.

Interaction:

References two Vertex instances.

Its effective distance can be used in SDF computations for the overall shape.

3. Face Module
   File: /src/geometry/Face.js

Purpose: Represent a surface defined by a collection of vertices (and, if needed, edges).

Interaction:

Aggregates multiple vertices.

Provides methods to blend vertex attributes (e.g., average color) and to apply transformations to the entire face.

4. ComplexShape2D Module
   File: /src/geometry/ComplexShape2D.js

Purpose: A higher-level geometry primitive that extends the basic complex primitive functionality (from /primitives/ComplexPrimitive2D.js) by composing a collection of vertices, edges, and a face.

Interaction:

Inherits from ComplexPrimitive2D to get common behavior (transformation, SDF framework, color mapping).

Instantiates and manages its own vertices, edges, and face.

Implements its own SDF based on the modular components (e.g., by combining edge distances).

5. ComplexPrimitive2D (Base Class)
   File: /src/primitives/ComplexPrimitive2D.js

Purpose: The core blueprint for any 2D (or 3D, when extended) complex primitive. It defines the common properties (metric and color) and behavior (SDF evaluation, transformation, color mapping) that all shapes must obey.

Interaction:

Serves as the base for higher-level geometry like ComplexShape2D.

Uses a distance mapping function (from /utils/DistanceMapping.js) for metric remapping.

6. DistanceMapping Module
   File: /src/utils/DistanceMapping.js

Purpose: Provides different mapping functions (e.g., identity, polynomial, custom functions) that can be selected to modify how raw metric distances are interpreted.

Interaction:

Imported by ComplexPrimitive2D and possibly directly by the Edge module to compute effective distances between vertices.
