import type { ComponentType, SVGProps } from "react";
import { ArrowDownTrayIcon, ArrowsRightLeftIcon, BoltIcon, HeartIcon, Squares2X2Icon } from "@heroicons/react/24/outline";

export interface GameInfo {
  id: string;
  name: string;
  blurb: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}

export const MATCH_RACE_ID = "match-race";
export const SWIPE_BLITZ_ID = "swipe-blitz";
export const SURVIVAL_ID = "survival";
export const BUCKET_DROP_ID = "bucket-drop";
export const SORT_IT_ID = "sort-it";

export const GAMES: readonly GameInfo[] = [
  { id: MATCH_RACE_ID, name: "Match Race", blurb: "Match each question to its answer.", icon: BoltIcon },
  { id: SWIPE_BLITZ_ID, name: "Swipe Blitz", blurb: "Right or wrong? Beat the clock.", icon: ArrowsRightLeftIcon },
  { id: SURVIVAL_ID, name: "Survival", blurb: "Answer until you miss 3.", icon: HeartIcon },
  { id: BUCKET_DROP_ID, name: "Bucket Drop", blurb: "Catch the answer before it lands.", icon: ArrowDownTrayIcon },
  { id: SORT_IT_ID, name: "Sort It", blurb: "Sort each fact into its group.", icon: Squares2X2Icon },
];
