import { useMemo, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { useApp } from "../store/AppStore";
import { EventoFuturo, Investimento } from "../types";
import { calcolaProiezione, campionaMesi } from "../engine/proiezione";
import { euro, uid } from "../util";

const COL_LIQ = "#4c78a8"; // liquido
const COL_CAP = "#8a94a6"; // capitale investito
const COL_GAIN = "#54a24b"; // guadagni

export function Proiezione() {
  const { dati, aggiorna } = useApp();
  const p = dati.parametri;
  const [mostraEventi, setMostraEventi] = useState(false);
  const [mostraInv, setMostraInv] = useState(false);

  const ris = useMemo(
    () =>
      calcolaProiezione(
        dati.transazioni,
        dati.tasse,
        dati.eventiFuturi,
        dati.investimenti,
        dati.parametri,
      ),
    [dati],
  );

  const datiGrafico = useMemo(() => campionaMesi(ris.punti, 3), [ris.punti]);

  function setParam(patch: Partial<typeof p>) {
    aggiorna((d) => ({ ...d, parametri: { ...d.parametri, ...patch } }));
  }

  const annoPensione = ris.dataPensione?.slice(0, 4);

  if (dati.eventiFuturi.length === 0 && dati.investimenti.length === 0) {
    return (
      <>
        <div className="card">
          <h3>Proiezione futura</h3>
          <p className="muted">
            Non ci sono ancora scenari futuri. Aggiungi eventi (entrate/uscite
            previste, spese grosse) e investimenti per stimare la ricchezza
            futura e la pensione integrativa. Se hai il backup JSON con i dati
            dell'Excel, importalo da <b>Impostazioni</b>.
          </p>
        </div>
        <EditorEventi />
        <EditorInvestimenti />
      </>
    );
  }

  return (
    <>
      <div className="stat-griglia">
        <div className="stat">
          <div className="etichetta">Patrimonio netto oggi</div>
          <div className="valore">{euro(ris.patrimonioOggi)}</div>
          <div className="muted" style={{ fontSize: 12 }}>
            liquido + investimenti
          </div>
        </div>
        <div className="stat">
          <div className="etichetta">Capitale a {p.etaPensione ?? 67} anni</div>
          <div className="valore">{euro(ris.capitalePensione)}</div>
          <div className="muted" style={{ fontSize: 12 }}>
            nel {annoPensione}, in € di oggi
          </div>
        </div>
        <div className="stat">
          <div className="etichetta">Rendita integrativa /anno</div>
          <div className="valore" style={{ color: COL_GAIN }}>
            {euro(ris.renditaAnnua)}
          </div>
          <div className="muted" style={{ fontSize: 12 }}>
            ~{euro(ris.renditaMensile)}/mese · stima lorda al{" "}
            {((p.tassoRendita ?? 0.035) * 100).toFixed(1)}%
          </div>
        </div>
      </div>

      {ris.liquiditaMinima !== undefined && ris.liquiditaMinima < 0 && (
        <div className="card" style={{ borderColor: "var(--uscita)" }}>
          <p style={{ margin: 0 }}>
            ⚠️ In alcuni mesi la <b>liquidità scende sotto zero</b> (minimo{" "}
            {euro(ris.liquiditaMinima)}): con queste ipotesi lo scenario non si
            autofinanzia — i versamenti negli investimenti o le spese grosse
            superano i risparmi disponibili.
          </p>
        </div>
      )}

      <div className="card">
        <div className="form-griglia" style={{ marginBottom: 4 }}>
          <label className="campo">
            Età pensione
            <input
              type="number"
              value={p.etaPensione ?? 67}
              onChange={(e) => setParam({ etaPensione: Number(e.target.value) })}
            />
          </label>
          <label className="campo">
            Tasso rendita (es. 0.035 = 3,5%)
            <input
              type="number"
              step="0.005"
              value={p.tassoRendita ?? 0.035}
              onChange={(e) => setParam({ tassoRendita: Number(e.target.value) })}
            />
          </label>
          <label className="campo">
            Inflazione annua (già scontata nei tassi reali)
            <input
              type="number"
              step="0.005"
              value={p.inflazione}
              onChange={(e) => setParam({ inflazione: Number(e.target.value) })}
            />
          </label>
        </div>
        <p className="muted" style={{ margin: 0, fontSize: 12 }}>
          Tutti i valori sono in <b>potere d'acquisto di oggi</b>: entrate e
          rendimenti sono già al netto dell'inflazione.
        </p>
      </div>

      <div className="card">
        <h3>Ricchezza futura stimata</h3>
        <div style={{ width: "100%", height: 360 }}>
          <ResponsiveContainer>
            <AreaChart
              data={datiGrafico}
              margin={{ top: 8, right: 12, left: 8, bottom: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--bordo)" />
              <XAxis
                dataKey="data"
                tick={{ fontSize: 11, fill: "var(--muted)" }}
                tickFormatter={(v: string) => v.slice(0, 4)}
                minTickGap={40}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "var(--muted)" }}
                tickFormatter={(v) => euro(v)}
                width={80}
              />
              <Tooltip
                formatter={(v: number) => euro(v)}
                labelFormatter={(l: string) => l.slice(0, 7)}
                contentStyle={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--bordo)",
                  borderRadius: 8,
                  color: "var(--testo)",
                }}
              />
              <Legend />
              {ris.dataPensione && (
                <ReferenceLine
                  x={
                    datiGrafico.find((d) => d.data >= ris.dataPensione!)?.data
                  }
                  stroke="var(--muted)"
                  strokeDasharray="4 4"
                  label={{
                    value: `pensione (${p.etaPensione ?? 67})`,
                    fontSize: 11,
                    fill: "var(--muted)",
                    position: "top",
                  }}
                />
              )}
              <Area
                type="monotone"
                dataKey="liquido"
                name="Liquido"
                stackId="1"
                stroke={COL_LIQ}
                fill={COL_LIQ}
                fillOpacity={0.5}
              />
              <Area
                type="monotone"
                dataKey="investito"
                name="Capitale investito"
                stackId="1"
                stroke={COL_CAP}
                fill={COL_CAP}
                fillOpacity={0.5}
              />
              <Area
                type="monotone"
                dataKey="guadagni"
                name="Guadagni investimenti"
                stackId="1"
                stroke={COL_GAIN}
                fill={COL_GAIN}
                fillOpacity={0.5}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <p className="muted" style={{ fontSize: 12 }}>
          L'area totale è il patrimonio netto: <b>liquido</b> (cash disponibile,
          già al netto di versamenti e spese grosse), <b>capitale investito</b>{" "}
          (vincolato) e <b>guadagni</b> (interessi composti). Il capitale resta
          investito fino alla pensione: solo lì le tranche maturano e tornano nel
          liquido.
        </p>
      </div>

      <div className="card">
        <button
          className="secondario"
          onClick={() => setMostraEventi((v) => !v)}
        >
          {mostraEventi ? "▾" : "▸"} Scenari entrate/uscite (
          {dati.eventiFuturi.length})
        </button>
        {mostraEventi && <EditorEventi />}
      </div>

      <div className="card">
        <button className="secondario" onClick={() => setMostraInv((v) => !v)}>
          {mostraInv ? "▾" : "▸"} Investimenti ({dati.investimenti.length})
        </button>
        {mostraInv && <EditorInvestimenti />}
      </div>
    </>
  );
}

// ---------- Editor eventi ----------

function EditorEventi() {
  const { dati, aggiorna } = useApp();
  const eventi = [...dati.eventiFuturi].sort((a, b) =>
    a.dataInizio.localeCompare(b.dataInizio),
  );

  function mod(id: string, patch: Partial<EventoFuturo>) {
    aggiorna((d) => ({
      ...d,
      eventiFuturi: d.eventiFuturi.map((e) =>
        e.id === id ? { ...e, ...patch } : e,
      ),
    }));
  }
  function aggiungi() {
    aggiorna((d) => ({
      ...d,
      eventiFuturi: [
        ...d.eventiFuturi,
        {
          id: uid(),
          descrizione: "Nuovo evento",
          dataInizio: new Date().toISOString().slice(0, 10),
          aliquota: 0.22,
        },
      ],
    }));
  }
  function elimina(id: string) {
    aggiorna((d) => ({
      ...d,
      eventiFuturi: d.eventiFuturi.filter((e) => e.id !== id),
    }));
  }

  return (
    <div style={{ marginTop: 12 }}>
      <div className="tabella-wrap">
        <table>
          <thead>
            <tr>
              <th>Descrizione</th>
              <th>Da</th>
              <th className="num">Fatt./mese</th>
              <th className="num">Aliquota</th>
              <th className="num">Spesa/mese</th>
              <th className="num">Spesa grossa</th>
              <th className="num">Risparmio/mese</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {eventi.map((e) => {
              const netto = (e.fatturatoMensile ?? 0) * (1 - (e.aliquota ?? 0));
              const risp = netto - (e.spesaMensile ?? 0);
              return (
                <tr key={e.id}>
                  <td>
                    <input
                      style={{ width: 180 }}
                      value={e.descrizione}
                      onChange={(ev) => mod(e.id, { descrizione: ev.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      type="date"
                      value={e.dataInizio}
                      onChange={(ev) => mod(e.id, { dataInizio: ev.target.value })}
                    />
                  </td>
                  <CellaN v={e.fatturatoMensile} set={(v) => mod(e.id, { fatturatoMensile: v })} />
                  <CellaN v={e.aliquota} step={0.001} w={64} set={(v) => mod(e.id, { aliquota: v })} />
                  <CellaN v={e.spesaMensile} set={(v) => mod(e.id, { spesaMensile: v })} />
                  <CellaN v={e.spesaGrossa} set={(v) => mod(e.id, { spesaGrossa: v })} />
                  <td className="num" style={{ color: risp >= 0 ? "var(--entrata)" : "var(--uscita)" }}>
                    <b>{euro(risp)}</b>
                  </td>
                  <td>
                    <button className="secondario" style={{ padding: "2px 8px" }} onClick={() => elimina(e.id)}>
                      ✕
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <button className="secondario" style={{ marginTop: 10 }} onClick={aggiungi}>
        + Aggiungi evento
      </button>
    </div>
  );
}

// ---------- Editor investimenti ----------

function EditorInvestimenti() {
  const { dati, aggiorna } = useApp();
  const inv = [...dati.investimenti].sort((a, b) =>
    a.dataInizio.localeCompare(b.dataInizio),
  );

  function mod(id: string, patch: Partial<Investimento>) {
    aggiorna((d) => ({
      ...d,
      investimenti: d.investimenti.map((i) =>
        i.id === id ? { ...i, ...patch } : i,
      ),
    }));
  }
  function aggiungi() {
    aggiorna((d) => ({
      ...d,
      investimenti: [
        ...d.investimenti,
        {
          id: uid(),
          descrizione: "Nuovo investimento",
          dataInizio: new Date().toISOString().slice(0, 10),
          dataFine: new Date(Date.now() + 5 * 365 * 86400000)
            .toISOString()
            .slice(0, 10),
          capitale: 5000,
          interesse: 0.03,
        },
      ],
    }));
  }
  function elimina(id: string) {
    aggiorna((d) => ({
      ...d,
      investimenti: d.investimenti.filter((i) => i.id !== id),
    }));
  }

  return (
    <div style={{ marginTop: 12 }}>
      <div className="tabella-wrap">
        <table>
          <thead>
            <tr>
              <th>Descrizione</th>
              <th>Da</th>
              <th>A</th>
              <th className="num">Capitale</th>
              <th className="num">Tasso reale</th>
              <th className="num">Versam. ric.</th>
              <th className="num">Ogni (mesi)</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {inv.map((i) => (
              <tr key={i.id}>
                <td>
                  <input
                    style={{ width: 150 }}
                    value={i.descrizione ?? ""}
                    onChange={(e) => mod(i.id, { descrizione: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    type="date"
                    value={i.dataInizio}
                    onChange={(e) => mod(i.id, { dataInizio: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    type="date"
                    value={i.dataFine}
                    onChange={(e) => mod(i.id, { dataFine: e.target.value })}
                  />
                </td>
                <CellaN v={i.capitale} set={(v) => mod(i.id, { capitale: v ?? 0 })} />
                <CellaN v={i.interesse} step={0.001} w={64} set={(v) => mod(i.id, { interesse: v ?? 0 })} />
                <CellaN v={i.versamentoPeriodico} set={(v) => mod(i.id, { versamentoPeriodico: v })} />
                <CellaN v={i.frequenzaMesi} w={64} set={(v) => mod(i.id, { frequenzaMesi: v })} />
                <td>
                  <button className="secondario" style={{ padding: "2px 8px" }} onClick={() => elimina(i.id)}>
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button className="secondario" style={{ marginTop: 10 }} onClick={aggiungi}>
        + Aggiungi investimento
      </button>
      <p className="muted" style={{ fontSize: 12 }}>
        Il <b>tasso reale</b> è già al netto dell'inflazione. Per un piano di
        accumulo, compila "Versamento ricorrente" e "Ogni (mesi)" — es. 8500
        ogni 12 mesi. La colonna <b>"A"</b> (scadenza) ferma solo i versamenti:
        il capitale resta comunque investito e continua a rendere fino alla
        pensione.
      </p>
    </div>
  );
}

// ---------- Cella numerica riutilizzabile ----------

function CellaN({
  v,
  set,
  step = 0.01,
  w = 90,
}: {
  v: number | undefined;
  set: (v: number | undefined) => void;
  step?: number;
  w?: number;
}) {
  return (
    <td className="num">
      <input
        type="number"
        step={step}
        style={{ width: w }}
        value={v === undefined ? "" : v}
        onChange={(e) => set(e.target.value === "" ? undefined : Number(e.target.value))}
      />
    </td>
  );
}
