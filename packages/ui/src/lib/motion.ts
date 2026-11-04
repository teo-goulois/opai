// The theme's motion for Motion (motion/react). CSS uses --motion-duration and
// --motion-easing from globals.css; keep both in step with GUI.md "Motion".
export const smallMotion = {
  type: "tween",
  duration: 0.15,
  ease: [0.2, 0.8, 0.2, 1],
} as const;

export const largeMotion = {
  type: "tween",
  duration: 0.3,
  ease: [0.16, 1, 0.3, 1],
} as const;
