// Build the runtime from the repository's pinned npm dependencies.
// This replaces the standalone file's embedded runtime, not application code.
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import * as ThreeModule from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
const THREE = { ...ThreeModule, OrbitControls };
export { React, createRoot, THREE };
