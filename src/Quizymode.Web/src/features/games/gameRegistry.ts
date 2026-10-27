import type { ComponentType, SVGProps } from "react";
import { ArrowsRightLeftIcon, BoltIcon, HeartIcon } from "@heroicons/react/24/outline";

export interface GameInfo {
  id: string;
  name: string;
  blurb: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}

export const MATCH_RACE_ID = "match-race";
export const SWIPE_BLITZ_ID = "swipe-blitz";
export const SURVIVAL_ID = "survival";

export const GAMES: readonly GameInfo[] = [
  { id: MATCH_RACE_ID, name: "Match Race", blurb: "Match each question to its answer.", icon: BoltIcon },
  { id: SWIPE_BLITZ_ID, name: "Swipe Blitz", blurb: "Right or wrong? Beat the clock.", icon: ArrowsRightLeftIcon },
  { id: SURVIVAL_ID, name: "Survival", blurb: "Answer until you miss 3.", icon: HeartIcon },
];
