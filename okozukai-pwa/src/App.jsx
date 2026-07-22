import React, { useMemo, useState, useEffect, useRef, useContext, createContext } from "react";
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import {
  Sparkles, RotateCcw, Minus, Plus, Wallet, ShoppingBag, Gift,
  X, Lock, Unlock, Delete, PiggyBank, Bird, Heart, Target, TrendingUp, ScrollText,
} from "lucide-react";

const C = {
  plum: "#3A2E5C", plumSoft: "#6E62A0", green: "#22B573", greenDark: "#159A5D",
  gold: "#F5A623", goldSoft: "#FFD267", coral: "#FF6F61", coralDark: "#E8503F",
  violet: "#7C6BD9", teal: "#1FB6B0", sky: "#EAF0FF", paper: "#FFFFFF",
};
const yen = (v) => "¥" + Math.round(v).toLocaleString("ja-JP");
const uid = () => Math.random().toString(36).slice(2, 10);

// 1 week = 1 real week. For testing, open with ?weekms=4000 to make a "week" 4s.
const WEEK_MS = (() => {
  try { const q = new URLSearchParams(window.location.search).get("weekms"); return q ? Math.max(500, Number(q)) : 7 * 24 * 60 * 60 * 1000; }
  catch (e) { return 7 * 24 * 60 * 60 * 1000; }
})();

const STORE_KEY = "okozukai_v9";
const loadState = () => { try { return JSON.parse(localStorage.getItem(STORE_KEY)); } catch (e) { return null; } };
const saveState = (s) => { try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch (e) {} };

// ---- furigana text: write "[漢字|かんじ]" ; kana mode shows reading, kanji mode shows ruby ----
const LevelCtx = createContext("kanji");
function T({ s }) {
  const level = useContext(LevelCtx);
  const out = []; let i = 0, key = 0; const re = /\[([^|\]]+)\|([^\]]+)\]/g; let m;
  while ((m = re.exec(s))) {
    if (m.index > i) out.push(s.slice(i, m.index));
    if (level === "kana") out.push(m[2]);
    else out.push(<ruby key={key++}>{m[1]}<rt>{m[2]}</rt></ruby>);
    i = m.index + m[0].length;
  }
  if (i < s.length) out.push(s.slice(i));
  return <span>{out}</span>;
}

const MAX_HEARTS = 4;
const MAX_ANIMALS = 10;
const ANIMALS = {
  chick: { emoji: "🐤", name: "ひよこ", cost: 400, income: 60, feed: 30 },
  rabbit: { emoji: "🐰", name: "うさぎ", cost: 800, income: 110, feed: 50 },
  sheep: { emoji: "🐑", name: "ひつじ", cost: 1500, income: 200, feed: 90 },
  lion: { emoji: "🦁", name: "ライオン", cost: 2500, income: 340, feed: 150 },
  horse: { emoji: "🐴", name: "うま", cost: 3500, income: 480, feed: 220 },
  unicorn: { emoji: "🦄", name: "ユニコーン", cost: 5000, income: 680, feed: 300 },
};
const LOGTYPE = {
  allowance: { label: "おこづかい", color: C.green, icon: Wallet, neg: false },
  gift: { label: "もらった お[金|かね]", color: C.gold, icon: Gift, neg: false },
  withdraw: { label: "[使|つか]った", color: C.coral, icon: ShoppingBag, neg: true },
  interest: { label: "[利息|りそく]（[複利|ふくり]）", color: C.violet, icon: TrendingUp, neg: false },
  animal: { label: "[動物|どうぶつ]の [稼|かせ]ぎ", color: C.teal, icon: Bird, neg: false },
  animalbuy: { label: "[動物|どうぶつ]を [買|か]った", color: C.plumSoft, icon: Bird, neg: true },
  feed: { label: "ご[飯|はん]を あげた", color: C.violet, icon: Heart, neg: true },
};
const SPEND_MEMOS = ["おかし", "おもちゃ", "ゲーム", "[本|ほん]", "その[他|た]"];
const INCOME_MEMOS = ["おとしだま", "おばあちゃん", "おじいちゃん", "たんじょうび", "その[他|た]"];
const GOAL_MEMOS = ["ゲーム", "おもちゃ", "ほん", "プレゼント", "じてんしゃ"];
const PERIODS = [["毎週", 1], ["2週ごと", 2], ["1ヶ月ごと", 4]];
const HIST_FILTERS = [["[全部|ぜんぶ]", "all"], ["[増|ふ]えた", "in"], ["[複利|ふくり]・[動物|どうぶつ]", "earn"], ["[使|つか]った", "withdraw"]];
const matchFilter = (type, f) =>
  f === "all" ? true
    : f === "in" ? ["allowance", "gift"].includes(type)
      : f === "earn" ? ["interest", "animal"].includes(type)
        : f === "withdraw" ? type === "withdraw" : true;
const AFFILIATE = [
  { emoji: "📚", title: "お金の絵本・ドリル", desc: "お金の基本が学べる本", url: "" },
  { emoji: "🎲", title: "お金のボードゲーム", desc: "人生ゲーム・モノポリー など", url: "" },
  { emoji: "💳", title: "子ども用プリペイドカード", desc: "セブン銀行 money ring など", url: "" },
  { emoji: "🎓", title: "金融教育のオンライン講座", desc: "親子で一緒に", url: "" },
];

// ---- pure weekly simulation (real-time catch-up) ----
function stepWeek(s, st) {
  const nw = s.week + 1; let b = s.balance; const newLogs = [];
  if (st.rateEveryN > 0 && nw % st.rateEveryN === 0) {
    const it = Math.round(b * st.ratePct / 100);
    if (it > 0) { b += it; newLogs.push({ id: uid(), week: nw, type: "interest", amount: it }); }
  }
  if (st.allowance.everyN > 0 && nw % st.allowance.everyN === 0 && st.allowance.amount > 0) {
    b += st.allowance.amount; newLogs.push({ id: uid(), week: nw, type: "allowance", amount: st.allowance.amount });
  }
  const kept = []; let inc = 0;
  for (const a of s.animals) { inc += ANIMALS[a.key].income; const nh = a.hearts - 1; if (nh > 0) kept.push({ ...a, hearts: nh }); }
  if (inc > 0) { b += inc; newLogs.push({ id: uid(), week: nw, type: "animal", amount: inc }); }
  return { week: nw, balance: b, animals: kept, weekly: [...s.weekly, { week: nw, balance: b }], logs: [...s.logs, ...newLogs] };
}
function advance(s, n, st) {
  let cur = s;
  for (let i = 0; i < n; i++) cur = stepWeek(cur, st);
  cur.weekly = cur.weekly.slice(-260); cur.logs = cur.logs.slice(-2000);
  return cur;
}
function project(bal, weeks, ratePct, rateEveryN, allow, animalNet, startWeek) {
  let b = bal;
  for (let i = 1; i <= weeks; i++) {
    const wk = startWeek + i;
    if (rateEveryN > 0 && wk % rateEveryN === 0) b += Math.round(b * ratePct / 100);
    if (allow.everyN > 0 && wk % allow.everyN === 0 && allow.amount > 0) b += allow.amount;
    b += Math.max(0, animalNet);
  }
  return b;
}

function useTween(target) {
  const [val, setVal] = useState(target);
  const raf = useRef(); const from = useRef(target);
  useEffect(() => {
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { setVal(target); from.current = target; return; }
    const start = performance.now(), a = from.current, b = target;
    cancelAnimationFrame(raf.current);
    const tick = (t) => {
      const p = Math.min(1, (t - start) / 600), e = 1 - Math.pow(1 - p, 3);
      setVal(a + (b - a) * e);
      if (p < 1) raf.current = requestAnimationFrame(tick); else from.current = b;
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target]);
  return val;
}

function Jar({ fillPct, growth, magic }) {
  const jt = 96, jb = 196, jh = jb - jt;
  const fillY = jb - Math.max(0, Math.min(1, fillPct)) * jh;
  const stemH = 8 + growth * 66, stemTop = jt - stemH;
  return (
    <svg viewBox="0 0 200 210" width="100%" height="100%" role="img" aria-label="ちょきん">
      <defs>
        <linearGradient id="coins" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.goldSoft} /><stop offset="100%" stopColor={C.gold} /></linearGradient>
        <clipPath id="jarClip"><path d="M58 96 q0 -10 12 -10 h60 q12 0 12 10 v92 q0 12 -12 12 h-60 q-12 0 -12 -12 z" /></clipPath>
      </defs>
      <g style={{ transition: "all .6s cubic-bezier(.2,.8,.2,1)" }}>
        <rect x={98} y={stemTop} width={4} height={stemH} rx={2} fill={C.green} />
        <ellipse cx={100 - 14 * growth} cy={stemTop + stemH * 0.35} rx={13 * growth} ry={8 * growth} fill={C.green} opacity={growth} />
        <ellipse cx={100 + 14 * growth} cy={stemTop + stemH * 0.6} rx={13 * growth} ry={8 * growth} fill={C.greenDark} opacity={growth} />
        {growth > 0.55 && <circle cx={100} cy={stemTop - 2} r={9 * growth} fill={C.gold} stroke="#fff" strokeWidth="2" />}
      </g>
      <path d="M58 96 q0 -10 12 -10 h60 q12 0 12 10 v92 q0 12 -12 12 h-60 q-12 0 -12 -12 z" fill="#F2F4FF" />
      <g clipPath="url(#jarClip)">
        <rect x={50} y={fillY} width={100} height={jb - fillY + 6} fill="url(#coins)" style={{ transition: "y .7s cubic-bezier(.2,.8,.2,1), height .7s cubic-bezier(.2,.8,.2,1)" }} />
        {fillPct > 0.12 && <circle cx={78} cy={fillY + 16} r={7} fill="#fff" opacity="0.35" />}
        {fillPct > 0.35 && <circle cx={120} cy={fillY + 30} r={9} fill="#fff" opacity="0.28" />}
      </g>
      <path d="M58 96 q0 -10 12 -10 h60 q12 0 12 10 v92 q0 12 -12 12 h-60 q-12 0 -12 -12 z" fill="none" stroke={C.plum} strokeWidth="4" />
      <ellipse cx={100} cy={90} rx={44} ry={9} fill="#fff" stroke={C.plum} strokeWidth="4" />
      {magic && <g fill={C.gold}><path d="M40 60 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3z" opacity="0.9" /><path d="M162 78 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z" opacity="0.8" /></g>}
    </svg>
  );
}

export default function App() {
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState("save");
  const [week, setWeek] = useState(0);
  const [balance, setBalance] = useState(0);
  const [weekly, setWeekly] = useState([{ week: 0, balance: 0 }]);
  const [log, setLog] = useState([]);
  const [animals, setAnimals] = useState([]);
  const [goal, setGoal] = useState(null);
  const [allowance, setAllowance] = useState({ amount: 300, everyN: 1 });
  const [ratePct, setRatePct] = useState(5);
  const [rateEveryN, setRateEveryN] = useState(1);
  const [pin, setPin] = useState(null);
  const [age, setAge] = useState(7);
  const [startTime, setStartTime] = useState(() => Date.now());
  const [projWeeks, setProjWeeks] = useState(52);
  const [histFilter, setHistFilter] = useState("all");

  const [parentUnlocked, setParentUnlocked] = useState(false);
  const [modal, setModal] = useState(null);
  const [pending, setPending] = useState(null);
  const [flash, setFlash] = useState([]);

  const level = age <= 7 ? "kana" : "kanji";

  useEffect(() => {
    const d = loadState();
    if (d) {
      setWeek(d.week || 0); setBalance(d.balance || 0); setWeekly(d.weekly || [{ week: 0, balance: 0 }]);
      setLog(d.log || []); setAnimals(d.animals || []); setGoal(d.goal || null);
      setAllowance(d.allowance || { amount: 300, everyN: 1 }); setRatePct(d.ratePct ?? 5);
      setRateEveryN(d.rateEveryN ?? 1); setPin(d.pin || null); setAge(d.age ?? 7); setStartTime(d.startTime || Date.now());
    }
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded) return;
    saveState({ week, balance, weekly, log, animals, goal, allowance, ratePct, rateEveryN, pin, age, startTime });
  }, [loaded, week, balance, weekly, log, animals, goal, allowance, ratePct, rateEveryN, pin, age, startTime]);

  const totals = useMemo(() => {
    let tin = 0, grown = 0, out = 0;
    for (const e of log) {
      if (e.type === "allowance" || e.type === "gift") tin += e.amount;
      else if (e.type === "animal" || e.type === "interest") grown += e.amount;
      else if (e.type === "withdraw") out += e.amount;
    }
    return { tin, grown, out };
  }, [log]);

  const weeklyAnimalIncome = useMemo(() => animals.reduce((s, a) => s + ANIMALS[a.key].income, 0), [animals]);
  const animalNetWeekly = useMemo(() => animals.reduce((s, a) => s + (ANIMALS[a.key].income - ANIMALS[a.key].feed), 0), [animals]);
  const shownBal = useTween(balance);
  const maxEver = useMemo(() => weekly.reduce((m, p) => Math.max(m, p.balance), 0), [weekly]);
  const growth = Math.min(1, week / 36);
  const fillPct = balance / Math.max(2000, maxEver * 1.2);
  const magic = totals.grown > 0 && totals.grown > totals.tin;

  const projNow = useMemo(() => project(balance, projWeeks, ratePct, rateEveryN, allowance, animalNetWeekly, week), [balance, projWeeks, ratePct, rateEveryN, allowance, animalNetWeekly, week]);
  const oneYear = useMemo(() => project(balance, 52, ratePct, rateEveryN, allowance, animalNetWeekly, week), [balance, ratePct, rateEveryN, allowance, animalNetWeekly, week]);
  const gainPerWeek = (allowance.everyN > 0 ? allowance.amount / allowance.everyN : 0) + Math.max(0, animalNetWeekly) + (rateEveryN > 0 ? balance * ratePct / 100 / rateEveryN : 0);
  const weeksToGoal = goal && balance < goal.amount && gainPerWeek > 0 ? Math.ceil((goal.amount - balance) / gainPerWeek) : null;

  function addLog(type, amount, memo) { setLog((p) => [...p, { id: uid(), week, type, amount, memo }]); }

  const simRef = useRef();
  simRef.current = { week, balance, animals, weekly, log, startTime, st: { ratePct, rateEveryN, allowance } };
  const catchUp = () => {
    const s = simRef.current;
    const target = Math.floor((Date.now() - s.startTime) / WEEK_MS);
    if (target <= s.week) return;
    const n = Math.min(target - s.week, 520);
    const res = advance({ week: s.week, balance: s.balance, animals: s.animals, weekly: s.weekly, logs: s.log }, n, s.st);
    setWeek(res.week); setBalance(res.balance); setAnimals(res.animals); setWeekly(res.weekly); setLog(res.logs);
    setFlash([`${n === 1 ? "1" : n}[週|しゅう] [進|すす]んだよ`]); setTimeout(() => setFlash([]), 2600);
  };
  const catchRef = useRef(); catchRef.current = catchUp;
  useEffect(() => {
    if (!loaded) return;
    catchRef.current();
    const id = setInterval(() => catchRef.current(), Math.min(WEEK_MS, 30000));
    return () => clearInterval(id);
  }, [loaded]);

  function requirePin(action) { setPending(action); setModal(pin ? "pinEnter" : "pinCreate"); }
  function applyPending(a) {
    if (a.kind === "withdraw") { setBalance((b) => b - a.amount); addLog("withdraw", a.amount, a.memo); }
    else if (a.kind === "gift") { setBalance((b) => b + a.amount); addLog("gift", a.amount, a.memo); }
  }
  function onPinDone(code) {
    if (modal === "pinCreate") setPin(code);
    if (pending) { applyPending(pending); setPending(null); } else setParentUnlocked(true);
    setModal(null);
  }
  function tapParent() { if (parentUnlocked) { setParentUnlocked(false); return; } setPending(null); setModal(pin ? "pinEnter" : "pinCreate"); }

  function buyAnimal(key) {
    const d = ANIMALS[key];
    if (balance < d.cost || animals.length >= MAX_ANIMALS) return;
    setBalance((b) => b - d.cost);
    setAnimals((p) => [...p, { id: uid(), key, hearts: MAX_HEARTS }]);
    addLog("animalbuy", d.cost, d.name);
  }
  function feedAnimal(id) {
    setAnimals((p) => p.map((a) => {
      if (a.id !== id || a.hearts >= MAX_HEARTS) return a;
      const cost = ANIMALS[a.key].feed;
      if (balance < cost) return a;
      setBalance((b) => b - cost);
      addLog("feed", cost, ANIMALS[a.key].name);
      return { ...a, hearts: a.hearts + 1 };
    }));
  }
  function resetAll() { setWeek(0); setBalance(0); setWeekly([{ week: 0, balance: 0 }]); setLog([]); setAnimals([]); setStartTime(Date.now()); }

  const history = [...log].reverse();
  if (!loaded) return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F3F1FF", color: C.plumSoft, fontFamily: "sans-serif", fontWeight: 700 }}>よみこみちゅう…</div>;

  const TABS = [
    { k: "save", label: "[貯金|ちょきん]", icon: PiggyBank },
    { k: "animals", label: "[動物|どうぶつ]", icon: Bird },
    { k: "history", label: "[履歴|りれき]", icon: ScrollText },
  ];

  const insight = log.length === 0 ? "[毎週|まいしゅう] [自動|じどう]で お[金|かね]が [進|すす]むよ"
    : magic ? "すごい！ [複利|ふくり]で こんなに [増|ふ]えた！"
      : totals.grown === 0 ? "[複利|ふくり]で だんだん [増|ふ]えていくよ"
        : `お[金|かね]が [自分|じぶん]で ${yen(totals.grown)} [稼|かせ]いだよ`;

  return (
    <LevelCtx.Provider value={level}>
    <div style={{ minHeight: "100vh", background: "linear-gradient(160deg,#F3F1FF 0%,#EAF7F1 100%)", color: C.plum, fontFamily: "'M PLUS Rounded 1c',sans-serif", padding: "16px 16px 96px" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=M+PLUS+Rounded+1c:wght@400;500;700;800&family=Zen+Maru+Gothic:wght@500;700;900&family=Baloo+2:wght@600;800&display=swap');
        button:focus-visible{outline:3px solid ${C.plum};outline-offset:2px}
        ruby{ruby-align:center}
        rt{font-size:.52em;font-weight:700;color:${C.plumSoft};transform:translateY(1px)}
        .sheet-in{animation:su .28s cubic-bezier(.2,.8,.2,1)}
        @keyframes su{from{transform:translateY(30px);opacity:0}to{transform:translateY(0);opacity:1}}
        .flash{animation:fl .3s ease}
        @keyframes fl{from{transform:translateY(-8px);opacity:0}to{transform:translateY(0);opacity:1}}
        .hist::-webkit-scrollbar{width:6px}.hist::-webkit-scrollbar-thumb{background:#DDD9EC;border-radius:3px}
        @media (prefers-reduced-motion:reduce){.sheet-in,.flash{animation:none}}
      `}</style>

      <div style={{ maxWidth: 460, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: 3, color: C.plumSoft, fontWeight: 700 }}>OKOZUKAI LAB</div>
            <h1 style={{ fontFamily: "'Zen Maru Gothic',sans-serif", fontWeight: 900, fontSize: 21, margin: "1px 0 0" }}>おこづかい ラボ</h1>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10, color: C.plumSoft, fontWeight: 700 }}>{week === 0 ? "スタート" : <T s={`${week}[週目|しゅうめ]`} />}</div>
              <div style={{ fontFamily: "'Baloo 2',sans-serif", fontWeight: 800, fontSize: 15, color: C.plum }}>{yen(balance)}</div>
            </div>
            <button onClick={tapParent} style={{ border: "none", borderRadius: 14, padding: "8px 11px", background: parentUnlocked ? C.plum : "#fff", color: parentUnlocked ? "#fff" : C.plum, boxShadow: "0 4px 12px rgba(58,46,92,.12)", cursor: "pointer", fontFamily: "'Zen Maru Gothic',sans-serif", fontWeight: 700, fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
              {parentUnlocked ? <Unlock size={15} /> : <Lock size={15} />}親
            </button>
          </div>
        </div>

        {parentUnlocked && (
          <div style={{ background: "#FBFAFF", border: `2px solid ${C.plum}22`, borderRadius: 22, padding: 16, marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14 }}>
              <Unlock size={16} color={C.plum} />
              <div style={{ fontFamily: "'Zen Maru Gothic',sans-serif", fontWeight: 900, fontSize: 16, flex: 1 }}>親モード（設定）</div>
              <button onClick={() => setParentUnlocked(false)} style={{ border: "none", background: "#fff", borderRadius: 10, padding: "6px 12px", fontWeight: 700, color: C.plum, cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,.06)" }}>ロック</button>
            </div>

            <PanelLabel>子どもの年齢</PanelLabel>
            <Row><StepBtn onClick={() => setAge((a) => Math.max(4, a - 1))}><Minus size={18} /></StepBtn>
              <Big>{age}さい</Big>
              <StepBtn onClick={() => setAge((a) => Math.min(12, a + 1))}><Plus size={18} /></StepBtn></Row>
            <div style={{ fontSize: 11.5, color: C.plumSoft, fontWeight: 700, marginBottom: 16, marginTop: -4 }}>
              {level === "kana" ? "→ すべてひらがなで表示" : "→ 漢字＋ふりがなで表示"}
            </div>

            <PanelLabel>1回のおこづかい（金額）</PanelLabel>
            <Row><StepBtn onClick={() => setAllowance((a) => ({ ...a, amount: Math.max(0, a.amount - 50) }))}><Minus size={18} /></StepBtn>
              <Big>¥{allowance.amount}</Big>
              <StepBtn onClick={() => setAllowance((a) => ({ ...a, amount: a.amount + 50 }))}><Plus size={18} /></StepBtn></Row>
            <PanelLabel>おこづかいの周期</PanelLabel>
            <Segmented value={allowance.everyN} onChange={(n) => setAllowance((a) => ({ ...a, everyN: n }))} />
            <div style={{ height: 14 }} />
            <PanelLabel>利息（複利）の大きさ</PanelLabel>
            <Row><StepBtn onClick={() => setRatePct((r) => Math.max(0, r - 1))}><Minus size={18} /></StepBtn>
              <Big>{ratePct}%</Big>
              <StepBtn onClick={() => setRatePct((r) => Math.min(15, r + 1))}><Plus size={18} /></StepBtn></Row>
            <PanelLabel>利息の周期</PanelLabel>
            <Segmented value={rateEveryN} onChange={setRateEveryN} />
            <div style={{ height: 18 }} />
            <PanelLabel>おうちの方へ（おすすめ）</PanelLabel>
            {AFFILIATE.map((a) => (
              <div key={a.title} style={{ display: "flex", alignItems: "center", gap: 10, background: "#fff", borderRadius: 14, padding: "10px 12px", marginBottom: 8, boxShadow: "0 2px 8px rgba(58,46,92,.05)" }}>
                <span style={{ fontSize: 24 }}>{a.emoji}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>{a.title}</div>
                  <div style={{ fontSize: 11, color: C.plumSoft, fontWeight: 700 }}>{a.desc}</div>
                </div>
                <a href={a.url || "#"} target="_blank" rel="noopener sponsored nofollow" style={{ textDecoration: "none", background: C.violet + "1A", color: C.violet, fontWeight: 700, fontSize: 12, borderRadius: 10, padding: "7px 12px", flexShrink: 0 }}>みる</a>
              </div>
            ))}
            <div style={{ fontSize: 10.5, color: C.plumSoft, fontWeight: 700, marginBottom: 6 }}>※ 親向けのおすすめリンク（アフィリエイト）</div>
            <button onClick={() => { setPending(null); setModal("pinCreate"); }} style={{ width: "100%", border: "none", background: "transparent", color: C.plumSoft, fontWeight: 700, fontSize: 12.5, padding: 8, marginTop: 4, cursor: "pointer" }}>パスワードを変更</button>
          </div>
        )}

        {tab === "save" && (
          <>
            <div style={{ background: C.paper, borderRadius: 28, padding: "14px 18px 18px", boxShadow: "0 14px 40px rgba(58,46,92,.10)", textAlign: "center" }}>
              <div style={{ height: 180, margin: "-2px auto 0", maxWidth: 210 }}><Jar fillPct={fillPct} growth={growth} magic={magic} /></div>
              <div style={{ fontSize: 13, color: C.plumSoft, fontWeight: 700, marginTop: -6 }}><T s="[今|いま]の お[金|かね]" /></div>
              <div style={{ fontFamily: "'Baloo 2','Zen Maru Gothic',sans-serif", fontWeight: 800, fontSize: 44, lineHeight: 1.05, letterSpacing: -1 }}>{yen(shownBal)}</div>
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <Stat label={<T s="[入|い]れた" />} value={yen(totals.tin)} color={C.green} />
                <Stat label={<T s="[増|ふ]えた" />} value={yen(totals.grown)} color={C.violet} />
                <Stat label={<T s="[使|つか]った" />} value={yen(totals.out)} color={C.coral} />
              </div>
              <div style={{ marginTop: 12, background: magic ? "#FFF6E2" : C.sky, color: magic ? "#8A5A00" : C.plum, borderRadius: 16, padding: "10px 12px", fontWeight: 700, fontSize: 13.5, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                {magic && <Sparkles size={16} />}<T s={insight} />
              </div>
            </div>

            {goal ? (
              <div style={{ background: C.paper, borderRadius: 20, padding: 16, marginTop: 12, boxShadow: "0 10px 30px rgba(58,46,92,.08)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <Target size={17} color={C.coral} />
                  <div style={{ fontSize: 12, color: C.plumSoft, fontWeight: 700, flex: 1 }}><T s="なんのために [貯|た]める？" /></div>
                  <button onClick={() => setModal("goal")} style={{ border: "none", background: "transparent", color: C.plumSoft, fontWeight: 700, fontSize: 12, cursor: "pointer" }}><T s="[変|か]える" /></button>
                </div>
                <div style={{ fontFamily: "'Zen Maru Gothic',sans-serif", fontWeight: 900, fontSize: 19, marginBottom: 10 }}><T s={goal.purpose} /> <span style={{ fontFamily: "'Baloo 2',sans-serif", color: C.plumSoft, fontSize: 15 }}>{yen(goal.amount)}</span></div>
                <div style={{ height: 16, borderRadius: 999, background: "#EEEDF6", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${Math.min(100, (balance / goal.amount) * 100)}%`, background: `linear-gradient(90deg,${C.green},${C.gold})`, borderRadius: 999, transition: "width .6s" }} />
                </div>
                <div style={{ marginTop: 8, fontSize: 13, fontWeight: 700, color: balance >= goal.amount ? C.greenDark : C.plumSoft }}>
                  {balance >= goal.amount ? <T s="🎉 [目標|もくひょう] [達成|たっせい]！ [欲|ほ]しいものが [買|か]えるね" /> : <T s={`あと ${yen(goal.amount - balance)}${weeksToGoal ? `・このペースで だいたい ${weeksToGoal}[週|しゅう]` : ""}`} />}
                </div>
              </div>
            ) : (
              <button onClick={() => setModal("goal")} style={{ width: "100%", border: `2px dashed ${C.coral}66`, background: C.coral + "10", borderRadius: 20, padding: "16px", marginTop: 12, cursor: "pointer", color: C.coralDark, fontFamily: "'Zen Maru Gothic',sans-serif", fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <Target size={18} /><T s="[目標|もくひょう]を [決|き]めよう" />
              </button>
            )}

            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button onClick={() => setModal("spend")} style={actBtn(C.coral)}><ShoppingBag size={17} /><T s="[使|つか]う" /></button>
              <button onClick={() => setModal("income")} style={actBtn(C.gold)}><Gift size={17} />もらう</button>
            </div>
            <div style={{ fontSize: 11, color: C.plumSoft, fontWeight: 700, textAlign: "center", marginTop: 8 }}><T s="「[使|つか]う」「もらう」は [親|おや]の パスワードが いるよ" /></div>

            <div style={{ background: C.paper, borderRadius: 22, padding: 16, marginTop: 14, boxShadow: "0 10px 30px rgba(58,46,92,.08)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                <TrendingUp size={17} color={C.violet} />
                <div style={{ fontFamily: "'Zen Maru Gothic',sans-serif", fontWeight: 700, fontSize: 15 }}><T s="[未来|みらい] [予想|よそう]（[複利|ふくり]）" /></div>
              </div>
              <div style={{ fontSize: 12, color: C.plumSoft, fontWeight: 700, marginBottom: 14 }}><T s="[今|いま]の お[金|かね]が [複利|ふくり]で どれくらい [増|ふ]えるかな？" /></div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 13, color: C.plumSoft, fontWeight: 700 }}><T s={`${projWeeks}[週|しゅう][後|ご]は やく`} /></div>
                <div style={{ fontFamily: "'Baloo 2',sans-serif", fontWeight: 800, fontSize: 38, color: C.greenDark, letterSpacing: -1 }}>{yen(projNow)}</div>
              </div>
              <input type="range" min={1} max={52} value={projWeeks} onChange={(e) => setProjWeeks(Number(e.target.value))} aria-label="week" style={{ width: "100%", accentColor: C.violet, marginTop: 8 }} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: C.plumSoft, fontWeight: 700 }}><span><T s="1[週|しゅう][後|ご]" /></span><span><T s="52[週|しゅう][後|ご]" /></span></div>
              <div style={{ marginTop: 12, background: C.sky, borderRadius: 14, padding: "11px 12px", textAlign: "center", fontWeight: 700, fontSize: 14 }}>
                <T s="1[年|ねん][後|ご]（52[週|しゅう]）は やく " /><span style={{ fontFamily: "'Baloo 2',sans-serif", color: C.violet, fontSize: 18 }}>{yen(oneYear)}</span>
              </div>
              <div style={{ fontSize: 10.5, color: C.plumSoft, fontWeight: 700, textAlign: "center", marginTop: 8 }}><T s="※ [今|いま]の おこづかい・[利息|りそく]・[動物|どうぶつ]で [計算|けいさん]" /></div>
            </div>

            <button onClick={resetAll} style={{ width: "100%", border: "none", background: "transparent", color: C.plumSoft, fontWeight: 700, fontSize: 12, padding: 12, marginTop: 8, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5 }}><RotateCcw size={14} /><T s="[最初|さいしょ]から やり[直|なお]す" /></button>
          </>
        )}

        {tab === "animals" && (
          <>
            <IntroCard color={C.teal} icon={Bird} title={<T s="[動物|どうぶつ]は [働|はたら]いて お[金|かね]を くれる" />}>
              <T s="[動物|どうぶつ]は [毎週|まいしゅう] お[金|かね]を くれるよ。1[週間|しゅうかん] [経|た]つと ハートが 1つ [減|へ]る。ご[飯|はん]を あげると ハートが [増|ふ]える。ハートが なくなると、おなかが [減|へ]って いなくなっちゃう！" />
            </IntroCard>

            <div style={{ background: C.paper, borderRadius: 20, padding: "14px 16px", marginTop: 12, boxShadow: "0 10px 30px rgba(58,46,92,.08)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div><div style={{ fontSize: 12, color: C.plumSoft, fontWeight: 700 }}><T s="[毎週|まいしゅう] もらえる お[金|かね]" /></div>
                <div style={{ fontFamily: "'Baloo 2',sans-serif", fontWeight: 800, fontSize: 24, color: C.teal }}>+{yen(weeklyAnimalIncome)}</div></div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 26 }}>{animals.length ? animals.map((a) => ANIMALS[a.key].emoji).slice(0, 5).join("") : "🌱"}</div>
                <div style={{ fontSize: 11, color: C.plumSoft, fontWeight: 700 }}>{animals.length} / {MAX_ANIMALS} <T s="[匹|ひき]" /></div>
              </div>
            </div>

            {animals.length > 0 && (
              <SectionCard title={<T s="[育|そだ]てている [動物|どうぶつ]" />}>
                <div style={{ padding: "0 8px" }}>
                  {animals.map((a) => {
                    const d = ANIMALS[a.key]; const hungry = a.hearts <= 1;
                    const full = a.hearts >= MAX_HEARTS; const canFeed = balance >= d.feed && !full;
                    return (
                      <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 4px", borderTop: "1px solid #F1F0F8" }}>
                        <span style={{ fontSize: 30 }}>{d.emoji}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 15 }}>{d.name} <span style={{ color: C.teal, fontSize: 12 }}><T s="[毎週|まいしゅう]" />+{yen(d.income)}</span></div>
                          <div style={{ display: "flex", alignItems: "center", gap: 3, marginTop: 3 }}>
                            {Array.from({ length: MAX_HEARTS }).map((_, i) => <Heart key={i} size={13} fill={i < a.hearts ? (hungry ? C.coral : C.teal) : "none"} color={i < a.hearts ? (hungry ? C.coral : C.teal) : "#D8D5E6"} />)}
                            {hungry && <span style={{ fontSize: 11, color: C.coralDark, fontWeight: 700, marginLeft: 4 }}><T s="お[腹|なか] ぺこぺこ！" /></span>}
                          </div>
                        </div>
                        <button onClick={() => feedAnimal(a.id)} disabled={!canFeed} style={{ border: "none", borderRadius: 12, padding: "9px 12px", background: !canFeed ? "#EEE" : (hungry ? C.coral : C.violet + "1A"), color: !canFeed ? "#AAA" : (hungry ? "#fff" : C.violet), fontWeight: 700, cursor: !canFeed ? "default" : "pointer", fontSize: 12, display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 1.2 }}>
                          <span style={{ display: "flex", alignItems: "center", gap: 3 }}><Heart size={13} />{full ? <T s="[満腹|まんぷく]" /> : <T s="ご[飯|はん]" />}</span>
                          {!full && <span style={{ fontFamily: "'Baloo 2',sans-serif", fontSize: 12 }}>{yen(d.feed)}</span>}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </SectionCard>
            )}

            <SectionCard title={<T s="[動物|どうぶつ]を [買|か]う" />}>
              {animals.length >= MAX_ANIMALS && <div style={{ padding: "0 12px 8px", fontSize: 12, color: C.coralDark, fontWeight: 700 }}><T s={`もう これ[以上|いじょう] かえないよ（${MAX_ANIMALS}[匹|ひき]まで）`} /></div>}
              <div style={{ padding: "0 8px" }}>
                {Object.entries(ANIMALS).map(([k, d]) => {
                  const full = animals.length >= MAX_ANIMALS; const canBuy = balance >= d.cost && !full;
                  return (
                    <div key={k} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 4px", borderTop: "1px solid #F1F0F8" }}>
                      <span style={{ fontSize: 30 }}>{d.emoji}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 15 }}>{d.name}</div>
                        <div style={{ fontSize: 11.5, color: C.plumSoft, fontWeight: 700 }}><T s="[毎週|まいしゅう]" /> +{yen(d.income)}・<T s="ご[飯|はん]" /> {yen(d.feed)}</div>
                      </div>
                      <button onClick={() => buyAnimal(k)} disabled={!canBuy} style={{ border: "none", borderRadius: 12, padding: "9px 14px", background: !canBuy ? "#EEE" : C.teal, color: !canBuy ? "#AAA" : "#fff", fontWeight: 700, cursor: !canBuy ? "default" : "pointer", fontFamily: "'Baloo 2',sans-serif", fontSize: 14 }}>{yen(d.cost)}</button>
                    </div>
                  );
                })}
              </div>
            </SectionCard>
          </>
        )}

        {tab === "history" && (
          <>
            <IntroCard color={C.violet} icon={ScrollText} title={<T s="[積|つ]み[立|た]て [履歴|りれき]" />}>
              <T s="これまでの お[金|かね]の [動|うご]きを [全部|ぜんぶ] [見|み]られるよ。おこづかい・[利息|りそく]・[動物|どうぶつ]・[使|つか]ったお[金|かね]の [記録|きろく]。" />
            </IntroCard>

            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <Stat label={<T s="[入|い]れた" />} value={yen(totals.tin)} color={C.green} />
              <Stat label={<T s="[増|ふ]えた" />} value={yen(totals.grown)} color={C.violet} />
              <Stat label={<T s="[使|つか]った" />} value={yen(totals.out)} color={C.coral} />
            </div>

            <SectionCard title={<T s="お[金|かね]の [育|そだ]ちかた" />}>
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart data={weekly} margin={{ top: 6, right: 8, left: 8, bottom: 0 }}>
                  <defs><linearGradient id="gB" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.green} stopOpacity={0.75} /><stop offset="100%" stopColor={C.goldSoft} stopOpacity={0.15} /></linearGradient></defs>
                  <XAxis dataKey="week" tick={{ fontSize: 11, fill: C.plumSoft }} tickLine={false} axisLine={false} />
                  <YAxis hide />
                  <Tooltip formatter={(v) => [yen(v), "おかね"]} labelFormatter={(l) => `${l}しゅうめ`} contentStyle={{ borderRadius: 12, border: "none", boxShadow: "0 6px 18px rgba(0,0,0,.12)", fontFamily: "'M PLUS Rounded 1c'" }} />
                  <Area type="monotone" dataKey="balance" stroke={C.greenDark} strokeWidth={2.5} fill="url(#gB)" />
                </AreaChart>
              </ResponsiveContainer>
            </SectionCard>

            <SectionCard title={<T s="[全部|ぜんぶ]の [記録|きろく]" />}>
              <div style={{ display: "flex", gap: 6, padding: "0 10px 10px", flexWrap: "wrap" }}>
                {HIST_FILTERS.map(([lb, f]) => (
                  <button key={f} onClick={() => setHistFilter(f)} style={{ border: histFilter === f ? `2px solid ${C.plum}` : "2px solid #EDECF5", background: histFilter === f ? C.plum : "#fff", color: histFilter === f ? "#fff" : C.plum, borderRadius: 999, padding: "6px 13px", fontWeight: 700, cursor: "pointer", fontSize: 12.5 }}><T s={lb} /></button>
                ))}
              </div>
              {(() => {
                const filtered = history.filter((e) => matchFilter(e.type, histFilter));
                if (filtered.length === 0) return <Empty><T s="この [種類|しゅるい]の [記録|きろく]は ないよ" /></Empty>;
                return (
                  <div className="hist" style={{ maxHeight: 360, overflowY: "auto", padding: "0 6px" }}>
                    {filtered.map((e) => {
                      const m = LOGTYPE[e.type], Icon = m.icon;
                      return (
                        <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 8px", borderTop: "1px solid #F1F0F8" }}>
                          <span style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, background: m.color + "1A", color: m.color, display: "flex", alignItems: "center", justifyContent: "center" }}><Icon size={17} /></span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: 14 }}><T s={e.memo || m.label} /></div>
                            <div style={{ fontSize: 11, color: C.plumSoft, fontWeight: 700 }}><T s={`${e.week}[週目|しゅうめ]`} /></div>
                          </div>
                          <div style={{ fontFamily: "'Baloo 2',sans-serif", fontWeight: 800, fontSize: 15, color: m.neg ? C.coralDark : C.greenDark }}>{m.neg ? "−" : "+"}{yen(e.amount).slice(1)}</div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </SectionCard>
          </>
        )}
      </div>

      {flash.length > 0 && (
        <div className="flash" style={{ position: "fixed", top: 12, left: 0, right: 0, display: "flex", justifyContent: "center", zIndex: 60, pointerEvents: "none" }}>
          <div style={{ background: C.plum, color: "#fff", borderRadius: 16, padding: "8px 16px", fontWeight: 700, fontSize: 13, boxShadow: "0 8px 20px rgba(0,0,0,.2)", maxWidth: 420 }}>{flash.map((f, i) => <span key={i}>{i > 0 ? "　" : ""}<T s={f} /></span>)}</div>
        </div>
      )}

      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "rgba(255,255,255,.92)", backdropFilter: "blur(8px)", borderTop: "1px solid #ECEAF6", display: "flex", justifyContent: "center", padding: "8px 8px calc(8px + env(safe-area-inset-bottom))", zIndex: 40 }}>
        <div style={{ display: "flex", gap: 6, maxWidth: 460, width: "100%" }}>
          {TABS.map((t) => { const Icon = t.icon; const on = tab === t.k;
            return <button key={t.k} onClick={() => setTab(t.k)} style={{ flex: 1, border: "none", background: on ? C.plum + "0F" : "transparent", borderRadius: 14, padding: "8px 4px", cursor: "pointer", color: on ? C.plum : C.plumSoft, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, fontFamily: "'Zen Maru Gothic',sans-serif", fontWeight: 700, fontSize: 11.5 }}><Icon size={20} /><T s={t.label} /></button>;
          })}
        </div>
      </div>

      {modal === "spend" && <EntrySheet title={<T s="[使|つか]う" />} color={C.coral} presets={[100, 300, 500, 1000]} memos={SPEND_MEMOS} max={balance} confirmLabel={<T s="[親|おや]に かくにん" />} onClose={() => setModal(null)} onCommit={(a, m) => { setModal(null); requirePin({ kind: "withdraw", amount: a, memo: m || "[使|つか]った" }); }} />}
      {modal === "income" && <EntrySheet title={<T s="お[金|かね]を もらう" />} color={C.gold} presets={[500, 1000, 3000, 5000]} memos={INCOME_MEMOS} confirmLabel={<T s="[親|おや]に かくにん" />} onClose={() => setModal(null)} onCommit={(a, m) => { setModal(null); requirePin({ kind: "gift", amount: a, memo: m || "もらった お[金|かね]" }); }} />}
      {modal === "goal" && <GoalSheet current={goal} onClose={() => setModal(null)} onSave={(g) => { setGoal(g); setModal(null); }} onClear={() => { setGoal(null); setModal(null); }} />}
      {(modal === "pinCreate" || modal === "pinEnter") && <PinPad mode={modal === "pinCreate" ? "create" : "enter"} expect={pin} onClose={() => { setModal(null); setPending(null); }} onDone={onPinDone} />}
    </div>
    </LevelCtx.Provider>
  );
}

const actBtn = (c) => ({ flex: 1, border: "none", borderRadius: 16, padding: "13px", color: c, background: "#fff", boxShadow: "0 6px 16px rgba(58,46,92,.10)", cursor: "pointer", fontFamily: "'Zen Maru Gothic',sans-serif", fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 });
function Segmented({ value, onChange }) {
  return <div style={{ display: "flex", gap: 6 }}>
    {PERIODS.map(([lb, n]) => <button key={n} onClick={() => onChange(n)} style={{ flex: 1, border: value === n ? `2px solid ${C.green}` : "2px solid #EDECF5", background: value === n ? C.green + "14" : "#fff", color: C.plum, borderRadius: 12, padding: "9px 4px", fontWeight: 700, cursor: "pointer", fontSize: 12.5 }}><T s={lb} /></button>)}
  </div>;
}
function Stat({ label, value, color }) {
  return <div style={{ flex: 1, background: "#FBFBFF", borderRadius: 14, padding: "9px 4px", border: "1px solid #EFEEF7" }}>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, fontSize: 11, color: C.plumSoft, fontWeight: 700 }}><span style={{ width: 8, height: 8, borderRadius: 3, background: color }} />{label}</div>
    <div style={{ fontFamily: "'Baloo 2',sans-serif", fontWeight: 800, fontSize: 15, marginTop: 2 }}>{value}</div>
  </div>;
}
function StepBtn({ children, onClick }) { return <button onClick={onClick} style={{ width: 44, height: 44, borderRadius: 12, border: "none", background: C.sky, color: C.plum, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>{children}</button>; }
function Big({ children }) { return <div style={{ flex: 1, textAlign: "center", fontFamily: "'Baloo 2','Zen Maru Gothic',sans-serif", fontWeight: 800, fontSize: 22 }}>{children}</div>; }
function Row({ children }) { return <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>{children}</div>; }
function PanelLabel({ children }) { return <div style={{ fontSize: 12, color: C.plumSoft, fontWeight: 700, marginBottom: 6 }}>{children}</div>; }
function SectionCard({ title, children }) {
  return <div style={{ background: C.paper, borderRadius: 22, padding: "14px 6px 8px", marginTop: 14, boxShadow: "0 10px 30px rgba(58,46,92,.08)" }}>
    <div style={{ fontFamily: "'Zen Maru Gothic',sans-serif", fontWeight: 700, fontSize: 15, padding: "0 12px 8px" }}>{title}</div>{children}
  </div>;
}
function Empty({ children }) { return <div style={{ padding: "16px 12px 22px", textAlign: "center", color: C.plumSoft, fontSize: 13, fontWeight: 700 }}>{children}</div>; }
function IntroCard({ color, icon: Icon, title, children }) {
  return <div style={{ background: color + "12", borderRadius: 20, padding: 16, display: "flex", gap: 12 }}>
    <span style={{ width: 40, height: 40, borderRadius: 12, background: "#fff", color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon size={20} /></span>
    <div><div style={{ fontFamily: "'Zen Maru Gothic',sans-serif", fontWeight: 900, fontSize: 15, marginBottom: 3 }}>{title}</div>
      <div style={{ fontSize: 12.5, color: C.plum, fontWeight: 500, lineHeight: 1.7 }}>{children}</div></div>
  </div>;
}
function Backdrop({ children, onClose }) {
  return <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(58,46,92,.45)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 70 }}>
    <div className="sheet-in" onClick={(e) => e.stopPropagation()} style={{ background: "#fff", width: "100%", maxWidth: 460, borderRadius: "26px 26px 0 0", padding: "18px 18px 26px" }}>{children}</div>
  </div>;
}
function EntrySheet({ title, color, presets, memos, max, confirmLabel, onClose, onCommit }) {
  const [amount, setAmount] = useState(presets[1]);
  const [memo, setMemo] = useState("");
  const over = max != null && amount > max;
  return <Backdrop onClose={onClose}>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
      <div style={{ fontFamily: "'Zen Maru Gothic',sans-serif", fontWeight: 900, fontSize: 19, color }}>{title}</div>
      <button onClick={onClose} aria-label="close" style={{ border: "none", background: "#F1F0F8", borderRadius: 10, width: 34, height: 34, cursor: "pointer", color: C.plum, display: "flex", alignItems: "center", justifyContent: "center" }}><X size={18} /></button>
    </div>
    <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "center", marginBottom: 12 }}>
      <StepBtn onClick={() => setAmount((a) => Math.max(0, a - 50))}><Minus size={20} /></StepBtn>
      <input type="number" value={amount} min={0} onChange={(e) => setAmount(Math.max(0, Number(e.target.value) || 0))} style={{ width: 150, textAlign: "center", border: "none", borderBottom: `3px solid ${color}`, fontFamily: "'Baloo 2',sans-serif", fontWeight: 800, fontSize: 34, color: C.plum, background: "transparent", outline: "none", padding: "2px 0" }} />
      <StepBtn onClick={() => setAmount((a) => a + 50)}><Plus size={20} /></StepBtn>
    </div>
    <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginBottom: 14 }}>
      {presets.map((p) => <button key={p} onClick={() => setAmount(p)} style={{ border: amount === p ? `2px solid ${color}` : "2px solid #EDECF5", background: amount === p ? color + "14" : "#fff", color: C.plum, borderRadius: 12, padding: "8px 14px", fontWeight: 700, cursor: "pointer", fontFamily: "'Baloo 2',sans-serif", fontSize: 15 }}>¥{p.toLocaleString("ja-JP")}</button>)}
    </div>
    {memos && <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginBottom: 16 }}>
      {memos.map((m) => <button key={m} onClick={() => setMemo(m)} style={{ border: memo === m ? `2px solid ${C.plum}` : "2px solid #EDECF5", background: memo === m ? C.sky : "#fff", color: C.plum, borderRadius: 999, padding: "7px 14px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}><T s={m} /></button>)}
    </div>}
    {over && <div style={{ textAlign: "center", color: C.coralDark, fontWeight: 700, fontSize: 13, marginBottom: 10 }}><T s={`お[金|かね]が たりないよ（[今|いま]は ${yen(max)}）`} /></div>}
    <button onClick={() => onCommit(amount, memo)} disabled={amount <= 0 || over} style={{ width: "100%", border: "none", borderRadius: 16, padding: 15, fontFamily: "'Zen Maru Gothic',sans-serif", fontWeight: 700, fontSize: 17, color: "#fff", cursor: amount <= 0 || over ? "default" : "pointer", background: amount <= 0 || over ? "#C7C2DB" : color }}>{confirmLabel || "きろくする"}</button>
  </Backdrop>;
}
function GoalSheet({ current, onClose, onSave, onClear }) {
  const [purpose, setPurpose] = useState(current?.purpose || "");
  const [amount, setAmount] = useState(current?.amount || 3000);
  return <Backdrop onClose={onClose}>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
      <div style={{ fontFamily: "'Zen Maru Gothic',sans-serif", fontWeight: 900, fontSize: 19, color: C.coral }}><T s="[目標|もくひょう]を [決|き]める" /></div>
      <button onClick={onClose} aria-label="close" style={{ border: "none", background: "#F1F0F8", borderRadius: 10, width: 34, height: 34, cursor: "pointer", color: C.plum, display: "flex", alignItems: "center", justifyContent: "center" }}><X size={18} /></button>
    </div>
    <PanelLabel><T s="なんのために [貯|た]める？" /></PanelLabel>
    <input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="れい：あたらしい ゲーム" style={{ width: "100%", border: "2px solid #EDECF5", borderRadius: 14, padding: "12px 14px", fontSize: 15, fontFamily: "'M PLUS Rounded 1c'", marginBottom: 10, outline: "none", color: C.plum }} />
    <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 16 }}>
      {GOAL_MEMOS.map((m) => <button key={m} onClick={() => setPurpose(m)} style={{ border: purpose === m ? `2px solid ${C.coral}` : "2px solid #EDECF5", background: purpose === m ? C.coral + "12" : "#fff", color: C.plum, borderRadius: 999, padding: "7px 13px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>{m}</button>)}
    </div>
    <PanelLabel><T s="いくら [貯|た]める？" /></PanelLabel>
    <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "center", marginBottom: 18 }}>
      <StepBtn onClick={() => setAmount((a) => Math.max(0, a - 500))}><Minus size={20} /></StepBtn>
      <div style={{ fontFamily: "'Baloo 2',sans-serif", fontWeight: 800, fontSize: 30, color: C.plum, width: 130, textAlign: "center" }}>{yen(amount)}</div>
      <StepBtn onClick={() => setAmount((a) => a + 500)}><Plus size={20} /></StepBtn>
    </div>
    <button onClick={() => onSave({ purpose: purpose.trim() || "ほしいもの", amount })} disabled={amount <= 0} style={{ width: "100%", border: "none", borderRadius: 16, padding: 15, fontFamily: "'Zen Maru Gothic',sans-serif", fontWeight: 700, fontSize: 17, color: "#fff", background: amount <= 0 ? "#C7C2DB" : C.coral, cursor: amount <= 0 ? "default" : "pointer" }}><T s="[決|き]める" /></button>
    {current && <button onClick={onClear} style={{ width: "100%", border: "none", background: "transparent", color: C.plumSoft, fontWeight: 700, padding: 12, marginTop: 4, cursor: "pointer" }}><T s="[目標|もくひょう]を [消|け]す" /></button>}
  </Backdrop>;
}
function PinPad({ mode, expect, onClose, onDone }) {
  const [buf, setBuf] = useState(""); const [err, setErr] = useState(false);
  function push(d) {
    if (buf.length >= 4) return;
    const nb = buf + d; setBuf(nb); setErr(false);
    if (nb.length === 4) setTimeout(() => { if (mode === "enter" && nb !== expect) { setErr(true); setBuf(""); } else onDone(nb); }, 120);
  }
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"];
  return <Backdrop onClose={onClose}>
    <div style={{ textAlign: "center" }}>
      <Lock size={26} color={C.plum} />
      <div style={{ fontFamily: "'Zen Maru Gothic',sans-serif", fontWeight: 900, fontSize: 18, marginTop: 6 }}>{mode === "create" ? "4けたの パスワードを つくる" : <T s="[親|おや]の パスワードを [入|い]れてね" />}</div>
      <div style={{ display: "flex", gap: 12, justifyContent: "center", margin: "18px 0" }}>{[0, 1, 2, 3].map((i) => <div key={i} style={{ width: 16, height: 16, borderRadius: "50%", background: i < buf.length ? C.plum : "#E4E2F0", transition: "background .15s" }} />)}</div>
      {err && <div style={{ color: C.coralDark, fontWeight: 700, fontSize: 13, marginBottom: 10 }}><T s="ちがうよ。もう[一回|いっかい]" /></div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, maxWidth: 260, margin: "0 auto" }}>
        {keys.map((k, i) => k === "" ? <div key={i} /> : <button key={i} onClick={() => (k === "del" ? setBuf((b) => b.slice(0, -1)) : push(k))} style={{ height: 58, borderRadius: 16, border: "none", background: k === "del" ? "transparent" : "#F4F3FA", color: C.plum, fontFamily: "'Baloo 2',sans-serif", fontWeight: 800, fontSize: 22, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>{k === "del" ? <Delete size={22} /> : k}</button>)}
      </div>
    </div>
  </Backdrop>;
}
