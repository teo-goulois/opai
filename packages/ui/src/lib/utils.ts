import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// tailwind-merge has to know the theme's names (globals.css), or it reads
// `text-l` as a color and drops it next to `text-neutral-10`.
const steps = ["zero", "xxs", "xs", "s", "m", "l", "xl", "xxl"];

const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["xxs", "xs", "s", "m", "l", "xl", "xxl"],
      spacing: steps,
      radius: ["zero", "xs", "s", "m", "l", "xl", "full"],
      shadow: ["none", "s", "m", "l"],
      font: ["ui", "brand", "editorial", "data"],
      "font-weight": ["regular", "medium", "heavy"],
      tracking: ["xs", "s", "m", "l", "xl"],
      ease: ["small", "large"],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
