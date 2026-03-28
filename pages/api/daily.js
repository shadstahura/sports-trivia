import { kv } from "@vercel/kv";

const getToday = () => new Date().toISOString().split("T")[0];

const TIERS = [
  {
    count: 3,
    label: "tier1",
    prompt: (sport) => `Pick 3 random all-time ${sport} legends. These must be instantly recognizable to ANY fan — hall of famers, multiple champions, top-10 all-time players. Think LeBron James, Tom Brady, Wayne Gretzky level. Anyone with a pulse knows these players. Be random within this group.`
  },
  {
    count: 7,
    label: "tier2",
    prompt: (sport) => `Pick 7 random well-known ${sport} players. These are stars that real sports fans know well — multiple All-Star appearances, long careers, household names within the sport but not necessarily all-time legends. Think solid superstars like a 3-time All-Star who won a championship. Mix of eras. NOT hall of famers necessarily, but definitely stars.`
  },
  {
    count: 10,
    label: "tier3",
    prompt: (sport) => `Pick 10 random ${sport} players who were solid starters. These had 6-10 year careers as rotation players or starters. Real fans would recognize them but casual fans might not. They may have made 1 All-Star game. Think good-not-great players, guys who played important roles on playoff teams but weren't the stars. Mix of eras.`
  },
  {
    count: 10,
    label: "tier4",
    prompt: (sport) => `Pick 10 random current or recent ${sport} role players — guys on rosters in the last 3 years who come off the bench or play limited minutes. Defensive specialists, backup point guards, 8th-9th men on rosters. Known inside the league but most casual fans couldn't name them. Active or retired within last 5 years only.`
  },
  {
    count: 10,
    label: "tier5",
    prompt: (sport) => `Pick 10 random obscure ${sport} players from the 1980s–1990s. Players that only hardcore fans and historians would know — journeymen, backup players, guys who had 4-8 year careers but never started consistently. Not All-Stars, not stars, true deep cuts from that era.`
  },
  {
    count: 10,
    label: "tier6",
    prompt: (sport) => `Pick 10 random extremely obscure ${sport} players — either players from the 1960s–1970s that almost nobody remembers, OR players who had very brief careers of 1-3 seasons in recent years. Think undrafted players, 10-day contract guys, players who appeared in fewer than 100 games total. True trivia historians only.`
  },
  {
    count: 10,
    label: "tier7",
    prompt: (sport) => `Pick 10 random impossibly obscure ${sport} players. These should be players that even dedicated beat reporters might not remember — players from the 1950s–1960s, players who appeared in only a handful of games, international players who had brief cups of coffee in the league, or players known for one single moment or stat. Absolute deep cuts.`
  },
];

async function generateTier(sport, tier, excludeNames) {
  const excludeStr = excludeNames.length > 0
    ? `\n\nDo NOT pick any of these already-used players: ${excludeNames.join(", ")}.`
    : "";

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "anthropic-version": "2023-06-01",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 6000,
      system: `You are a sports trivia expert. Only include facts you are 100% certain about. If unsure about any specific stat, omit it rather than guess. Return valid JSON arrays only — no markdown, no explanation, no extra text.`,
      messages: [{
        role: "user",
        content: `${tier.prompt(sport)}${excludeStr}

Important: Be truly random — don't pick the same obvious players every time. Vary eras, positions, and nationalities.

Return exactly ${tier.count} players as a raw JSON array with no extra text:
[{
  "name": "Full Name",
  "position": "Position",
  "school": "School Name or null",
  "schoolGradYear": 2005,
  "draftYear": 2010,
  "draftRound": 1,
  "draftPick": 5,
  "draftTeam": "Team Name",
  "teams": [{"team": "Team Name", "startYear": 2010, "endYear": 2015}],
  "jerseyNumbers": ["23"],
  "accolades": ["2x All-Star", "1x Champion"],
  "isActive": false,
  "isInternational": false,
  "isHallOfFame": false,
  "wonChampionship": false,
  "wonMVP": false,
  "wasAllStar": false
}]`
      }]
    }),
  });

  const data = await res.json();
  const text = data.content[0].text.trim().replace(/```json|```/g, "").trim();
  const players = JSON.parse(text);
  return players.filter(p => p.name && !excludeNames.includes(p.name));
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();
  const { sport = "NBA", index = "0" } = req.query;
  const today = getToday();
  const masterKey = `daily-v3-${sport}-${today}`;

  try {
    let allPlayers = await kv.get(masterKey);

    if (!allPlayers) {
      allPlayers = [];
      const usedNames = [];

      for (const tier of TIERS) {
        try {
          const batch = await generateTier(sport, tier, usedNames);
          batch.forEach(p => {
            p._tier = tier.label;
            usedNames.push(p.name);
          });
          allPlayers = allPlayers.concat(batch);
        } catch (e) {
          console.error(`Tier ${tier.label} failed:`, e.message);
        }
      }

      await kv.set(masterKey, allPlayers, { ex: 90000 });
    }

    const playerIndex = parseInt(index);
    if (playerIndex >= 0 && playerIndex < allPlayers.length) {
      res.status(200).json({
        player: allPlayers[playerIndex],
        total: allPlayers.length,
        tier: allPlayers[playerIndex]._tier,
        playerNumber: playerIndex + 1
      });
    } else {
      res.status(404).json({ error: "No more players", total: allPlayers.length });
    }

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
