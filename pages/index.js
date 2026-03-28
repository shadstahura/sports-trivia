import { useState, useRef, useEffect } from "react";

const MULTS = { easy: 1, intermediate: 1.5, hard: 2, expert: 3 };
const DIFF_LABELS = { easy: "Easy", intermediate: "Medium", hard: "Hard", expert: "Expert" };
const DIFF_COLORS = {
  easy: { bg: "#14532d", c: "#86efac" },
  intermediate: { bg: "#713f12", c: "#fde68a" },
  hard: { bg: "#7c2d12", c: "#fdba74" },
  expert: { bg: "#7f1d1d", c: "#fca5a5" },
};

async function callClaude(system, userMsg, maxTokens = 200) {
  const res = await fetch("/api/claude", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      system,
      messages: [{ role: "user", content: userMsg }],
      max_tokens: maxTokens,
    }),
  });
  const data = await res.json();
  return data.content[0].text.trim();
}

export default function App() {
  const [page, setPage] = useState("home");
  const [sport, setSport] = useState(null);
  const [streak, setStreak] = useState(0);
  const [score, setScore] = useState(0);
  const [player, setPlayer] = useState(null);
  const [guesses, setGuesses] = useState(10);
  const [mode, setMode] = useState("q");
  const [log, setLog] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [loadErr, setLoadErr] = useState("");
  const [usedNames, setUsedNames] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [best, setBest] = useState(0);
  const logRef = useRef();

  useEffect(() => {
    const b = parseInt(localStorage.getItem("wai-best") || "0");
    setBest(b);
  }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  function getDiff(s) {
    const str = s ?? streak;
    if (str < 2) return "easy";
    if (str < 4) return "intermediate";
    if (str < 6) return "hard";
    return "expert";
  }

  async function loadPlayer(currentStreak, currentUsed) {
    setPage("loading");
    setLoadErr("");
    const diff = getDiff(currentStreak ?? streak);
    const diffDesc = {
      easy: "a very famous " + sport + " all-time great or hall of famer everyone knows",
      intermediate: "a well-known " + sport + " star that dedicated fans recognize",
      hard: "a lesser-known " + sport + " player only true fans would know",
      expert: "an obscure " + sport + " deep cut only hardcore historians would know",
    };
    const exclude = (currentUsed ?? usedNames).length > 0
      ? "Do NOT pick any of these: " + (currentUsed ?? usedNames).join(", ") + ". "
      : "";
    const prompt =
      "Pick a RANDOM real " + sport + " athlete who is " + diffDesc[diff] + ". " +
      exclude +
      "Be truly random. Return ONLY raw JSON with no markdown:\n" +
      '{"name":"Full Name","position":"Point Guard","school":"School Name","schoolGradYear":2005,"draftYear":2010,"draftRound":1,"draftPick":5,"draftTeam":"Team Name","teams":[{"team":"Team Name","startYear":2010,"endYear":2015}],"jerseyNumbers":["23"],"accolades":["4x Champion"],"isActive":true,"isInternational":false,"isHallOfFame":false,"wonChampionship":true,"wonMVP":true,"wasAllStar":true}';

    try {
      const raw = await callClaude("", prompt, 900);
      const p = JSON.parse(raw.replace(/```json|```/g, "").trim());
      if (!p.name) throw new Error("No name returned");
      setPlayer(p);
      setUsedNames((prev) => [...prev, p.name]);
      setGuesses(10);
      setMode("q");
      setLog([]);
      setInput("");
      setSuggestions([]);
      setResult(null);
      setPage("game");
    } catch (e) {
      setLoadErr("Failed to load player: " + e.message);
    }
  }

  function startStreak() {
    setStreak(0);
    setScore(0);
    setUsedNames([]);
    loadPlayer(0, []);
  }

  function localAnswer(question) {
    const q = question.toLowerCase().replace(/[?!]/g, "").trim();
    const p = player;
    if (!p) return null;
    const teams = (p.teams || []).map((t) => t.team.toLowerCase());
    const accolades = (p.accolades || []).join(" ").toLowerCase();
    const pos = (p.position || "").toLowerCase();
    const startYear = p.teams?.[0]?.startYear || null;
    const lastTeam = p.teams?.[p.teams.length - 1];
    const careerEnd = lastTeam?.endYear || 2025;
    const numTeams = (p.teams || []).length;
    const yn = (c) => (c ? "Yes" : "No");
    const hasTeam = (kw) => teams.some((t) => t.includes(kw));

    if (/still (active|playing)|currently play|still play/.test(q)) return yn(p.isActive);
    if (/retired/.test(q)) return yn(!p.isActive);
    if (/champion|won a (ring|title|cup|series|bowl)|super bowl|stanley cup|world series|nba (champion|title)/.test(q)) return yn(p.wonChampionship);
    if (/\bmvp\b|most valuable/.test(q)) return yn(p.wonMVP);
    if (/all.?star|pro bowl/.test(q)) return yn(p.wasAllStar);
    if (/hall of fame|hof\b/.test(q)) return yn(p.isHallOfFame);
    if (/international|born outside|not american|foreign/.test(q)) return yn(p.isInternational);
    if (/american|born in (the us|america)|from the us/.test(q)) return yn(!p.isInternational);
    if (/rookie of (the )?year/.test(q)) return yn(accolades.includes("rookie"));
    if (/defensive player of (the )?year|dpoy/.test(q)) return yn(accolades.includes("defensive player"));
    if (/sixth man/.test(q)) return yn(accolades.includes("sixth man"));
    if (/scoring (champion|title|leader)/.test(q)) return yn(!!accolades.match(/scoring|art ross/));
    if (/gold glove/.test(q)) return yn(accolades.includes("gold glove"));
    if (/cy young/.test(q)) return yn(accolades.includes("cy young"));
    if (/vezina/.test(q)) return yn(accolades.includes("vezina"));
    if (/norris/.test(q)) return yn(accolades.includes("norris"));
    if (/hart trophy/.test(q)) return yn(accolades.includes("hart trophy"));
    if (/conn smythe/.test(q)) return yn(accolades.includes("conn smythe"));
    if (/olympic|gold medal/.test(q)) return yn(accolades.includes("olympic") || accolades.includes("gold medal"));
    if (/point guard|pg\b/.test(q)) return yn(pos.includes("point guard"));
    if (/shooting guard|sg\b/.test(q)) return yn(pos.includes("shooting guard"));
    if (/small forward|sf\b/.test(q)) return yn(pos.includes("small forward"));
    if (/power forward|pf\b/.test(q)) return yn(pos.includes("power forward"));
    if (/\bcenter\b/.test(q)) return yn(pos.includes("center"));
    if (/\bguard\b/.test(q)) return yn(pos.includes("guard"));
    if (/\bforward\b/.test(q)) return yn(pos.includes("forward"));
    if (/quarterback|qb\b/.test(q)) return yn(pos.includes("quarterback"));
    if (/wide receiver|wr\b/.test(q)) return yn(pos.includes("wide receiver"));
    if (/running back|rb\b/.test(q)) return yn(pos.includes("running back"));
    if (/linebacker/.test(q)) return yn(pos.includes("linebacker"));
    if (/cornerback/.test(q)) return yn(pos.includes("corner"));
    if (/\bsafety\b/.test(q)) return yn(pos.includes("safety"));
    if (/\bpitcher\b/.test(q)) return yn(pos.includes("pitcher"));
    if (/shortstop/.test(q)) return yn(pos.includes("shortstop"));
    if (/outfield|fielder/.test(q)) return yn(pos.includes("fielder"));
    if (/goaltend|goalie/.test(q)) return yn(pos.includes("goaltend"));
    if (/defens(e|eman)\b/.test(q)) return yn(pos.includes("defens"));
    if (/\bwing\b/.test(q)) return yn(pos.includes("wing"));
    if (/first overall|#1 overall|number one overall|first pick/.test(q)) return yn(p.draftPick === 1);
    if (/top 5|top five/.test(q)) return yn(p.draftPick && p.draftPick <= 5);
    if (/top 10|top ten|lottery/.test(q)) return yn(p.draftPick && p.draftPick <= 10);
    if (/first round|round 1/.test(q)) return yn(p.draftRound === 1);
    if (/second round|round 2/.test(q)) return yn(p.draftRound === 2);
    if (/undrafted|wasn't drafted/.test(q)) return yn(!p.draftYear);
    if (/\bdrafted\b/.test(q)) return yn(!!p.draftYear);
    if (/only one team|same team|entire career|whole career/.test(q)) return yn(numTeams === 1);
    if (/more than one team|multiple teams/.test(q)) return yn(numTeams > 1);
    if (/more than two teams/.test(q)) return yn(numTeams > 2);
    if (/more than three teams/.test(q)) return yn(numTeams > 3);
    if (/played in the 80s|1980s/.test(q)) return yn(startYear && startYear < 1990 && careerEnd >= 1980);
    if (/played in the 90s|1990s/.test(q)) return yn(startYear && startYear < 2000 && careerEnd >= 1990);
    if (/played in the 2000s/.test(q)) return yn(startYear && startYear < 2010 && careerEnd >= 2000);
    if (/played in the 2010s/.test(q)) return yn(startYear && startYear < 2020 && careerEnd >= 2010);
    if (/played in the 2020s/.test(q)) return yn(careerEnd >= 2020);
    if (/started before 2000|rookie before 2000/.test(q)) return yn(startYear && startYear < 2000);
    if (/started after 2000|rookie after 2000/.test(q)) return yn(startYear && startYear >= 2000);
    if (/more than 10 years/.test(q)) return yn(startYear && careerEnd - startYear > 10);
    if (/more than 15 years/.test(q)) return yn(startYear && careerEnd - startYear > 15);
    if (/go to college|went to college|play college/.test(q)) return yn(p.school && !/hs|high school|signed|international/i.test(p.school));
    if (/skip college|straight from high school/.test(q)) return yn(!p.school || /hs|high school/i.test(p.school));

    const numM = q.match(/\b(?:wore?|wear|number|jersey|#)\s*#?(\d+)\b/);
    if (numM) return yn((p.jerseyNumbers || []).includes(numM[1]));

    const teamWords = ["lakers","celtics","warriors","bulls","heat","spurs","knicks","nets","clippers","suns","mavericks","bucks","cavaliers","raptors","thunder","jazz","nuggets","blazers","grizzlies","rockets","wizards","hawks","magic","hornets","kings","pelicans","pacers","timberwolves","pistons","76ers","patriots","cowboys","packers","steelers","49ers","chiefs","seahawks","giants","eagles","bears","ravens","broncos","colts","dolphins","jets","raiders","chargers","bengals","saints","falcons","rams","lions","cardinals","texans","buccaneers","titans","vikings","browns","panthers","jaguars","yankees","red sox","dodgers","cubs","mets","braves","astros","phillies","mariners","athletics","rangers","tigers","white sox","blue jays","orioles","rays","twins","royals","angels","padres","rockies","diamondbacks","penguins","blackhawks","red wings","canadiens","maple leafs","bruins","capitals","oilers","flames","canucks","avalanche","lightning","stars","ducks","sharks","flyers","devils","blues","senators","sabres","predators","coyotes","wild","storm","lynx","mercury","sparks","fever","liberty","aces","sky","mystics"];
    for (const tw of teamWords) {
      if (q.includes(tw)) return yn(hasTeam(tw));
    }
    if (/eastern conference/.test(q)) return yn(["celtics","knicks","nets","76ers","raptors","bulls","cavaliers","pistons","pacers","bucks","heat","magic","hawks","hornets","wizards"].some(hasTeam));
    if (/western conference/.test(q)) return yn(["lakers","warriors","suns","nuggets","clippers","jazz","blazers","thunder","timberwolves","pelicans","grizzlies","mavericks","rockets","spurs","kings"].some(hasTeam));
    if (/\bnfc\b/.test(q)) return yn(["cowboys","giants","eagles","packers","bears","lions","vikings","49ers","seahawks","rams","cardinals","saints","falcons","panthers","buccaneers"].some(hasTeam));
    if (/\bafc\b/.test(q)) return yn(["patriots","dolphins","bills","jets","ravens","steelers","browns","bengals","texans","colts","jaguars","titans","chiefs","raiders","chargers","broncos"].some(hasTeam));

    return null;
  }

  async function submit() {
    if (busy || !input.trim()) return;
    const val = input.trim();
    setInput("");
    setSuggestions([]);
    const newGuesses = guesses - 1;
    setGuesses(newGuesses);
    setBusy(true);

    if (mode === "q") {
      const ans = localAnswer(val) || "Partially — can't determine from available data";
      const color = ans.startsWith("Yes") ? "#4ade80" : ans.startsWith("No") ? "#f87171" : "#fbbf24";
      setLog((l) => [...l, { type: "q", text: val, ans, color }]);
      if (newGuesses <= 0) setTimeout(() => endRound(false, newGuesses), 400);
    } else {
      const name = player.name.toLowerCase();
      const guess = val.toLowerCase().trim();
      const correct = guess === name || name.includes(guess) || (guess.length > 3 && name.split(" ").some((p) => p.length > 3 && guess.includes(p)));
      setLog((l) => [...l, { type: "g", text: val, correct }]);
      if (correct) setTimeout(() => endRound(true, newGuesses), 400);
      else if (newGuesses <= 0) setTimeout(() => endRound(false, newGuesses), 400);
    }
    setBusy(false);
  }

  function endRound(won, finalGuesses) {
    const diff = getDiff();
    if (won) {
      const pts = Math.round((finalGuesses + 1) * 10 * MULTS[diff]);
      const newStreak = streak + 1;
      const newScore = score + pts;
      setStreak(newStreak);
      setScore(newScore);
      if (newStreak > best) { setBest(newStreak); localStorage.setItem("wai-best", newStreak); }
      setResult({ won: true, pts, streak: newStreak, score: newScore });
    } else {
      setResult({ won: false, streak, score });
    }
    setPage(won ? "between" : "gameover");
  }

  function factsText(p) {
    const school = p.school ? p.school + (p.schoolGradYear ? " · " + p.schoolGradYear : "") : "Not listed";
    const draft = p.draftYear ? p.draftYear + " · Rd " + (p.draftRound || "?") + " Pick " + (p.draftPick || "?") + " · " + (p.draftTeam || "?") : "Undrafted";
    const teams = (p.teams || []).map((t) => t.team + " (" + (t.startYear || "?") + "–" + (t.endYear || "present") + ")").join(", ");
    const nums = (p.jerseyNumbers || []).map((n) => "#" + n).join(", ") || "N/A";
    const acc = (p.accolades || []).join(" · ") || "None";
    return { school, draft, teams, nums, acc };
  }

  const sc = { maxWidth: 440, margin: "0 auto", padding: "1rem", fontFamily: "sans-serif", minHeight: "100vh", background: "#0f172a" };
  const diff = getDiff();
  const dc = DIFF_COLORS[diff];

  if (page === "home") return (
    <div style={sc}>
      <div style={{ textAlign: "center", paddingTop: "2rem", marginBottom: 28 }}>
        <div style={{ fontSize: 52 }}>🏆</div>
        <div style={{ color: "white", fontSize: 26, fontWeight: 800, margin: "8px 0 4px" }}>Who Am I?</div>
        <div style={{ color: "#64748b", fontSize: 13 }}>10 questions · Build your streak 🔥</div>
      </div>
      <div style={{ color: "#94a3b8", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Pick a sport</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 32 }}>
        {["NBA","NFL","MLB","NHL","WNBA"].map((s) => (
          <button key={s} onClick={() => setSport(s)} style={{ flex: 1, padding: "14px 4px", borderRadius: 12, border: sport === s ? "2px solid #3b82f6" : "2px solid #1e293b", background: sport === s ? "#1e3a8a" : "#1e293b", color: sport === s ? "#93c5fd" : "#94a3b8", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
            {s === "NBA" ? "🏀" : s === "NFL" ? "🏈" : s === "MLB" ? "⚾" : s === "NHL" ? "🏒" : "🏀"}<br />{s}
          </button>
        ))}
      </div>
      <button onClick={startStreak} disabled={!sport} style={{ width: "100%", padding: 14, fontSize: 15, fontWeight: 800, borderRadius: 12, border: "none", background: sport ? "#2563eb" : "#1e293b", color: sport ? "white" : "#475569", cursor: sport ? "pointer" : "not-allowed" }}>
        {sport ? `Start Streak — ${sport} →` : "Pick a sport to start"}
      </button>
      {best > 0 && <div style={{ textAlign: "center", marginTop: 14, color: "#64748b", fontSize: 13 }}>🏆 Best streak: {best}</div>}
    </div>
  );

  if (page === "loading") return (
    <div style={{ ...sc, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16, animation: "spin 1s linear infinite", display: "inline-block" }}>🔍</div>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <div style={{ color: "white", fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Finding your player…</div>
        <div style={{ color: "#64748b", fontSize: 13 }}>{DIFF_LABELS[diff]} · {MULTS[diff]}× multiplier</div>
        {loadErr && <>
          <div style={{ color: "#f87171", fontSize: 13, marginTop: 16 }}>{loadErr}</div>
          <button onClick={() => loadPlayer()} style={{ marginTop: 12, padding: "10px 24px", borderRadius: 10, border: "none", background: "#2563eb", color: "white", fontWeight: 700, cursor: "pointer" }}>Try again</button>
        </>}
      </div>
    </div>
  );

  if (page === "game" && player) {
    const f = factsText(player);
    return (
      <div style={sc}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ background: "#1e40af", color: "#93c5fd", fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 6 }}>{sport}</span>
            <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 6, background: dc.bg, color: dc.c }}>{DIFF_LABELS[diff]} · {MULTS[diff]}×</span>
            <span>🔥</span><span style={{ color: "white", fontSize: 16, fontWeight: 800 }}>{streak}</span>
          </div>
          <button onClick={() => endRound(false, 0)} style={{ fontSize: 12, padding: "4px 10px", border: "1px solid #334155", borderRadius: 8, background: "transparent", color: "#64748b", cursor: "pointer" }}>give up</button>
        </div>

        <div style={{ display: "flex", gap: 5, marginBottom: 12, justifyContent: "center" }}>
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} style={{ width: 24, height: 8, borderRadius: 99, background: i < guesses ? "#4ade80" : "#1e293b" }} />
          ))}
        </div>

        <div style={{ background: "#1e293b", borderRadius: 16, padding: 16, marginBottom: 12 }}>
          <div style={{ display: "flex", gap: 12, marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid #334155" }}>
            <div style={{ width: 52, height: 52, borderRadius: 12, background: "#0f172a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, flexShrink: 0 }}>?</div>
            <div style={{ flex: 1, paddingTop: 4 }}>
              <div style={{ color: "#475569", fontWeight: 700, fontSize: 13, marginBottom: 4, letterSpacing: 2 }}>? ? ? ? ? ? ? ?</div>
              <div style={{ color: "#334155", fontSize: 12 }}>{player.position}</div>
            </div>
          </div>
          {[["🎓","School / Grad",f.school],["📋","Draft",f.draft],["🏟️","Teams",f.teams],["👕","Jersey #",f.nums],["🏅","Accolades",f.acc]].map(([icon,label,val]) => (
            <div key={label} style={{ display: "flex", gap: 10, marginBottom: 8 }}>
              <span style={{ width: 18, fontSize: 13, marginTop: 14, flexShrink: 0 }}>{icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: "#475569", textTransform: "uppercase", letterSpacing: .5, marginBottom: 2 }}>{label}</div>
                <div style={{ fontSize: 13, color: "#94a3b8" }}>{val}</div>
              </div>
            </div>
          ))}
          <div style={{ borderTop: "1px solid #334155", paddingTop: 10 }}>
            <div ref={logRef} style={{ maxHeight: 140, overflowY: "auto" }}>
              {log.length === 0
                ? <p style={{ color: "#475569", fontSize: 13, textAlign: "center", margin: 0 }}>ask your first question below</p>
                : log.map((item, i) => (
                  <div key={i} style={{ marginBottom: 9, fontSize: 13, lineHeight: 1.5 }}>
                    {item.type === "q"
                      ? <><div style={{ color: "#93c5fd", fontWeight: 600 }}>Q: {item.text}</div><div style={{ color: item.color, fontWeight: 700, marginLeft: 10 }}>→ {item.ans}</div></>
                      : <><div style={{ color: "#c4b5fd", fontWeight: 600 }}>Guess: {item.text}</div><div style={{ color: item.correct ? "#4ade80" : "#f87171", fontWeight: 700, marginLeft: 10 }}>{item.correct ? "✓ Correct! 🎉" : "✗ Not quite!"}</div></>
                    }
                  </div>
                ))
              }
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          {[["q","Yes/No Q","#2563eb"],["g","Guess Name","#7c3aed"]].map(([m,label,color]) => (
            <button key={m} onClick={() => { setMode(m); setSuggestions([]); }} style={{ flex: 1, padding: 8, fontSize: 12, fontWeight: 700, borderRadius: 10, border: "none", background: mode === m ? color : "#1e293b", color: mode === m ? "white" : "#64748b", cursor: "pointer" }}>{label}</button>
          ))}
        </div>

        {suggestions.length > 0 && suggestions.map((n) => (
          <button key={n} onClick={() => { setInput(n); setSuggestions([]); setTimeout(submit, 0); }} style={{ display: "block", width: "100%", padding: "9px 14px", marginBottom: 4, fontSize: 13, textAlign: "left", borderRadius: 8, border: "1px solid #475569", background: "#293548", color: "#e2e8f0", cursor: "pointer" }}>{n}</button>
        ))}

        <div style={{ display: "flex", gap: 8 }}>
          <input value={input} onChange={(e) => {
            setInput(e.target.value);
            if (mode === "g" && e.target.value.length >= 2) {
              const q = e.target.value.toLowerCase();
              setSuggestions(usedNames.filter((n) => n.toLowerCase().includes(q)).slice(0, 4));
            } else setSuggestions([]);
          }} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder={mode === "q" ? "Is this player still active?" : "Type player's full name…"} disabled={busy} style={{ flex: 1, padding: "11px 14px", fontSize: 14, border: "none", borderRadius: 10, outline: "none", background: "#1e293b", color: "white" }} />
          <button onClick={submit} disabled={busy || !input.trim()} style={{ padding: "11px 20px", fontSize: 18, borderRadius: 10, border: "none", background: "#2563eb", color: "white", cursor: "pointer", opacity: busy || !input.trim() ? 0.5 : 1 }}>→</button>
        </div>
      </div>
    );
  }

  if (page === "between" && result && player) {
    const f = factsText(player);
    const nextDiff = getDiff(streak);
    return (
      <div style={sc}>
        <div style={{ textAlign: "center", marginBottom: 20, paddingTop: "1rem" }}>
          <div style={{ fontSize: 52, marginBottom: 10 }}>{streak >= 5 ? "🔥" : streak >= 3 ? "⚡" : "🎉"}</div>
          <div style={{ color: "white", fontSize: 22, fontWeight: 800, marginBottom: 4 }}>{streak >= 5 ? "On fire!" : streak >= 3 ? "Keep going!" : "Correct!"}</div>
          <div style={{ color: "#64748b", fontSize: 14 }}>+{result.pts} pts · {streak} streak</div>
        </div>
        <div style={{ background: "#1e293b", borderRadius: 16, padding: 16, marginBottom: 14 }}>
          <div style={{ color: "white", fontSize: 18, fontWeight: 800, marginBottom: 2 }}>{player.name}</div>
          <div style={{ color: "#64748b", fontSize: 13, marginBottom: 10 }}>{sport} · {player.position}</div>
          <div style={{ fontSize: 13, color: "#cbd5e1", lineHeight: 1.8 }}>🎓 {f.school}<br />📋 {f.draft}<br />🏟️ {f.teams}<br />👕 {f.nums}<br />🏅 {f.acc}</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 14 }}>
          {[["Streak", streak + "🔥", "#fb923c"], ["Score", result.score, "#4ade80"], ["Next", DIFF_LABELS[nextDiff], "white"]].map(([l, v, c]) => (
            <div key={l} style={{ background: "#1e293b", borderRadius: 12, padding: 10, textAlign: "center" }}>
              <div style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase" }}>{l}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: c }}>{v}</div>
            </div>
          ))}
        </div>
        <button onClick={() => loadPlayer(streak, usedNames)} style={{ width: "100%", padding: 14, fontSize: 15, fontWeight: 800, borderRadius: 12, border: "none", background: "#2563eb", color: "white", cursor: "pointer" }}>Next Player →</button>
      </div>
    );
  }

  if (page === "gameover" && player) {
    const f = factsText(player);
    return (
      <div style={sc}>
        <div style={{ textAlign: "center", marginBottom: 20, paddingTop: "1rem" }}>
          <div style={{ fontSize: 52, marginBottom: 10 }}>💀</div>
          <div style={{ color: "white", fontSize: 24, fontWeight: 800, marginBottom: 4 }}>Streak Ended!</div>
          <div style={{ color: "#64748b", fontSize: 14 }}>The answer was {player.name}</div>
        </div>
        <div style={{ background: "#1e293b", borderRadius: 16, padding: 16, marginBottom: 14 }}>
          <div style={{ color: "white", fontSize: 20, fontWeight: 800, marginBottom: 8 }}>{player.name}</div>
          <div style={{ fontSize: 13, color: "#cbd5e1", lineHeight: 1.8 }}>🎓 {f.school}<br />📋 {f.draft}<br />🏟️ {f.teams}<br />👕 {f.nums}<br />🏅 {f.acc}</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 14 }}>
          {[["Streak", streak + "🔥", "#fb923c"], ["Score", score, "#4ade80"], ["Best", best + "🔥", "#fbbf24"]].map(([l, v, c]) => (
            <div key={l} style={{ background: "#1e293b", borderRadius: 12, padding: 10, textAlign: "center" }}>
              <div style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase" }}>{l}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: c }}>{v}</div>
            </div>
          ))}
        </div>
        <button onClick={() => { setStreak(0); setScore(0); setUsedNames([]); setPage("home"); }} style={{ width: "100%", padding: 14, fontSize: 15, fontWeight: 800, borderRadius: 12, border: "none", background: "#2563eb", color: "white", cursor: "pointer" }}>Play Again</button>
      </div>
    );
  }

  return null;
}
