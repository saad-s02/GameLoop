import { loadShowcaseGame } from "@/lib/data/showcaseGame";
import { loadRealNearby } from "@/lib/data/realNearby";
import PlanWorkspace from "./PlanWorkspace";

// Matches the "tonight" showcase game hardcoded in Task 9's loadPlannerInput.
const DEMO_GAME_ID = "2025030413";

export default function PlanPage() {
  const g = loadShowcaseGame(DEMO_GAME_ID);
  const eyebrow = {
    matchup: `${g.homeTeam.commonName} versus ${g.awayTeam.commonName}`,
    puckDropAt: g.puckDropAt,
    source: g.source,
  };
  return <PlanWorkspace eyebrow={eyebrow} realNearby={loadRealNearby()} />;
}
