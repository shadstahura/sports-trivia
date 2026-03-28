import { Redis } from "@upstash/redis";
const kv = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const getToday = () => new Date().toISOString().split("T")[0];

function getTierPrompt(sport, index) {
  if (index < 4) return `Pick 1 all-time ${sport} legend — hall of famer, multiple champion, universally recognized as one of the greatest ever. Think LeBron James, Michael Jordan, Tom Brady, Wayne Gretzky, Babe Ruth tier. Any sports fan alive knows this person. Be random within this elite group.`;
  if (index < 14) return `Pick 1 ${sport} star from 2015 to present who is a starter or key contributor — active or recently active player. A well-known name that any current sports fan would recognize. Think All-Stars, franchise players, guys fans see on TV regularly today. Mix of positions. No legends — just current stars.`;
  if (index < 29) return `Pick 1 ${sport} player from 2000–2015. 60% of the time pick a starter (someone who started most games, 8+ year career, real fans know well). 40% of the time pick a role player (came off bench, specialist, known by dedicated fans but not casual ones). Be random on which type you pick. All players must have played primarily between 2000 and 2015.`;
  if (index < 44) return `Pick 1 ${sport} role player or bench player from anywhere between 2000 and present day. Could be currently active or retired as recently as 2024. Think backup point guards, defensive specialists, 6th men, end-of-bench contributors. Known inside the league and by hardcore fans but not casual fans. Random era between 2000-2024.`;
  if (index < 59) return `Pick 1 ${sport} player from 1990–2000 — mix of starters and role players. Some should be well-known stars from that era that older fans remember fondly. Others should be solid role players from that decade. All must have played primarily in the 1990s. Vary between famous and obscure within this era.`;
  return `Pick 1 ${sport} player from before 1990 — getting progressively older and more obscure as the index gets higher. Early picks can be legends from the 1970s-80s. Later picks should be very obscure players from the 1960s-1970s that only true historians would know. Be random and vary the era within pre-1990.`;
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
      model: "claude-sonnet-4-6",
      max_tokens: 800,
      system: `You are a sports trivia expert with perfect recall. CRITICAL RULES:
1. Only include facts you are 100% certain about — no guessing ever
2. If you are not sure about a draft pick number, school, grad year, or specific stat — set it to null
3. Jersey numbers: only include numbers you are completely certain the player wore
4. Teams: only include teams you are certain they played for, with correct years
5. Accolades: only list awards you are 100% sure they won — no approximations
6. Return valid JSON only — no markdown, no explanation`,
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
  const playerKey = `player-v8-${sport}-${today}-${playerIndex}`;
  const namesKey = `names-v8-${sport}-${today}`;

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
