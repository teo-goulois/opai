import type { SVGProps } from "react";

/** What every icon takes: the props of an svg element. */
export type IconProps = Omit<SVGProps<SVGSVGElement>, "ref">;
