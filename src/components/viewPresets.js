/** Camera presets for Canvas3D. Kept free of three.js so the workbench shell can import it before the 3D chunk loads. */
export const VIEW_PRESETS = Object.freeze({
  iso: { label: 'ISO', position: [3.9, 1.55, 4.3], target: [0, 0, 1.45] },
  front: { label: 'FRONT', position: [0, 0.18, 6.4], target: [0, 0, 0.6] },
  side: { label: 'SIDE', position: [5.6, 0.35, 1.3], target: [0, 0, 1.3] },
  top: { label: 'TOP', position: [0, 6.8, 1.9], target: [0, 0, 1.3] },
  track: { label: 'TRACK', offset: [1.1, 0.65, 1.55] },
})
