import { useState, useRef, useCallback, useEffect } from "react";
import { useDatabase } from "./useDatabase";

/* ══════════════════════════════════════════════════════════════
   SCHEMAS — 1:1 match amb Proposta_de_taules_V2.xlsx
   ══════════════════════════════════════════════════════════════ */
const SCHEMAS = {
  productes: {
    label: "Productes", icon: "📦", voice: true,
    fields: [
      { key: "producte",          label: "Producte",                   type: "text",   req: true },
      { key: "grup",              label: "Grup",                       type: "text" },
      { key: "unitats_per_palet", label: "Unitats per palet",          type: "number" },
      { key: "caixes_per_palet",  label: "Caixes per palet",           type: "number" },
      { key: "unitats_per_caixa", label: "Unitats per caixa",          type: "number" },
      { key: "kg_massa_palet",    label: "Kg massa / palet",           type: "number" },
      { key: "codi_massa",        label: "Codi massa",                 type: "text" },
      { key: "kg_farcit_palet",   label: "Kg farcit / palet",          type: "number" },
      { key: "codi_farcit",       label: "Codi farcit",                type: "text" },
      { key: "dies_permesos",     label: "Dies permesos (Dll-Dm-Dc)",  type: "text" },
      { key: "incompatible_amb",  label: "Incompatible amb (llista)",   type: "text" },
      { key: "comentaris",        label: "Comentaris",                 type: "text" },
    ],
  },
  recepta: {
    label: "Recepta", icon: "🧪", voice: true,
    fields: [
      { key: "producte",                label: "Producte",             type: "text",   req: true },
      { key: "codi_farcit",             label: "Codi farcit",          type: "text" },
      { key: "grams_per_unitat_farcit", label: "Grams/unitat farcit",  type: "number" },
      { key: "merma_farcit",            label: "Merma farcit",         type: "number" },
      { key: "codi_massa",              label: "Codi massa",           type: "text" },
      { key: "grams_per_unit_massa",    label: "Grams/unitat massa",   type: "number" },
      { key: "merma_massa",             label: "Merma massa",          type: "number" },
      { key: "comentaris",              label: "Comentaris",           type: "text" },
    ],
  },
  farcit: {
    label: "Farcit", icon: "🍫", voice: true,
    fields: [
      { key: "codi_nom_mp",       label: "Codi / Nom Materia Prima",  type: "text",   req: true },
      { key: "grams_per_unitat",   label: "Grams per unitat",          type: "number" },
      { key: "merma",              label: "Merma",                     type: "number" },
    ],
  },
  linies: {
    label: "Línies", icon: "🏭", voice: true,
    fields: [
      { key: "linia",             label: "Línia",                      type: "text",   req: true },
      { key: "tipus",             label: "Tipus (màquina/procés)",     type: "text" },
      { key: "descripcio",        label: "Descripció",                 type: "text" },
      { key: "temps_preparacio",  label: "Temps de preparació",        type: "number" },
      { key: "temps_neteja",      label: "Temps neteja",               type: "number" },
      { key: "temps_espera",      label: "Temps espera reutilització", type: "number" },
      { key: "comentaris",        label: "Comentaris",                 type: "text" },
    ],
  },
  flux: {
    label: "Flux", icon: "🔄", voice: true,
    fields: [
      { key: "producte",             label: "Producte",                    type: "text",   req: true },
      { key: "dia",                  label: "Dia",                         type: "number" },
      { key: "linia",                label: "Línia",                       type: "text" },
      { key: "temps_per_kg",         label: "Temps per kg",                type: "number" },
      { key: "persones_necessaries", label: "Persones necessàries",        type: "number" },
      { key: "perfils_de_persona",   label: "Perfils de persona",          type: "text" },
      { key: "es_pot_parar",         label: "Es pot parar (sí/no)",        type: "select", options: ["Sí", "No"] },
      { key: "prerequisits",         label: "Prerequisits (línies prèvies)", type: "text" },
      { key: "comentaris",           label: "Comentaris",                  type: "text" },
    ],
  },
  torns: {
    label: "Torns", icon: "🕐", voice: false,
    fields: [
      { key: "persona",          label: "Persona",          type: "text",   req: true },
      { key: "torn",             label: "Torn",             type: "text" },
      { key: "hora_inici",       label: "Hora inici",       type: "text",   placeholder: "06:00" },
      { key: "hora_fi",          label: "Hora fi",          type: "text",   placeholder: "14:00" },
      { key: "actiu",            label: "Actiu (sí/no)",    type: "select", options: ["Sí", "No"] },
      { key: "tipus_personal",   label: "Tipus personal",   type: "text" },
      { key: "descans",          label: "Descans",          type: "text" },
    ],
  },
};

const CASCADE = ["productes", "recepta", "farcit", "linies", "flux"];

/* ══════════════════════════════════════════════════════════════
   ENTITY RESOLUTION — normalitza noms proposats contra la BD
   ══════════════════════════════════════════════════════════════ */

const normalizeStr = s =>
  String(s || '').trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')

const singularize = s => {
  if (s.endsWith('es') && s.length > 4) return s.slice(0, -2)
  if (s.endsWith('s') && s.length > 3) return s.slice(0, -1)
  return s
}

const levenshtein = (a, b) => {
  if (Math.abs(a.length - b.length) > 3) return 99
  const m = a.length, n = b.length
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0)
  )
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
  return dp[m][n]
}

const fuzzyMatch = (a, b) => {
  const na = normalizeStr(a), nb = normalizeStr(b)
  if (!na || !nb) return false
  if (na === nb) return true
  if (singularize(na) === singularize(nb)) return true
  if (na.length >= 4 && nb.length >= 4 && levenshtein(na, nb) <= 2) return true
  return false
}

// Taules que defineixen entitats i les taules que les referencien
const ENTITY_DEFS = [
  {
    table: 'productes', keyField: 'producte',
    refs: [{ table: 'recepta', field: 'producte' }, { table: 'flux', field: 'producte' }],
  },
  {
    table: 'linies', keyField: 'linia',
    refs: [{ table: 'flux', field: 'linia' }],
  },
  {
    table: 'farcit', keyField: 'codi_nom_mp',
    refs: [],
  },
]

// Taules secundàries: com detectar si una fila ja existeix
const SECONDARY_CHECKS = [
  {
    table: 'recepta',
    matchFn: (row, existing) => fuzzyMatch(row.producte, existing.producte),
  },
  {
    table: 'flux',
    matchFn: (row, existing) =>
      fuzzyMatch(row.producte, existing.producte) && String(row.dia) === String(existing.dia),
  },
]

function resolveCanonicalNames(parsed, dbData) {
  const resolved = JSON.parse(JSON.stringify(parsed))
  const changeLog = [] // { from, to, table }

  for (const { table, keyField, refs } of ENTITY_DEFS) {
    const existing = dbData[table] || []
    const mapping = {} // normalizeStr(proposedVal) → { canonical, existingId }

    if (resolved[table]?.length) {
      resolved[table] = resolved[table].map(row => {
        const val = row[keyField]
        if (!val) return { ...row, _action: 'insert', _existingId: null }

        const match = existing.find(e => fuzzyMatch(val, e[keyField]))
        if (match) {
          const canonical = match[keyField]
          if (normalizeStr(canonical) !== normalizeStr(val)) {
            changeLog.push({ from: val, to: canonical, table })
          }
          mapping[normalizeStr(val)] = { canonical, existingId: match.id }
          return { ...row, [keyField]: canonical, _action: 'update', _existingId: match.id }
        }
        mapping[normalizeStr(val)] = { canonical: val, existingId: null }
        return { ...row, _action: 'insert', _existingId: null }
      })
    }

    // Propaga el nom canònic a les taules que el referencien
    for (const ref of refs) {
      if (!resolved[ref.table]?.length) continue
      resolved[ref.table] = resolved[ref.table].map(row => {
        const refVal = row[ref.field]
        if (!refVal) return row
        const mapped = mapping[normalizeStr(refVal)]
        if (mapped) return { ...row, [ref.field]: mapped.canonical }
        const directMatch = existing.find(e => fuzzyMatch(refVal, e[keyField]))
        if (directMatch) return { ...row, [ref.field]: directMatch[keyField] }
        return row
      })
    }
  }

  // Marca les files de taules secundàries com a insert o update
  for (const { table, matchFn } of SECONDARY_CHECKS) {
    if (!resolved[table]?.length) continue
    resolved[table] = resolved[table].map(row => {
      if (row._action) return row
      const match = (dbData[table] || []).find(e => matchFn(row, e))
      if (match) return { ...row, _action: 'update', _existingId: match.id }
      return { ...row, _action: 'insert', _existingId: null }
    })
  }

  return { resolved, changeLog }
}

const SYS_PROMPT = `Ets un assistent expert en producció alimentària industrial. Extreus dades estructurades de dictats de veu en català o castellà.

L'usuari dicta informació sobre UN PRODUCTE. Has d'extreure i distribuir les dades en MÚLTIPLES TAULES.

══ TAULES I CAMPS EXACTES ══

1. PRODUCTES (1 fila per producte):
   producte, grup, unitats_per_palet, caixes_per_palet, unitats_per_caixa, kg_massa_palet, codi_massa, kg_farcit_palet, codi_farcit, dies_permesos, incompatible_amb, comentaris

2. RECEPTA (1 fila per producte — relació massa+farcit):
   producte, codi_farcit, grams_per_unitat_farcit, merma_farcit, codi_massa, grams_per_unit_massa, merma_massa, comentaris

3. FARCIT (1 fila per matèria primera de farcit):
   codi_nom_mp, grams_per_unitat, merma

4. LÍNIES (NOMÉS línies/màquines NO existents):
   linia, tipus, descripcio, temps_preparacio, temps_neteja, temps_espera, comentaris
   → Línies ja existents al sistema: {{EXISTING_LINES}}
   → Si la línia ja existeix, NO la incloguis.

5. FLUX (1 fila per pas de fabricació, ordenat):
   producte, dia (número d'ordre: 1,2,3...), linia, temps_per_kg, persones_necessaries, perfils_de_persona, es_pot_parar (Sí/No), prerequisits, comentaris

══ REGLES ══
- Retorna ÚNICAMENT un objecte JSON vàlid. Cap markdown, cap backtick, cap text extra.
- Format exacte: {"productes":[...],"recepta":[...],"farcit":[...],"linies":[...],"flux":[...]}
- Usa exactament les claus especificades (case-sensitive, minúscules amb guions baixos).
- Converteix números parlats a xifres (vint-i-cinc → 25).
- Dies: Dll=Dilluns, Dm=Dimarts, Dc=Dimecres, Dj=Dijous, Dv=Divendres, Ds=Dissabte, Dg=Diumenge. Format: "Dll-Dm-Dc"
- Si una taula no té informació → array buit [].
- El nom de producte ha de ser EXACTAMENT igual a totes les taules.
- Al flux, numera "dia" seqüencialment: 1, 2, 3...
- Mermes en percentatge (ex: 3 = 3%).`;

/* ═══ Colors ═══ */
const C = {
  bg: "#0A0E13", s1: "#111820", s2: "#19212D", s3: "#212C3A",
  b1: "#28374A", b2: "#3A5068",
  t1: "#E6EDF5", t2: "#94A3B5", t3: "#637486",
  ac: "#3B8EEA", acD: "#142D52",
  r: "#EF4444", rD: "#2C1215", g: "#22C55E", gD: "#0F2918",
  o: "#EAB308", oD: "#2A2006", p: "#A78BFA",
};

const Btn = ({ children, style, ...props }) => (
  <button {...props} style={{
    borderRadius: 6, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", fontSize: 12,
    display: "flex", alignItems: "center", gap: 6, ...style,
  }}>{children}</button>
);

export default function App() {
  const { data, loading, insertRows, mergeRow, updateCell, deleteRow: dbDelete, reload } = useDatabase();

  const [act, setAct] = useState("productes");
  const [isRec, setIsRec] = useState(false);
  const [txt, setTxt] = useState("");
  const [interim, setInterim] = useState("");
  const [parsing, setParsing] = useState(false);
  const [pend, setPend] = useState(null);
  const [stat, setStat] = useState("");
  const [sb, setSb] = useState(true);
  const [ec, setEc] = useState(null);
  const [ev, setEv] = useState("");
  const [mr, setMr] = useState(null);
  const [pvt, setPvt] = useState("productes");
  const [changeLog, setChangeLog] = useState([]);
  const rRef = useRef(null);
  const eRef = useRef(null);

  const sc = SCHEMAS[act];
  const isV = sc.voice;
  const pTabs = pend ? CASCADE.filter(t => pend[t]?.length > 0) : [];

  useEffect(() => { if (ec && eRef.current) { eRef.current.focus(); eRef.current.select(); } }, [ec]);

  /* ─── Speech ─── */
  const startRec = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setStat("⚠️ Usa Chrome per reconeixement de veu."); return; }
    const r = new SR(); r.lang = "ca-ES"; r.continuous = true; r.interimResults = true;
    let acc = "";
    r.onresult = e => {
      let im = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) acc += e.results[i][0].transcript + " ";
        else im += e.results[i][0].transcript;
      }
      setTxt(acc); setInterim(im);
    };
    r.onerror = e => { if (e.error !== "no-speech") setStat(`Error de veu: ${e.error}`); };
    r.onend = () => setIsRec(false);
    rRef.current = r; r.start();
    setIsRec(true); setTxt(""); setInterim(""); setPend(null);
    setStat("🎙️ Escoltant... Descriu el producte complet.");
  }, []);

  const stopRec = useCallback(() => { rRef.current?.stop(); setIsRec(false); setInterim(""); }, []);

  /* ─── AI Parse ─── */
  const parseVoice = useCallback(async () => {
    const text = txt.trim();
    if (!text) { setStat("No hi ha text."); return; }
    setParsing(true); setStat("🤖 Processant amb IA...");

    const existingLines = data.linies.map(l => l.linia).filter(Boolean).join(", ") || "(cap)";
    const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;

    if (!apiKey) {
      setStat("❌ Falta VITE_ANTHROPIC_API_KEY a les variables d'entorn.");
      setParsing(false);
      return;
    }

    try {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514", max_tokens: 2048,
          system: SYS_PROMPT.replace("{{EXISTING_LINES}}", existingLines),
          messages: [{ role: "user", content: text }],
        }),
      });
      const res = await resp.json();
      if (res.error) throw new Error(res.error.message);

      const raw = res.content?.map(c => c.type === "text" ? c.text : "").join("").replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(raw);

      const { resolved, changeLog: changes } = resolveCanonicalNames(parsed, data);

      const total = CASCADE.reduce((s, t) => s + (resolved[t]?.length || 0), 0);
      if (!total) {
        setStat("No s'han pogut extreure dades. Prova amb més detall.");
      } else {
        setPend(resolved);
        setChangeLog(changes);
        setPvt(CASCADE.find(t => resolved[t]?.length > 0) || "productes");
        const summary = CASCADE.filter(t => resolved[t]?.length > 0)
          .map(t => `${SCHEMAS[t].icon} ${SCHEMAS[t].label}: ${resolved[t].length}`)
          .join("  ·  ");
        setStat(`✅ ${summary}  — Revisa i confirma.`);
      }
    } catch (err) {
      console.error(err);
      setStat(`❌ Error: ${err.message}`);
    } finally { setParsing(false); }
  }, [txt, data.linies]);

  /* ─── Confirm pending (save to DB) ─── */
  const confirmAll = useCallback(async () => {
    setStat("💾 Guardant a la base de dades...");
    let nInserted = 0, nUpdated = 0, nErrors = 0;

    for (const t of CASCADE) {
      const rows = pend[t] || [];
      if (!rows.length) continue;

      const toInsert = rows.filter(r => r._action !== 'update');
      const toUpdate = rows.filter(r => r._action === 'update' && r._existingId);

      if (toInsert.length) {
        const inserted = await insertRows(t, toInsert);
        nInserted += inserted.length;
        if (inserted.length < toInsert.length) nErrors += toInsert.length - inserted.length;
      }

      for (const row of toUpdate) {
        const merged = await mergeRow(t, row._existingId, row);
        if (merged !== null) nUpdated++;
        else nErrors++;
      }
    }

    setPend(null); setTxt(""); setChangeLog([]);
    const parts = [];
    if (nInserted) parts.push(`${nInserted} nous`);
    if (nUpdated) parts.push(`${nUpdated} actualitzats`);
    const errTxt = nErrors ? `  ⚠️ ${nErrors} errors (consola)` : '';
    setStat(`✅ ${parts.join(' · ') || 'Sense canvis nous'}${errTxt}`);
  }, [pend, insertRows, mergeRow]);

  const editPendCell = (table, ri, key) => {
    const val = prompt(`Editar "${key}":`, pend[table][ri][key] ?? "");
    if (val !== null) {
      setPend(prev => {
        const copy = { ...prev, [table]: [...prev[table]] };
        copy[table][ri] = { ...copy[table][ri], [key]: val };
        return copy;
      });
    }
  };

  const removePendRow = (table, ri) => {
    setPend(prev => ({ ...prev, [table]: prev[table].filter((_, i) => i !== ri) }));
  };

  /* ─── Manual row (Torns) ─── */
  const openManual = () => {
    const row = {}; sc.fields.forEach(f => row[f.key] = ""); setMr(row);
  };
  const saveManual = async () => {
    await insertRows(act, [mr]);
    setMr(null); setStat(`✅ Registre afegit a ${sc.label}.`);
  };

  /* ─── Inline edit ─── */
  const startEdit = (ri, key, val) => { setEc({ ri, key }); setEv(val ?? ""); };
  const commitEdit = async () => {
    if (!ec) return;
    const row = data[act][ec.ri];
    await updateCell(act, row.id, ec.key, ev);
    setEc(null);
  };
  const handleDelete = async (idx) => {
    const row = data[act][idx];
    await dbDelete(act, row.id);
  };

  /* ─── Export ─── */
  const exportJSON = () => {
    const clean = {};
    Object.entries(data).forEach(([k, rows]) => {
      clean[k] = rows.map(r => {
        const o = { ...r }; delete o.id; delete o.created_at; return o;
      });
    });
    const blob = new Blob([JSON.stringify(clean, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = "production_data.json"; a.click();
  };
  const exportCSV = () => {
    const rows = data[act]; if (!rows.length) return;
    const keys = sc.fields.map(f => f.key);
    const lines = [keys.join(";"), ...rows.map(r => keys.map(k => `"${String(r[k] ?? "").replace(/"/g, '""')}"`).join(";"))];
    const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `${act}.csv`; a.click();
  };

  const totalRows = Object.values(data).reduce((s, a) => s + a.length, 0);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: C.bg, color: C.t2, fontFamily: "monospace" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>🏭</div>
          <div>Carregant dades...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      display: "flex", height: "100vh", background: C.bg, color: C.t1,
      fontFamily: "'IBM Plex Mono', 'SF Mono', 'Fira Code', monospace", fontSize: 13,
    }}>
      {/* ═══ SIDEBAR ═══ */}
      <aside style={{
        width: sb ? 234 : 54, background: C.s1, borderRight: `1px solid ${C.b1}`,
        transition: "width 0.2s ease", display: "flex", flexDirection: "column", flexShrink: 0, overflow: "hidden",
      }}>
        <div onClick={() => setSb(!sb)} style={{
          padding: sb ? "14px 16px" : "14px 15px", borderBottom: `1px solid ${C.b1}`,
          display: "flex", alignItems: "center", gap: 10, cursor: "pointer", userSelect: "none",
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.ac} strokeWidth="2" strokeLinecap="round">
            <path d="M3 12h18M3 6h18M3 18h18" />
          </svg>
          {sb && <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: C.ac }}>Producció</span>}
        </div>

        <nav style={{ flex: 1, padding: "6px 0", overflowY: "auto" }}>
          {Object.entries(SCHEMAS).map(([key, s]) => {
            const active = key === act; const count = data[key].length;
            return (
              <div key={key}
                onClick={() => { setAct(key); setPend(null); setTxt(""); setEc(null); setMr(null); setStat(""); }}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: sb ? "10px 16px" : "10px 15px", cursor: "pointer",
                  background: active ? C.acD : "transparent",
                  borderLeft: active ? `3px solid ${C.ac}` : "3px solid transparent",
                }}>
                <span style={{ fontSize: 17, flexShrink: 0 }}>{s.icon}</span>
                {sb && <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: active ? 600 : 400, color: active ? C.ac : C.t1 }}>{s.label}</div>
                  <div style={{ fontSize: 10, color: C.t3 }}>{count > 0 ? `${count} reg.` : s.voice ? "← veu" : "manual"}</div>
                </div>}
              </div>
            );
          })}
        </nav>

        {sb && <div style={{ padding: 14, borderTop: `1px solid ${C.b1}` }}>
          <div style={{ fontSize: 10, color: C.t3, marginBottom: 8 }}>{totalRows} registres totals</div>
          <Btn onClick={exportJSON} style={{ width: "100%", padding: 7, background: C.s2, border: `1px solid ${C.b1}`, color: C.t2, fontSize: 10, justifyContent: "center", marginBottom: 4 }}>⬇ Exportar tot (JSON)</Btn>
          <Btn onClick={exportCSV} style={{ width: "100%", padding: 7, background: C.s2, border: `1px solid ${C.b1}`, color: C.t2, fontSize: 10, justifyContent: "center" }}>⬇ {sc.label} (CSV)</Btn>
        </div>}
      </aside>

      {/* ═══ MAIN ═══ */}
      <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>

        {/* Header */}
        <header style={{ padding: "16px 24px", borderBottom: `1px solid ${C.b1}`, display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ fontSize: 28 }}>{sc.icon}</span>
          <div style={{ flex: 1 }}>
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{sc.label}</h1>
            <p style={{ margin: 0, fontSize: 11, color: C.t3 }}>
              {sc.fields.length} camps · {data[act].length} registres
              {isV && <span style={{ color: C.p, marginLeft: 10 }}>🎙 Veu</span>}
              {!isV && <span style={{ color: C.o, marginLeft: 10 }}>✏️ Manual</span>}
            </p>
          </div>
        </header>

        {/* ═══ VOICE PANEL ═══ */}
        {act === "productes" && (
          <section style={{ padding: "16px 24px", borderBottom: `1px solid ${C.b1}`, background: C.s1 }}>
            <p style={{ margin: "0 0 12px", fontSize: 11, color: C.t2, lineHeight: 1.7 }}>
              🎙️ <strong style={{ color: C.t1 }}>Dicta tota la informació del producte d'un cop.</strong>{" "}
              La IA distribuirà a{" "}
              {CASCADE.map((t, i) => (
                <span key={t}><span style={{ color: C.ac }}>{SCHEMAS[t].icon} {SCHEMAS[t].label}</span>{i < CASCADE.length - 1 ? " · " : ""}</span>
              ))}
            </p>

            <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}>
              {!isRec ? (
                <Btn onClick={startRec} style={{ padding: "9px 22px", background: `linear-gradient(135deg, ${C.r}, #DC2626)`, border: "none", color: "#fff" }}>⏺ Gravar veu</Btn>
              ) : (
                <Btn onClick={stopRec} style={{ padding: "9px 22px", background: C.rD, border: `2px solid ${C.r}`, color: C.r, animation: "pulse 1.5s infinite" }}>⏹ Aturar</Btn>
              )}
              <Btn onClick={parseVoice} disabled={!txt.trim() || parsing}
                style={{
                  padding: "9px 22px",
                  background: txt.trim() && !parsing ? C.acD : C.s2,
                  border: `1px solid ${txt.trim() && !parsing ? C.ac : C.b1}`,
                  color: txt.trim() && !parsing ? C.ac : C.t3,
                  cursor: txt.trim() && !parsing ? "pointer" : "not-allowed",
                }}>
                {parsing ? "⏳ Processant..." : "🤖 Processar → Totes les taules"}
              </Btn>
            </div>

            {(txt || interim || isRec) && (
              <div style={{ padding: 12, background: C.bg, borderRadius: 8, border: `1px solid ${isRec ? C.r : C.b1}`, fontSize: 12, lineHeight: 1.7, minHeight: 40, position: "relative" }}>
                {isRec && <span style={{ position: "absolute", top: 10, right: 12, width: 9, height: 9, background: C.r, borderRadius: "50%", animation: "pulse 1s infinite" }} />}
                <span>{txt}</span><span style={{ color: C.t3, fontStyle: "italic" }}>{interim}</span>
                {!txt && !interim && <span style={{ color: C.t3 }}>Esperant veu...</span>}
              </div>
            )}

            {txt && !isRec && (
              <textarea value={txt} onChange={e => setTxt(e.target.value)}
                style={{ width: "100%", marginTop: 8, padding: 10, background: C.bg, border: `1px solid ${C.b1}`, borderRadius: 8, color: C.t1, fontSize: 12, fontFamily: "inherit", resize: "vertical", minHeight: 50, boxSizing: "border-box" }}
                placeholder="Pots editar el text manualment..." />
            )}

            {stat && <div style={{ marginTop: 10, fontSize: 11, lineHeight: 1.5, color: stat.includes("❌") ? C.r : stat.includes("✅") ? C.g : C.o }}>{stat}</div>}
          </section>
        )}

        {isV && act !== "productes" && (
          <div style={{ padding: "12px 24px", borderBottom: `1px solid ${C.b1}`, background: C.s1, fontSize: 11, color: C.t2 }}>
            💡 S'omple automàticament des de{" "}
            <strong style={{ color: C.ac, cursor: "pointer" }} onClick={() => setAct("productes")}>📦 Productes</strong>.
            Fes clic a qualsevol cel·la per editar.
          </div>
        )}

        {!isV && (
          <div style={{ padding: "12px 24px", borderBottom: `1px solid ${C.b1}`, background: C.s1, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 11, color: C.t2 }}>✏️ Entrada manual</span>
            <Btn onClick={openManual} style={{ padding: "6px 16px", background: C.acD, border: `1px solid ${C.ac}`, color: C.ac, fontSize: 11 }}>+ Afegir registre</Btn>
          </div>
        )}

        {/* ═══ MANUAL FORM ═══ */}
        {mr && (
          <div style={{ padding: "16px 24px", background: C.oD, borderBottom: `1px solid ${C.o}` }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.o, marginBottom: 12 }}>Nou registre — {sc.label}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 10, marginBottom: 14 }}>
              {sc.fields.map(f => (
                <div key={f.key}>
                  <label style={{ fontSize: 10, color: C.t3, textTransform: "uppercase", letterSpacing: 0.5 }}>{f.label} {f.req && <span style={{ color: C.r }}>*</span>}</label>
                  {f.options ? (
                    <select value={mr[f.key] || ""} onChange={e => setMr(p => ({ ...p, [f.key]: e.target.value }))} style={inpS}>
                      <option value="">—</option>{f.options.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input type={f.type === "number" ? "number" : "text"} value={mr[f.key] || ""} placeholder={f.placeholder || ""}
                      onChange={e => setMr(p => ({ ...p, [f.key]: e.target.value }))} style={inpS} />
                  )}
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Btn onClick={saveManual} style={{ padding: "7px 18px", background: C.gD, border: `1px solid ${C.g}`, color: C.g }}>✓ Guardar</Btn>
              <Btn onClick={() => setMr(null)} style={{ padding: "7px 18px", background: C.rD, border: `1px solid ${C.r}`, color: C.r }}>✗ Cancel·lar</Btn>
            </div>
          </div>
        )}

        {/* ═══ PENDING PREVIEW ═══ */}
        {pend && pTabs.length > 0 && (
          <div style={{ borderBottom: `2px solid ${C.o}`, background: C.s1, flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", padding: "8px 24px", gap: 6, borderBottom: `1px solid ${C.b1}`, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, color: C.o, fontWeight: 700, marginRight: 6 }}>⚡ PREVISUALITZACIÓ</span>
              {pTabs.map(t => (
                <Btn key={t} onClick={() => setPvt(t)} style={{
                  padding: "4px 12px", fontSize: 11,
                  background: pvt === t ? C.oD : "transparent",
                  border: `1px solid ${pvt === t ? C.o : C.b1}`,
                  color: pvt === t ? C.o : C.t2,
                }}>{SCHEMAS[t].icon} {SCHEMAS[t].label} ({pend[t].length})</Btn>
              ))}
              <div style={{ flex: 1 }} />
              <Btn onClick={confirmAll} style={{ padding: "5px 16px", background: C.gD, border: `1px solid ${C.g}`, color: C.g, fontSize: 11 }}>✓ Confirmar tot</Btn>
              <Btn onClick={() => { setPend(null); setChangeLog([]); setStat("Descartat."); }} style={{ padding: "5px 16px", background: C.rD, border: `1px solid ${C.r}`, color: C.r, fontSize: 11 }}>✗ Descartar</Btn>
            </div>
            {changeLog.length > 0 && (
              <div style={{ padding: "7px 24px", background: "#1E1A06", borderBottom: `1px solid ${C.o}`, fontSize: 10, color: C.o, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                <span style={{ fontWeight: 700, marginRight: 4 }}>⚠️ Noms normalitzats:</span>
                {changeLog.map((c, i) => (
                  <span key={i} style={{ background: C.oD, borderRadius: 3, padding: "2px 7px" }}>
                    "{c.from}" → <strong style={{ color: C.t1 }}>"{c.to}"</strong>
                    <span style={{ color: C.t3, marginLeft: 4 }}>({SCHEMAS[c.table]?.label || c.table})</span>
                  </span>
                ))}
              </div>
            )}
            <div style={{ padding: "10px 24px 16px", overflowX: "auto", maxHeight: 260, overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead><tr>
                  <th style={{ ...thS, color: C.o, width: 80 }}>Acció</th>
                  {SCHEMAS[pvt].fields.map(f => <th key={f.key} style={{ ...thS, color: C.o }}>{f.label}</th>)}
                  <th style={{ ...thS, width: 30 }} />
                </tr></thead>
                <tbody>
                  {(pend[pvt] || []).map((row, ri) => (
                    <tr key={ri}>
                      <td style={{ padding: "6px 10px", borderBottom: `1px solid ${C.b1}`, whiteSpace: "nowrap" }}>
                        {row._action === 'update'
                          ? <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 3, background: C.acD, color: C.ac, fontWeight: 600 }}>↻ Actualitza</span>
                          : <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 3, background: C.gD, color: C.g, fontWeight: 600 }}>✦ Nou</span>
                        }
                      </td>
                      {SCHEMAS[pvt].fields.map(f => (
                        <td key={f.key} onClick={() => editPendCell(pvt, ri, f.key)}
                          style={{ padding: "6px 10px", borderBottom: `1px solid ${C.b1}`, color: row[f.key] != null && row[f.key] !== "" ? C.t1 : C.t3, cursor: "pointer" }}>
                          {row[f.key] != null && row[f.key] !== "" ? String(row[f.key]) : "—"}
                        </td>
                      ))}
                      <td style={{ padding: "6px 4px", borderBottom: `1px solid ${C.b1}` }}>
                        <span onClick={() => removePendRow(pvt, ri)} style={{ cursor: "pointer", color: C.t3 }} title="Treure">✕</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p style={{ fontSize: 10, color: C.t3, marginTop: 8, marginBottom: 0 }}>💡 Clic a cel·la per corregir · ✕ per eliminar fila · <span style={{ color: C.ac }}>↻ Actualitza</span> = omple camps buits · <span style={{ color: C.g }}>✦ Nou</span> = inserció nova</p>
            </div>
          </div>
        )}

        {/* ═══ DATA TABLE ═══ */}
        <div style={{ flex: 1, padding: "16px 24px", overflowX: "auto", overflowY: "auto" }}>
          {data[act].length === 0 ? (
            <div style={{ textAlign: "center", padding: "50px 20px", color: C.t3 }}>
              <div style={{ fontSize: 48, marginBottom: 14, opacity: 0.15 }}>{sc.icon}</div>
              <div style={{ fontSize: 14, marginBottom: 8 }}>Encara no hi ha registres a {sc.label}</div>
              <div style={{ fontSize: 11 }}>
                {act === "productes" && 'Prem "Gravar veu" per dictar el primer producte'}
                {isV && act !== "productes" && "S'omplirà quan dictis un producte"}
                {!isV && 'Prem "+ Afegir registre"'}
              </div>
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead><tr>
                <th style={{ ...thS, width: 36, textAlign: "center" }}>#</th>
                {sc.fields.map(f => <th key={f.key} style={thS}>{f.label}</th>)}
                <th style={{ ...thS, width: 36 }} />
              </tr></thead>
              <tbody>
                {data[act].map((row, ri) => (
                  <tr key={row.id || ri}
                    onMouseEnter={e => e.currentTarget.style.background = C.s2}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <td style={{ ...tdS, textAlign: "center", color: C.t3, fontSize: 10 }}>{ri + 1}</td>
                    {sc.fields.map(f => {
                      const isEd = ec?.ri === ri && ec?.key === f.key;
                      return (
                        <td key={f.key} onClick={() => !isEd && startEdit(ri, f.key, row[f.key])}
                          style={{ ...tdS, cursor: "pointer", padding: isEd ? "2px 4px" : undefined }}>
                          {isEd ? (
                            f.options ? (
                              <select ref={eRef} value={ev} onChange={e => setEv(e.target.value)} onBlur={commitEdit}
                                onKeyDown={e => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEc(null); }}
                                style={ceS}>
                                <option value="">—</option>{f.options.map(o => <option key={o} value={o}>{o}</option>)}
                              </select>
                            ) : (
                              <input ref={eRef} type={f.type === "number" ? "number" : "text"} value={ev}
                                onChange={e => setEv(e.target.value)} onBlur={commitEdit}
                                onKeyDown={e => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEc(null); }}
                                style={ceS} />
                            )
                          ) : (
                            <span style={{ color: row[f.key] != null && row[f.key] !== "" ? C.t1 : C.t3 }}>
                              {row[f.key] != null && row[f.key] !== "" ? String(row[f.key]) : "—"}
                            </span>
                          )}
                        </td>
                      );
                    })}
                    <td style={tdS}>
                      <span onClick={() => handleDelete(ri)} style={{ cursor: "pointer", color: C.t3, fontSize: 13 }} title="Eliminar">🗑</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        ::-webkit-scrollbar{width:5px;height:5px}
        ::-webkit-scrollbar-track{background:${C.bg}}
        ::-webkit-scrollbar-thumb{background:${C.b1};border-radius:3px}
        select option{background:${C.s1};color:${C.t1}}
      `}</style>
    </div>
  );
}

const thS = { padding: "8px 10px", textAlign: "left", color: "#637486", fontWeight: 600, borderBottom: "2px solid #28374A", whiteSpace: "nowrap", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 };
const tdS = { padding: "6px 10px", borderBottom: "1px solid #28374A" };
const inpS = { width: "100%", padding: "6px 8px", background: "#0A0E13", border: "1px solid #28374A", borderRadius: 4, color: "#E6EDF5", fontSize: 12, fontFamily: "inherit", marginTop: 3, boxSizing: "border-box" };
const ceS = { width: "100%", padding: "5px 8px", background: "#0A0E13", border: "2px solid #3B8EEA", borderRadius: 4, color: "#E6EDF5", fontSize: 12, fontFamily: "inherit", outline: "none", boxSizing: "border-box" };
