import { Redis } from "@upstash/redis";
const kv = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const getToday = () => new Date().toISOString().split("T")[0];

function getTierPrompt(sport, index) {
  if (index < 3) return `Pick 1 all-time ${sport} legend — a hall of famer, multiple champion, top-10 all-time player that ANY fan instantly recognizes. Think LeBron, Brady, Gretzky level. Be random, don't always pick the same player.`;
  if (index < 10) return `Pick 1 well-known ${sport} star — multiple All-Star appearances, long career, household name within the sport but not necessarily an all-time legend. A solid superstar fans know well. Mix of eras.`;
  if (index < 20) return `Pick 1 solid ${sport} starter — had a 6-10 year career as a rotation player or starter. Real fans recognize them but casual fans might not. May have made 1 All-Star game. Good-not-great player.`;
  if (index < 30) return `Pick 1 current or recent ${sport} role player — on a roster in the last 3 years, comes off the bench or plays limited minutes. A defensive specialist, backup, or depth piece. Known inside the league but not by casual fans.`;
  if (index < 40) return `Pick 1 obscure ${sport} player from the 1980s or 1990s — a journeyman or backup who had a 4-8 year career but never started consistently. Only hardcore fans would know them. True deep cut.`;
  if (index < 50) return `Pick 1 extremely obscure ${sport} player — either from the 1960s-1970s that almost nobody remembers, OR had a very brief career of 1-3 seasons recently. Think undrafted players, 10-day contracts, under 100 games played total.`;
  return `Pick 1 impossibly obscure ${sport} player — from the 1950s-1960s, played only a handful of games, or an international player with a brief cup of coffee in the league. Even hardcore historians might not know them.`;
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
  const playerKey = `player-v4-${sport}-${today}-${playerIndex}`;
  const namesKey = `names-v4-${sport}-${today}`;

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
