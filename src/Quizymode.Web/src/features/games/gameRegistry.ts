export interface GameInfo {
  id: string;
  name: string;
  blurb: string;
}

export const MATCH_RACE_ID = "match-race";

export const GAMES: readonly GameInfo[] = [
  { id: MATCH_RACE_ID, name: "Match Race", blurb: "Match each question to its answer." },
];
