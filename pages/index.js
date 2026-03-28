import { useState, useRef, useEffect } from "react";

const SPORTS = ["NBA", "NFL", "MLB", "NHL", "WNBA"];
const wrap = { maxWidth: 440, margin: "0 auto", padding: "1rem", fontFamily: "sans-serif", minHeight: "100vh", background: "#0f172a" };
const inputStyle = { width: "100%", padding: "12px 14px", fontSize: 14, border: "none", borderRadius: 10, outline: "none", background: "#1e293b", color: "white", boxSizing: "border-box" };
const btn = { padding: "12px 20px", fontSize: 14, fontWeight: 800, borderRadius: 10, border: "none", background: "#2563eb", color: "white", cursor: "pointer" };
const btnSec = { padding: "12px 20px", fontSize: 14, fontWeight: 600, borderRadius: 10, border: "1px solid #334155", background: "transparent", color: "#94a3b8", cursor: "pointer" };

export default function App() {
  const [page, setPage] = useState("register");
  const [nameInput, setNameInput] = useState("");
  const [phoneInput, setPhoneInput] = useState("");
  const [user, setUser] = useState(null);
  const [sport, setSport] = useState("NBA");
  const [player, setPlayer] = useState(null);
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [guessesLeft, setGuessesLeft] = useState(2);
  const [timeLeft, setTimeLeft] = useState(60);
  const [guess, setGuess] = useState("");
  const [feedback, setFeedback] = useState(null);
  const [loading, setLoading] = useState(false);
  const [leaderboard, setLeaderboard] = useState([]);
  const [done, setDone] = useState(false);
  const [loadErr, setLoadErr] = useState("");
  const timerRef = useRef(null);
  const inputRef = useRef(null);
  const scoreRef = useRef(0);

  useEffect(() => {
    const saved = localStorage.getItem("wai-user");
    if (saved) {
      const u = JSON.parse(saved);
      setUser(u);
      const today = new Date().toISOString().split("T")[0];
      const played = localStorage.getItem("wai-played-" + today);
      if (played) {
        const result = JSON.parse(played);
        setScore(result.score);
        setSport(result.sport);
        setPage("already-played");
      } else {
        setPage("home");
      }
    }
  }, []);

  useEffect(() => {
    if (page !== "game" || done) return;
    clearInterval(timerRef.current);
    setTimeLeft(60);
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { clearInterval(timerRef.current); triggerGameOver(); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [idx, page]);

  function triggerGameOver() {
    clearInterval(timerRef.current);
    setDone(true);
    saveScore(scoreRef.current);
  }

  async function saveScore(finalScore) {
    if (!user) return;
    const today = new Date().toISOString().split("T")[0];
    localStorage.setItem("wai-played-" + today, JSON.stringify({ score: finalScore, sport }));
    try {
      await fetch("/api/leaderboard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: user.name, phone: user.phone, score: finalScore, sport }),
      });
      const lb = await fetch("/api/leaderboard?sport=" + sport).then(r => r.json());
      setLeaderboard(lb);
    } catch (e) { console.error(e); }
    setTimeout(() => setPage("gameover"), 500);
  }

  async function fetchLeaderboard() {
    try {
      const lb = await fetch("/api/leaderboard?sport=" + sport).then(r => r.json());
      setLeaderboard(lb);
    } catch (e) { console.error(e); }
  }

  async function loadPlayer(playerIdx) {
    setLoadErr("");
    setLoading(true);
    try {
      const res = await fetch(`/api/daily?sport=${sport}&index=${playerIdx}`);
      const data = await res.json();
      if (!data.player) throw new Error("No player found");
      setPlayer(data.player);
      setGuessesLeft(2);
      setGuess("");
      setFeedback(null);
      setPage("game");
      setTimeout(() => inputRef.current?.focus(), 100);
    } catch (e) {
      setLoadErr("Failed to load player: " + e.message);
    }
    setLoading(false);
  }

  async function startGame() {
    setLoading(true);
    setScore(0); scoreRef.current = 0;
    setIdx(0);
    setDone(false);
    setPage("loading");
    await loadPlayer(0);
  }

  function submitGuess() {
    if (!guess.trim() || !player || done || feedback) return;
    const name = player.name.toLowerCase();
    const g = guess.toLowerCase().trim();
    const correct = g === name || name.includes(g) ||
      (g.length > 3 && name.split(" ").some(part => part.length > 3 && g.includes(part)));
    setGuess("");
    if (correct) {
      clearInterval(timerRef.current);
      const newScore = score + 1;
      setScore(newScore); scoreRef.current = newScore;
      setFeedback({ text: "✓ Correct!", color: "#4ade80" });
      setTimeout(async () => {
        setFeedback(null);
        const nextIdx = idx + 1;
        setIdx(nextIdx);
        setPage("loading");
        await loadPlayer(nextIdx);
      }, 800);
    } else {
      const left = guessesLeft - 1;
      setGuessesLeft(left);
      if (left <= 0) {
        setFeedback({ text: `✗ It was ${player.name}`, color: "#f87171" });
        setTimeout(() => triggerGameOver(), 1500);
      } else {
        setFeedback({ text: "✗ Wrong — one more try!", color: "#fbbf24" });
        setTimeout(() => { setFeedback(null); inputRef.current?.focus(); }, 900);
      }
    }
  }

  function register() {
    if (!nameInput.trim() || !phoneInput.trim()) return;
    const u = { name: nameInput.trim(), phone: phoneInput.trim() };
    setUser(u);
    localStorage.setItem("wai-user", JSON.stringify(u));
    setPage("home");
  }

  function factsText(p) {
    if (!p) return {};
    const school = p.school ? p.school + (p.schoolGradYear ? " · " + p.schoolGradYear : "") : "Not listed";
    const draft = p.draftYear ? `${p.draftYear} · Rd ${p.draftRound || "?"} Pick ${p.draftPick || "?"} · ${p.draftTeam || "?"}` : "Undrafted / Signed";
    const teams = (p.teams || []).map(t => `${t.team} (${t.startYear || "?"}–${t.endYear || "present"})`).join(", ");
    const nums = (p.jerseyNumbers || []).map(n => "#" + n).join(", ") || "N/A";
    const acc = (p.accolades || []).join(" · ") || "None listed";
    return { school, draft, teams, nums, acc };
  }

  const timerColor = timeLeft > 30 ? "#4ade80" : timeLeft > 10 ? "#fbbf24" : "#f87171";

  // ALREADY PLAYED
  if (page === "already-played") {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const hoursLeft = Math.ceil((tomorrow - new Date()) / 3600000);
    return (
      <div style={wrap}>
        <div style={{ textAlign: "center", paddingTop: "3rem", marginBottom: 24 }}>
          <div style={{ fontSize: 52, marginBottom: 10 }}>✅</div>
          <div style={{ color: "white", fontSize: 24, fontWeight: 800, marginBottom: 4 }}>Already played today!</div>
          <div style={{ color: "#64748b", fontSize: 14 }}>Come back in {hoursLeft} hour{hoursLeft !== 1 ? "s" : ""}</div>
        </div>
        <div style={{ background: "#1e293b", borderRadius: 16, padding: 20, marginBottom: 16, textAlign: "center" }}>
          <div style={{ color: "#64748b", fontSize: 12, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Today's score</div>
          <div style={{ color: "#4ade80", fontSize: 60, fontWeight: 800, lineHeight: 1 }}>{score}</div>
          <div style={{ color: "#64748b", fontSize: 14, marginTop: 6 }}>{sport} players identified</div>
        </div>
        <button onClick={() => { fetchLeaderboard(); setPage("leaderboard"); }} style={{ ...btn, width: "100%", marginBottom: 8 }}>View Leaderboard</button>
        <button onClick={() => setPage("home")} style={{ ...btnSec, width: "100%" }}>Change Sport</button>
      </div>
    );
  }

  // REGISTER
  if (page === "register") return (
    <div style={wrap}>
      <div style={{ textAlign: "center", paddingTop: "3rem", marginBottom: 32 }}>
        <div style={{ fontSize: 52 }}>🏆</div>
        <div style={{ color: "white", fontSize: 26, fontWeight: 800, margin: "8px 0 4px" }}>Who Am I?</div>
        <div style={{ color: "#64748b", fontSize: 13 }}>Daily sports trivia · 60 sec · 2 guesses</div>
      </div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ color: "#94a3b8", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Your name</div>
        <input value={nameInput} onChange={e => setNameInput(e.target.value)} onKeyDown={e => e.key === "Enter" && register()} placeholder="John Smith" style={inputStyle} />
      </div>
      <div style={{ marginBottom: 28 }}>
        <div style={{ color: "#94a3b8", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Phone number</div>
        <input value={phoneInput} onChange={e => setPhoneInput(e.target.value)} onKeyDown={e => e.key === "Enter" && register()} placeholder="(555) 123-4567" type="tel" style={inputStyle} />
        <div style={{ color: "#475569", fontSize: 11, marginTop: 6 }}>Only last 4 digits stored · used to track your score</div>
      </div>
      <button onClick={register} disabled={!nameInput.trim() || !phoneInput.trim()} style={{ ...btn, width: "100%", opacity: nameInput && phoneInput ? 1 : 0.4 }}>
        Let's Play →
      </button>
    </div>
  );

  // HOME
  if (page === "home") return (
    <div style={wrap}>
      <div style={{ textAlign: "center", paddingTop: "2rem", marginBottom: 24 }}>
        <div style={{ fontSize: 44 }}>🏆</div>
        <div style={{ color: "white", fontSize: 24, fontWeight: 800, margin: "8px 0 4px" }}>Who Am I?</div>
        <div style={{ color: "#64748b", fontSize: 13 }}>Hey {user?.name}! Ready for today's challenge?</div>
        <div style={{ color: "#475569", fontSize: 12, marginTop: 4 }}>{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</div>
      </div>
      <div style={{ color: "#94a3b8", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Pick a sport</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {SPORTS.map(s => (
          <button key={s} onClick={() => setSport(s)} style={{ flex: 1, padding: "12px 4px", borderRadius: 12, border: sport === s ? "2px solid #3b82f6" : "2px solid #1e293b", background: sport === s ? "#1e3a8a" : "#1e293b", color: sport === s ? "#93c5fd" : "#94a3b8", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
            {s === "NBA" ? "🏀" : s === "NFL" ? "🏈" : s === "MLB" ? "⚾" : s === "NHL" ? "🏒" : "🏀"}<br />{s}
          </button>
        ))}
      </div>
      <div style={{ background: "#1e293b", borderRadius: 12, padding: 14, marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 16, fontSize: 13, color: "#94a3b8" }}>
          <span>⏱ 60 seconds per player</span>
          <span>🎯 2 guesses max</span>
          <span>💀 Wrong = game over</span>
        </div>
      </div>
      <button onClick={startGame} disabled={loading} style={{ ...btn, width: "100%", marginBottom: 10, opacity: loading ? 0.7 : 1 }}>
        {loading ? "Loading…" : `Start Today's ${sport} Challenge →`}
      </button>
      <button onClick={() => { fetchLeaderboard(); setPage("leaderboard"); }} style={{ ...btnSec, width: "100%" }}>View Leaderboard</button>
      <button onClick={() => { setUser(null); localStorage.removeItem("wai-user"); setPage("register"); }} style={{ ...btnSec, width: "100%", marginTop: 8, fontSize: 12, padding: "8px" }}>Switch account</button>
    </div>
  );

  // LOADING
  if (page === "loading") return (
    <div style={{ ...wrap, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
        <div style={{ color: "white", fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Loading player {idx + 1}…</div>
        {loadErr && <>
          <div style={{ color: "#f87171", fontSize: 13, marginTop: 16, marginBottom: 12 }}>{loadErr}</div>
          <button onClick={() => loadPlayer(idx)} style={{ ...btn }}>Try again</button>
        </>}
      </div>
    </div>
  );

  // GAME
  if (page === "game" && player) {
    const f = factsText(player);
    return (
      <div style={wrap}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ background: "#1e40af", color: "#93c5fd", fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 6 }}>{sport}</span>
            <span style={{ color: "#64748b", fontSize: 13 }}>Player #{idx + 1}</span>
          </div>
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            <span style={{ color: "#4ade80", fontSize: 14, fontWeight: 700 }}>✓ {score}</span>
            <span style={{ color: timerColor, fontSize: 24, fontWeight: 800 }}>{timeLeft}s</span>
          </div>
        </div>

        <div style={{ height: 5, background: "#1e293b", borderRadius: 99, overflow: "hidden", marginBottom: 14 }}>
          <div style={{ height: "100%", width: (timeLeft / 60 * 100) + "%", background: timerColor, borderRadius: 99, transition: "width 1s linear, background 0.3s" }} />
        </div>

        <div style={{ display: "flex", gap: 6, marginBottom: 14, alignItems: "center" }}>
          {[0, 1].map(i => (
            <div key={i} style={{ width: 40, height: 10, borderRadius: 99, background: i < guessesLeft ? "#3b82f6" : "#1e293b" }} />
          ))}
          <span style={{ color: guessesLeft === 2 ? "#475569" : "#fbbf24", fontSize: 12, marginLeft: 6 }}>
            {guessesLeft === 2 ? "2 guesses left" : "⚠️ Last guess!"}
          </span>
        </div>

        <div style={{ background: "#1e293b", borderRadius: 16, padding: 16, marginBottom: 14 }}>
          <div style={{ display: "flex", gap: 12, marginBottom: 14, paddingBottom: 14, borderBottom: "1px solid #334155" }}>
            <div style={{ width: 52, height: 52, borderRadius: 12, background: "#0f172a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, flexShrink: 0 }}>?</div>
            <div style={{ flex: 1, paddingTop: 4 }}>
              <div style={{ color: "#475569", fontWeight: 700, fontSize: 14, letterSpacing: 3, marginBottom: 4 }}>? ? ? ? ? ? ?</div>
              <div style={{ color: "#64748b", fontSize: 12 }}>{player.position}</div>
            </div>
          </div>
          {[["🎓", "School", f.school], ["📋", "Draft", f.draft], ["🏟️", "Teams", f.teams], ["👕", "Jersey #", f.nums], ["🏅", "Accolades", f.acc]].map(([icon, label, val]) => (
            <div key={label} style={{ display: "flex", gap: 10, marginBottom: 10 }}>
              <span style={{ width: 18, fontSize: 13, marginTop: 14, flexShrink: 0 }}>{icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: "#475569", textTransform: "uppercase", letterSpacing: .5, marginBottom: 2 }}>{label}</div>
                <div style={{ fontSize: 13, color: "#94a3b8" }}>{val}</div>
              </div>
            </div>
          ))}
        </div>

        {feedback && (
          <div style={{ textAlign: "center", padding: 12, marginBottom: 10, borderRadius: 10, background: "#1e293b", color: feedback.color, fontSize: 16, fontWeight: 800 }}>
            {feedback.text}
          </div>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <input ref={inputRef} value={guess} onChange={e => setGuess(e.target.value)} onKeyDown={e => e.key === "Enter" && submitGuess()} placeholder="Type player's full name…" disabled={done || !!feedback} style={{ flex: 1, padding: "12px 14px", fontSize: 14, border: "none", borderRadius: 10, outline: "none", background: "#1e293b", color: "white" }} autoFocus />
          <button onClick={submitGuess} disabled={!guess.trim() || done || !!feedback} style={{ ...btn, opacity: guess.trim() && !done && !feedback ? 1 : 0.4 }}>→</button>
        </div>
      </div>
    );
  }

  // GAMEOVER
  if (page === "gameover") {
    const myRank = leaderboard.findIndex(e => e.name === user?.name) + 1;
    return (
      <div style={wrap}>
        <div style={{ textAlign: "center", paddingTop: "2rem", marginBottom: 20 }}>
          <div style={{ fontSize: 52, marginBottom: 10 }}>{score >= 20 ? "🔥" : score >= 10 ? "🎉" : score >= 5 ? "👏" : "😅"}</div>
          <div style={{ color: "white", fontSize: 24, fontWeight: 800, marginBottom: 4 }}>Game Over!</div>
          <div style={{ color: "#64748b", fontSize: 14 }}>{sport} · {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric" })}</div>
        </div>
        <div style={{ background: "#1e293b", borderRadius: 16, padding: 20, marginBottom: 16, textAlign: "center" }}>
          <div style={{ color: "#64748b", fontSize: 12, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Your score</div>
          <div style={{ color: "#4ade80", fontSize: 60, fontWeight: 800, lineHeight: 1 }}>{score}</div>
          <div style={{ color: "#64748b", fontSize: 14, marginTop: 6 }}>players identified</div>
          {myRank > 0 && <div style={{ color: "#fbbf24", fontSize: 14, marginTop: 10, fontWeight: 700 }}>#{myRank} on today's leaderboard!</div>}
          <div style={{ color: "#475569", fontSize: 12, marginTop: 8 }}>Come back tomorrow for a new challenge 🏆</div>
        </div>
        {leaderboard.length > 0 && (
          <div style={{ background: "#1e293b", borderRadius: 16, padding: 16, marginBottom: 16 }}>
            <div style={{ color: "#94a3b8", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Today's Top 5</div>
            {leaderboard.slice(0, 5).map((e, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: i < 4 ? "1px solid #334155" : "none" }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <span style={{ color: i === 0 ? "#fbbf24" : i === 1 ? "#94a3b8" : i === 2 ? "#fb923c" : "#475569", fontWeight: 800, width: 24 }}>#{i + 1}</span>
                  <span style={{ color: e.name === user?.name ? "#93c5fd" : "white", fontWeight: e.name === user?.name ? 700 : 400 }}>{e.name}</span>
                </div>
                <span style={{ color: "#4ade80", fontSize: 18, fontWeight: 800 }}>{e.score}</span>
              </div>
            ))}
          </div>
        )}
        <button onClick={() => { fetchLeaderboard(); setPage("leaderboard"); }} style={{ ...btn, width: "100%", marginBottom: 8 }}>Full Leaderboard</button>
        <button onClick={() => setPage("home")} style={{ ...btnSec, width: "100%" }}>Home</button>
      </div>
    );
  }

  // LEADERBOARD
  if (page === "leaderboard") return (
    <div style={wrap}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, paddingTop: "1rem" }}>
        <button onClick={() => setPage(user ? "home" : "register")} style={{ ...btnSec, padding: "6px 12px", fontSize: 13 }}>← Back</button>
        <div>
          <div style={{ color: "white", fontSize: 20, fontWeight: 800 }}>Today's Leaderboard</div>
          <div style={{ color: "#64748b", fontSize: 12 }}>{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} · {sport}</div>
        </div>
      </div>
      {leaderboard.length === 0
        ? <div style={{ textAlign: "center", color: "#475569", padding: "3rem 0", fontSize: 14 }}>No scores yet — be the first!</div>
        : leaderboard.map((e, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: e.name === user?.name ? "#1e3a5f" : "#1e293b", borderRadius: 12, padding: "12px 16px", marginBottom: 8, border: e.name === user?.name ? "1px solid #3b82f6" : "none" }}>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <span style={{ color: i === 0 ? "#fbbf24" : i === 1 ? "#94a3b8" : i === 2 ? "#fb923c" : "#475569", fontWeight: 800, fontSize: 16, width: 28 }}>#{i + 1}</span>
              <div style={{ color: "white", fontSize: 14, fontWeight: 600 }}>{e.name}</div>
            </div>
            <span style={{ color: "#4ade80", fontSize: 22, fontWeight: 800 }}>{e.score}</span>
          </div>
        ))
      }
    </div>
  );

  return null;
}
