export interface ViewerSettings {
  cutaway: boolean;
  cutPosition: number;
  shellVisible: boolean;
  glassVisible: boolean;
  starsVisible: boolean;
  glassOpacity: number;
  starIntensity: number;
  autoRotate: boolean;
  showGrid: boolean;
  quality: 'auto' | 'high' | 'low';
}

export type ViewPreset = 'perspective' | 'front' | 'top' | 'inside';

export interface SceneStats {
  fps: number;
  blockCount: number;
  starCount: number;
  drawCalls: number;
  triangles: number;
  ready: boolean;
}

export const defaultSettings: ViewerSettings = {
  cutaway: true,
  cutPosition: -0.06,
  shellVisible: true,
  glassVisible: true,
  starsVisible: true,
  glassOpacity: 0.12,
  starIntensity: 1,
  autoRotate: false,
  showGrid: true,
  quality: 'auto',
};

export const construction = {
  outerDiameter: 196,
  shellThickness: 1,
  platformWidth: 112,
  floorHeight: 16,
  floorCount: 5,
  technicalHeight: 5,
  technicalCount: 4,
  totalHeight: 102,
  slabCenters: [-50.5, -33.5, -29.5, -12.5, -8.5, 8.5, 12.5, 29.5, 33.5, 50.5],
  workingRanges: [[-50, -34], [-29, -13], [-8, 8], [13, 29], [34, 50]],
  technicalRanges: [[-34, -29], [-13, -8], [8, 13], [29, 34]],
} as const;
