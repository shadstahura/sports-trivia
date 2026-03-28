import { Redis } from "@upstash/redis";
const kv = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const getToday = () => new Date().toISOString().split("T")[0];

function getTierPrompt(sport, index) {
  if (index < 3) return `Pick 1 well-known ${sport} star — someone real fans know well but NOT the most obvious household names. NOT LeBron, Jordan, Brady, Gretzky, Kobe or the top 5 most famous players. Think second-tier stars: multiple All-Stars, won something, had a great career, but requires some actual sports knowledge to know. Be random and vary eras.`;
  if (index < 10) return `Pick 1 solid ${sport} starter — had a 7-12 year career as a starter or key rotation player. Real dedicated fans would know them, casual fans probably wouldn't. May have made 1-2 All-Star games. Think good-not-great players who were important on playoff teams but not stars. Mix of eras and positions.`;
  if (index < 20) return `Pick 1 ${sport} role player — had a 5-9 year career coming off the bench or playing a specific role. Known by true fans of the sport but not widely famous. Think defensive specialists, backup point guards, key bench pieces on championship teams. Mix of current and recent players.`;
  if (index < 30) return `Pick 1 current or recent ${sport} depth player — on a roster in the last 3 years, plays limited minutes, a backup or end-of-bench player. Known inside the league but not by casual fans at all. Think 10th-12th man on a roster.`;
  if (index < 40) return `Pick 1 obscure ${sport} player from the 1980s or 1990s — a journeyman or backup who had a 4-8 year career but never started consistently. Only hardcore fans and historians would know them. True deep cut from that era.`;
  if (index < 50) return `Pick 1 extremely obscure ${sport} player — either from the 1960s-1970s that almost nobody remembers, OR had a very brief career of 1-3 seasons recently. Think undrafted players, 10-day contracts, under 100 games played total.`;
  return `Pick 1 impossibly obscure ${sport} player — from the 1950s-1960s, played only a handful of games, or an international player with a brief cup of coffee in the league. Even hardcore historians might struggle with this one.`;
}

async function generatePlayer(sport, index, excludeNames) {
  const tierPrompt = getTierPrompt(sport, index);
  const excludeStr = excludeNames.length > 0
    ? `Do NOT pick any of these already-used players: ${excludeNames.slice(-20).join(", ")}. `
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
      max_tokens: 800,
      system: `You are a sports trivia expert. Only include facts you are 100% certain about. If unsure about a stat, omit it. Return valid JSON only — no markdown, no explanation.`,
      messages: [{
        role: "user",
        content: `${tierPrompt} ${excludeStr}Be truly random. Return exactly 1 player as a raw JSON object:
{"name":"Full Name","position":"Position","school":"School or null","schoolGradYear":2005,"draftYear":2010,"draftRound":1,"draftPick":5,"draftTeam":"Team Name","teams":[{"team":"Team Name","startYear":2010,"endYear":2015}],"jerseyNumbers":["23"],"accolades":["2x All-Star"],"isActive":false,"isInternational":false,"isHallOfFame":false,"wonChampionship":false,"wonMVP":false,"wasAllStar":false}`
      }]
    }),
  });

  const data = await res.json();
  const text = data.content[0].text.trim().replace(/```json|```/g, "").trim();
  return JSON.parse(text);
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();
  const { sport = "NBA", index = "0" } = req.query;
  const today = getToday();
  const playerIndex = parseInt(index);
  const playerKey = `player-v5-${sport}-${today}-${playerIndex}`;
  const namesKey = `names-v5-${sport}-${today}`;

  try {
    // Check if this player is already cached
    let player = await kv.get(playerKey);

    if (!player) {
      // Get list of already-used names today
      const usedNames = (await kv.get(namesKey)) || [];

      // Generate a new player
      player = await generatePlayer(sport, playerIndex, usedNames);
      if (!player || !player.name) throw new Error("Invalid player data");

      // Cache this player and add name to used list
      await kv.set(playerKey, player, { ex: 90000 });
      usedNames.push(player.name);
      await kv.set(namesKey, usedNames, { ex: 90000 });
    }

    res.status(200).json({ player, playerNumber: playerIndex + 1 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
