import { useApp } from "../store/AppStore";
import { AnnoTasse } from "../types";
import { euro } from "../util";

export function Tasse() {
  const { dati, aggiorna } = useApp();
  const righe = [...dati.tasse].sort((a, b) => a.anno - b.anno);

  function modifica(anno: number, patch: Partial<AnnoTasse>) {
    aggiorna((d) => ({
      ...d,
      tasse: d.tasse.map((t) => (t.anno === anno ? { ...t, ...patch } : t)),
    }));
  }

  function aggiungiAnno() {
    const nuovo =
      righe.length > 0 ? Math.max(...righe.map((r) => r.anno)) + 1 : new Date().getFullYear();
    aggiorna((d) => ({ ...d, tasse: [...d.tasse, { anno: nuovo }] }));
  }

  function elimina(anno: number) {
    aggiorna((d) => ({ ...d, tasse: d.tasse.filter((t) => t.anno !== anno) }));
  }

  const numOr = (v: number | undefined) => (v === undefined ? "" : v);

  // Accantonamento consigliato: dall'anno piu' recente con dati.
  const ultimo = righe
    .map((t) => {
      const tot =
        (t.inarcassa ?? 0) + (t.irpef ?? 0) + (t.aggiuntivi ?? 0) ||
        (t.fatturato && t.tassazione ? t.fatturato * t.tassazione : 0);
      return { anno: t.anno, tot, fatturato: t.fatturato };
    })
    .filter((x) => x.tot > 0)
    .pop();
  const aliquotaEff =
    ultimo && ultimo.fatturato ? ultimo.tot / ultimo.fatturato : undefined;

  return (
    <>
      {ultimo && (
        <div className="stat-griglia">
          <div className="stat">
            <div className="etichetta">Accantona ogni mese</div>
            <div className="valore">{euro(ultimo.tot / 12)}</div>
            <div className="muted" style={{ fontSize: 12 }}>
              per coprire le tasse (base {ultimo.anno})
            </div>
          </div>
          <div className="stat">
            <div className="etichetta">Aliquota effettiva</div>
            <div className="valore">
              {aliquotaEff !== undefined
                ? (aliquotaEff * 100).toFixed(1) + "%"
                : "—"}
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              tasse / fatturato {ultimo.anno}
            </div>
          </div>
          <div className="stat">
            <div className="etichetta">Accantona per ogni €</div>
            <div className="valore">
              {aliquotaEff !== undefined
                ? (aliquotaEff * 100).toFixed(0) + " cent"
                : "—"}
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              su ogni € fatturato
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <h3>Dati fiscali per anno</h3>
        <p className="muted" style={{ marginTop: -4 }}>
          Forfettario + Inarcassa. Il totale annuo viene spalmato
          giorno-per-giorno per correggere il saldo (colonne "netto tasse" e
          "potere d'acquisto" della pagina Saldo). Puoi lasciare i valori reali
          (Inarcassa + IRPEF) oppure la stima da fatturato × aliquota.
        </p>
      </div>

      <div className="tabella-wrap">
        <table>
          <thead>
            <tr>
              <th>Anno</th>
              <th className="num">Inarcassa €</th>
              <th className="num">IRPEF €</th>
              <th className="num">Aggiuntivi €</th>
              <th className="num">Fatturato €</th>
              <th className="num">Aliquota</th>
              <th className="num">Totale tasse</th>
              <th className="num">Al giorno</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {righe.map((t) => {
              const totale =
                (t.inarcassa ?? 0) + (t.irpef ?? 0) + (t.aggiuntivi ?? 0);
              const stima =
                totale > 0
                  ? totale
                  : t.fatturato && t.tassazione
                    ? t.fatturato * t.tassazione
                    : 0;
              return (
                <tr key={t.anno}>
                  <td>
                    <b>{t.anno}</b>
                  </td>
                  <CellaNum
                    valore={t.inarcassa}
                    onSet={(v) => modifica(t.anno, { inarcassa: v })}
                  />
                  <CellaNum
                    valore={t.irpef}
                    onSet={(v) => modifica(t.anno, { irpef: v })}
                  />
                  <CellaNum
                    valore={t.aggiuntivi}
                    onSet={(v) => modifica(t.anno, { aggiuntivi: v })}
                  />
                  <CellaNum
                    valore={t.fatturato}
                    onSet={(v) => modifica(t.anno, { fatturato: v })}
                  />
                  <td className="num">
                    <input
                      type="number"
                      step="0.001"
                      style={{ width: 70 }}
                      value={numOr(t.tassazione)}
                      onChange={(e) =>
                        modifica(t.anno, {
                          tassazione:
                            e.target.value === ""
                              ? undefined
                              : Number(e.target.value),
                        })
                      }
                    />
                  </td>
                  <td className="num">
                    <b>{euro(stima, true)}</b>
                  </td>
                  <td className="num">{euro(stima / 365, true)}</td>
                  <td>
                    <button
                      className="secondario"
                      style={{ padding: "2px 8px" }}
                      onClick={() => elimina(t.anno)}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 12 }}>
        <button className="secondario" onClick={aggiungiAnno}>
          + Aggiungi anno
        </button>
      </div>
    </>
  );
}

function CellaNum({
  valore,
  onSet,
}: {
  valore: number | undefined;
  onSet: (v: number | undefined) => void;
}) {
  return (
    <td className="num">
      <input
        type="number"
        step="0.01"
        style={{ width: 90 }}
        value={valore === undefined ? "" : valore}
        onChange={(e) =>
          onSet(e.target.value === "" ? undefined : Number(e.target.value))
        }
      />
    </td>
  );
}
