import { Redis } from "@upstash/redis";
const kv = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const getToday = () => new Date().toISOString().split("T")[0];

export default async function handler(req, res) {
  const today = getToday();

  if (req.method === "GET") {
    const { sport = "NBA" } = req.query;
    const key = `leaderboard-${today}-${sport}`;
    try {
      const board = (await kv.get(key)) || [];
      res.status(200).json(board);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }

  } else if (req.method === "POST") {
    const { name, phone, score, sport = "NBA" } = req.body;
    const key = `leaderboard-${today}-${sport}`;
    const phoneKey = String(phone).replace(/\D/g, "").slice(-4);
    try {
      const board = (await kv.get(key)) || [];
      const existing = board.findIndex(e => e.phoneKey === phoneKey);
      const entry = { name, phoneKey, score, sport };
      if (existing >= 0) {
        if (score > board[existing].score) board[existing] = entry;
      } else {
        board.push(entry);
      }
      board.sort((a, b) => b.score - a.score);
      await kv.set(key, board.slice(0, 500), { ex: 90000 });
      res.status(200).json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }

  } else {
    res.status(405).end();
  }
}
