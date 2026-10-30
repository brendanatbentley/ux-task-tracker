import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import {
  calculatePriority,
  createSharedSnapshot,
  getManualOrder,
  getOrderedQueue,
  getQueueProjection,
} from "./logic";
import { DEFAULT_HOURS_PER_WEEK, parseOwnerData, parseSharedSnapshot, STORAGE_KEY } from "./data";
import { loadOwnerData, saveOwnerData } from "./storage";
import type { DesignRequest, OwnerData, RequestStatus, SharedSnapshot } from "./types";

const statusLabels: Record<RequestStatus, string> = {
  queued: "Queued",
  in_progress: "In progress",
  done: "Done",
  parked: "Parked",
};

const statusOrder: RequestStatus[] = ["in_progress", "queued", "parked", "done"];
const filterStatusOrder: RequestStatus[] = ["queued", "in_progress", "done", "parked"];

function downloadJson(filename: string, value: unknown): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function formatHours(hours: number): string {
  return Number(hours.toFixed(2)).toString();
}

function SharedView() {
  const [snapshot, setSnapshot] = useState<SharedSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${import.meta.env.BASE_URL}shared-snapshot.json`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`The published backlog could not be loaded (HTTP ${response.status}).`);
        }
        return response.json() as Promise<unknown>;
      })
      .then((value) => setSnapshot(parseSharedSnapshot(value)))
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(cause instanceof Error ? cause.message : "The published backlog could not be loaded.");
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, []);

  const requests = useMemo(() => {
    if (!snapshot) return [];
    return [...snapshot.requests].sort((a, b) => {
      const statusDifference = statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status);
      if (statusDifference !== 0) return statusDifference;
      if (a.status === "queued" && b.status === "queued") {
        return (a.queuePosition ?? Number.MAX_SAFE_INTEGER) - (b.queuePosition ?? Number.MAX_SAFE_INTEGER);
      }
      return a.title.localeCompare(b.title);
    });
  }, [snapshot]);

  return (
    <main className="page-shell">
      <header className="topbar">
        <a className="brand" href={import.meta.env.BASE_URL} aria-label="Open owner view">
          <span className="brand-mark" aria-hidden="true">D</span>
          <span>Design backlog</span>
        </a>
        <span className="view-label">Shared read-only view</span>
      </header>

      <section className="page-heading">
        <div>
          <p className="eyebrow">Capacity & priorities</p>
          <h1>Design work queue</h1>
          <p className="intro">A transparent view of active work, what is waiting, and when new work may start.</p>
        </div>
      </section>

      {loading && <div className="notice" role="status">Loading the latest published backlog…</div>}
      {error && <div className="notice notice-error" role="alert">{error}</div>}
      {!loading && !error && snapshot && (
        <>
          <section className="metrics-grid" aria-label="Queue summary">
            <Metric label="Queued work" value={`${formatHours(snapshot.totalQueuedHours)} hrs`} detail="total estimate" />
            <Metric label="Queue length" value={`${snapshot.queuedWeeks.toFixed(1)} weeks`} detail={`at ${formatHours(snapshot.hoursPerWeek)} hrs per week`} />
            <Metric label="In progress" value={`${snapshot.requests.filter((request) => request.status === "in_progress").length}`} detail="active requests" />
          </section>

          <section className="panel queue-panel">
            <div className="panel-heading">
              <div>
                <h2>Requests</h2>
                {snapshot.requests.length > 0 && (
                  <p className="muted">Last published {new Date(snapshot.publishedAt).toLocaleDateString()}</p>
                )}
              </div>
              <span className="readonly-pill">Read only</span>
            </div>
            {requests.length === 0 ? (
              <p className="empty-state">No requests have been published yet.</p>
            ) : (
              <div className="table-scroll">
                <table className="shared-table">
                  <thead>
                    <tr>
                      <th scope="col">Request</th>
                      <th scope="col">Requester</th>
                      <th scope="col">Status</th>
                      <th scope="col" className="numeric">Estimate</th>
                      <th scope="col" className="numeric">Queue position</th>
                      <th scope="col">Projected start</th>
                      {snapshot.includesScores && (
                        <>
                          <th scope="col" className="numeric">Impact</th>
                          <th scope="col" className="numeric">Urgency</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {requests.map((request) => (
                      <tr key={request.id}>
                        <th scope="row" className="request-title">{request.title}</th>
                        <td>{request.requester || "—"}</td>
                        <td><StatusBadge status={request.status} /></td>
                        <td className="numeric">{formatHours(request.estimateHours)} hrs</td>
                        <td className="numeric">{request.queuePosition ?? "—"}</td>
                        <td>{request.projectedStartWeek ? `Week ${request.projectedStartWeek}` : "—"}</td>
                        {snapshot.includesScores && (
                          <>
                            <td className="numeric">{request.impact ?? "—"}</td>
                            <td className="numeric">{request.urgency ?? "—"}</td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <p className="privacy-note">
            This public snapshot contains only the fields shown here{snapshot.includesScores ? ", including impact and urgency scores." : ". Scores were not included by the owner."}
          </p>
        </>
      )}
    </main>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="metric-card">
      <span className="metric-label">{label}</span>
      <strong className="metric-value">{value}</strong>
      <span className="metric-detail">{detail}</span>
    </article>
  );
}

function StatusBadge({ status }: { status: RequestStatus }) {
  return <span className={`status-badge status-${status}`}>{statusLabels[status]}</span>;
}

interface NewRequestForm {
  title: string;
  requester: string;
  team: string;
  description: string;
  estimateHours: number;
  impact: number;
  urgency: number;
}

const emptyForm: NewRequestForm = {
  title: "",
  requester: "",
  team: "",
  description: "",
  estimateHours: 2,
  impact: 3,
  urgency: 3,
};

function OwnerView() {
  const loadResult = useMemo(() => loadOwnerData(), []);
  const [data, setData] = useState<OwnerData>(loadResult.data);
  const [loadError, setLoadError] = useState<string | null>(loadResult.error);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [form, setForm] = useState<NewRequestForm>(emptyForm);
  const [statusFilter, setStatusFilter] = useState<RequestStatus | "all">("all");
  const [teamFilter, setTeamFilter] = useState("all");
  const [includeScores, setIncludeScores] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  useEffect(() => {
    if (loadError || storageError) return;
    try {
      saveOwnerData(data);
    } catch (cause) {
      setStorageError(cause instanceof Error ? cause.message : "Changes could not be saved in this browser.");
    }
  }, [data, loadError, storageError]);

  const queue = useMemo(
    () => getOrderedQueue(data.requests, data.settings.orderMode),
    [data.requests, data.settings.orderMode],
  );
  const projection = useMemo(
    () => getQueueProjection(queue, data.settings.hoursPerWeek),
    [queue, data.settings.hoursPerWeek],
  );
  const teamOptions = useMemo(
    () => [...new Set(data.requests.map((request) => request.team.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [data.requests],
  );
  const orderedRequests = useMemo(() => {
    const queueIds = new Set(queue.map((request) => request.id));
    const others = data.requests
      .filter((request) => !queueIds.has(request.id))
      .sort((a, b) => {
        const statusDifference = statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status);
        return statusDifference || a.dateAdded.localeCompare(b.dateAdded);
      });
    return [...queue, ...others].filter((request) =>
      (statusFilter === "all" || request.status === statusFilter) &&
      (teamFilter === "all" || request.team === teamFilter),
    );
  }, [data.requests, queue, statusFilter, teamFilter]);

  function addRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextOrder = Math.max(-1, ...data.requests.map((request) => request.manualOrder)) + 1;
    const request: DesignRequest = {
      ...form,
      id: crypto.randomUUID(),
      title: form.title.trim(),
      requester: form.requester.trim(),
      team: form.team.trim(),
      description: form.description.trim(),
      status: "queued",
      dateAdded: new Date().toISOString(),
      manualOrder: nextOrder,
    };
    setData((current) => ({ ...current, requests: [...current.requests, request] }));
    setForm(emptyForm);
    setFeedback("Request added to the queue.");
  }

  function updateRequest(id: string, changes: Partial<DesignRequest>) {
    if (changes.title !== undefined && changes.title.trim() === "") return;
    setData((current) => {
      const existing = current.requests.find((request) => request.id === id);
      if (!existing) return current;
      const enteringQueue = changes.status === "queued" && existing.status !== "queued";
      const nextOrder = Math.max(-1, ...current.requests.map((request) => request.manualOrder)) + 1;
      return {
        ...current,
        requests: current.requests.map((request) =>
          request.id === id
            ? { ...request, ...changes, ...(enteringQueue ? { manualOrder: nextOrder } : {}) }
            : request,
        ),
      };
    });
    setFeedback(null);
  }

  function deleteRequest(id: string) {
    const request = data.requests.find((item) => item.id === id);
    if (!request || !window.confirm(`Delete "${request.title}"? This cannot be undone.`)) return;
    setData((current) => ({ ...current, requests: current.requests.filter((item) => item.id !== id) }));
  }

  function setOrderMode(mode: "priority" | "manual") {
    setData((current) => {
      if (current.settings.orderMode === mode) return current;
      if (mode === "manual") {
        const ordered = getManualOrder(current.requests);
        const manualOrderById = new Map(ordered.map((request, index) => [request.id, index]));
        return {
          ...current,
          settings: { ...current.settings, orderMode: mode },
          requests: current.requests.map((request) => ({
            ...request,
            ...(manualOrderById.has(request.id) ? { manualOrder: manualOrderById.get(request.id)! } : {}),
          })),
        };
      }
      return { ...current, settings: { ...current.settings, orderMode: mode } };
    });
  }

  function moveQueuedRequest(id: string, direction: -1 | 1) {
    setData((current) => {
      const orderedQueue = getOrderedQueue(current.requests, current.settings.orderMode);
      const index = orderedQueue.findIndex((request) => request.id === id);
      const targetIndex = index + direction;
      if (index < 0 || targetIndex < 0 || targetIndex >= orderedQueue.length) return current;
      const moved = [...orderedQueue];
      [moved[index], moved[targetIndex]] = [moved[targetIndex], moved[index]];
      const orderById = new Map(moved.map((request, position) => [request.id, position]));
      return {
        ...current,
        settings: { ...current.settings, orderMode: "manual" },
        requests: current.requests.map((request) => ({
          ...request,
          ...(orderById.has(request.id) ? { manualOrder: orderById.get(request.id)! } : {}),
        })),
      };
    });
  }

  function updateCapacity(value: number) {
    if (Number.isFinite(value) && value > 0 && value <= 168) {
      setData((current) => ({ ...current, settings: { ...current.settings, hoursPerWeek: value } }));
    }
  }

  async function importOwnerFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = parseOwnerData(JSON.parse(await file.text()) as unknown);
      setData(parsed);
      setLoadError(null);
      setStorageError(null);
      setImportError(null);
      setFeedback("Backlog imported and saved in this browser.");
    } catch (cause) {
      setImportError(cause instanceof Error ? cause.message : "The selected file could not be imported.");
    } finally {
      event.target.value = "";
    }
  }

  function resetSavedData() {
    if (!window.confirm("Start with an empty backlog? This replaces the unreadable saved data in this browser.")) return;
    try {
      window.localStorage.removeItem(STORAGE_KEY);
      setData({ requests: [], settings: { hoursPerWeek: DEFAULT_HOURS_PER_WEEK, orderMode: "priority" } });
      setLoadError(null);
      setStorageError(null);
      setFeedback("Started with an empty backlog.");
    } catch (cause) {
      setStorageError(cause instanceof Error ? cause.message : "Saved data could not be cleared.");
    }
  }

  const shareUrl = `${window.location.origin}${import.meta.env.BASE_URL}#share`;
  const inProgressCount = data.requests.filter((request) => request.status === "in_progress").length;

  function updateForm<Field extends keyof NewRequestForm>(field: Field, value: NewRequestForm[Field]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  return (
    <main className="page-shell">
      <header className="topbar">
        <a className="brand" href={import.meta.env.BASE_URL} aria-label="Owner view">
          <span className="brand-mark" aria-hidden="true">D</span>
          <span>Design backlog</span>
        </a>
        <a className="topbar-link" href={`${import.meta.env.BASE_URL}#share`}>Open shared view <span aria-hidden="true">↗</span></a>
      </header>

      <section className="page-heading owner-heading">
        <div>
          <p className="eyebrow">Owner workspace</p>
          <h1>Backlog & capacity</h1>
          <p className="intro">Capture incoming design work, make trade-offs visible, and set a realistic queue.</p>
        </div>
        <div className="data-actions">
          <button className="button button-secondary" type="button" onClick={() => downloadJson("design-backlog.json", data)}>Export backup</button>
          <label className="button button-secondary file-button">
            Import backup
            <input type="file" accept="application/json,.json" onChange={importOwnerFile} />
          </label>
        </div>
      </section>

      {loadError && (
        <div className="notice notice-error" role="alert">
          <strong>Saved data could not be loaded.</strong> {loadError}
          <button className="button button-secondary" type="button" onClick={resetSavedData}>Start with empty data</button>
        </div>
      )}
      {storageError && <div className="notice notice-error" role="alert"><strong>Changes are not being saved.</strong> {storageError}</div>}
      {importError && <div className="notice notice-error" role="alert">{importError}</div>}
      {feedback && !loadError && !storageError && <div className="notice notice-success" role="status">{feedback}</div>}

      <section className="metrics-grid owner-metrics" aria-label="Capacity summary">
        <Metric label="Queued work" value={`${formatHours(projection.totalQueuedHours)} hrs`} detail="total estimated effort" />
        <Metric label="Queue length" value={`${projection.queuedWeeks.toFixed(1)} weeks`} detail={`at ${formatHours(data.settings.hoursPerWeek)} hrs per week`} />
        <Metric label="In progress" value={`${inProgressCount}`} detail="not included in queue projections" />
      </section>

      <section className="panel capacity-panel">
        <div className="capacity-description">
          <div className="section-icon" aria-hidden="true">◷</div>
          <div>
            <h2>Weekly capacity</h2>
            <p className="muted">Hours available for this work. In-progress items are excluded from projections.</p>
          </div>
        </div>
        <label className="capacity-input">
          <span>Hours per week</span>
          <span className="input-with-suffix">
            <input
              aria-label="Hours available per week"
              type="number"
              min="0.25"
              max="168"
              step="0.25"
              value={data.settings.hoursPerWeek}
              onChange={(event) => updateCapacity(event.currentTarget.valueAsNumber)}
            />
            <span>hrs</span>
          </span>
        </label>
      </section>

      <section className="panel add-panel">
        <div className="panel-heading">
          <div>
            <h2>Add a request</h2>
            <p className="muted">Estimate and score each request to make the trade-offs explicit.</p>
          </div>
        </div>
        <form className="request-form" onSubmit={addRequest}>
          <label className="field field-title">
            <span>Title <em>Required</em></span>
            <input
              autoComplete="off"
              required
              maxLength={120}
              value={form.title}
              onChange={(event) => updateForm("title", event.currentTarget.value)}
              placeholder="e.g. Refresh onboarding flow"
            />
          </label>
          <label className="field">
            <span>Requester</span>
            <input
              autoComplete="name"
              maxLength={80}
              value={form.requester}
              onChange={(event) => updateForm("requester", event.currentTarget.value)}
              placeholder="Name"
            />
          </label>
          <label className="field">
            <span>Team</span>
            <input
              list="team-suggestions"
              maxLength={80}
              value={form.team}
              onChange={(event) => updateForm("team", event.currentTarget.value)}
              placeholder="Team"
            />
            <datalist id="team-suggestions">{teamOptions.map((team) => <option key={team} value={team} />)}</datalist>
          </label>
          <label className="field">
            <span>Estimate <em>Required</em></span>
            <span className="input-with-suffix">
              <input
                required
                type="number"
                min="0.25"
                step="0.25"
                value={form.estimateHours}
                onChange={(event) => updateForm("estimateHours", event.currentTarget.valueAsNumber)}
              />
              <span>hrs</span>
            </span>
          </label>
          <label className="field">
            <span>Impact <em>1–5</em></span>
            <select value={form.impact} onChange={(event) => updateForm("impact", Number(event.currentTarget.value))}>
              {[1, 2, 3, 4, 5].map((score) => <option key={score} value={score}>{score}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Urgency <em>1–5</em></span>
            <select value={form.urgency} onChange={(event) => updateForm("urgency", Number(event.currentTarget.value))}>
              {[1, 2, 3, 4, 5].map((score) => <option key={score} value={score}>{score}</option>)}
            </select>
          </label>
          <label className="field field-description">
            <span>Description <em>Optional</em></span>
            <input
              maxLength={240}
              value={form.description}
              onChange={(event) => updateForm("description", event.currentTarget.value)}
              placeholder="A short context or outcome"
            />
          </label>
          <div className="form-submit">
            <span className="form-hint">Priority = impact × urgency</span>
            <button className="button button-primary" type="submit">Add to queue <span aria-hidden="true">+</span></button>
          </div>
        </form>
      </section>

      <section className="panel requests-panel">
        <div className="panel-heading requests-heading">
          <div>
            <h2>All requests <span className="count-badge">{data.requests.length}</span></h2>
            <p className="muted">Edit details directly. Priority updates automatically when a score changes.</p>
          </div>
          <div className="filters">
            <label>
              <span className="sr-only">Filter by status</span>
              <select aria-label="Filter by status" value={statusFilter} onChange={(event) => setStatusFilter(event.currentTarget.value as RequestStatus | "all")}>
                <option value="all">All statuses</option>
                {filterStatusOrder.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
              </select>
            </label>
            <label>
              <span className="sr-only">Filter by team</span>
              <select aria-label="Filter by team" value={teamFilter} onChange={(event) => setTeamFilter(event.currentTarget.value)}>
                <option value="all">All teams</option>
                {teamOptions.map((team) => <option key={team} value={team}>{team}</option>)}
              </select>
            </label>
          </div>
        </div>

        <div className="order-controls">
          <label className="order-mode">
            <span>Queue order</span>
            <select aria-label="Queue order" value={data.settings.orderMode} onChange={(event) => setOrderMode(event.currentTarget.value as "priority" | "manual")}>
              <option value="priority">Priority score</option>
              <option value="manual">Manual order</option>
            </select>
          </label>
          {data.settings.orderMode === "manual" && <span className="manual-indicator">Manual order active</span>}
          {data.settings.orderMode === "priority" && <span className="muted">Highest priority first; ties use smaller estimates.</span>}
        </div>

        {orderedRequests.length === 0 ? (
          <div className="empty-state">{data.requests.length === 0 ? "Your queue is clear. Add a request above to get started." : "No requests match these filters."}</div>
        ) : (
          <div className="table-scroll">
            <table className="owner-table">
              <thead>
                <tr>
                  <th scope="col">Request</th>
                  <th scope="col">Requester / team</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="numeric">Estimate</th>
                  <th scope="col" className="numeric">Impact</th>
                  <th scope="col" className="numeric">Urgency</th>
                  <th scope="col" className="numeric">Priority</th>
                  <th scope="col">Queue outlook</th>
                  <th scope="col">Added</th>
                  <th scope="col"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {orderedRequests.map((request) => {
                  const queueIndex = queue.findIndex((item) => item.id === request.id);
                  return (
                    <tr key={request.id}>
                      <td className="editable-title">
                        <input
                          aria-label={`Title for ${request.title}`}
                          maxLength={120}
                          value={request.title}
                          onChange={(event) => updateRequest(request.id, { title: event.currentTarget.value })}
                        />
                        <input
                          className="description-input"
                          aria-label={`Description for ${request.title}`}
                          maxLength={240}
                          value={request.description}
                          onChange={(event) => updateRequest(request.id, { description: event.currentTarget.value })}
                          placeholder="Add a short description"
                        />
                      </td>
                      <td>
                        <input
                          className="compact-input"
                          aria-label={`Requester for ${request.title}`}
                          maxLength={80}
                          value={request.requester}
                          onChange={(event) => updateRequest(request.id, { requester: event.currentTarget.value })}
                          placeholder="Requester"
                        />
                        <input
                          className="compact-input muted-input"
                          aria-label={`Team for ${request.title}`}
                          list="team-suggestions"
                          maxLength={80}
                          value={request.team}
                          onChange={(event) => updateRequest(request.id, { team: event.currentTarget.value })}
                          placeholder="Team"
                        />
                      </td>
                      <td>
                        <select
                          className={`table-status status-${request.status}`}
                          aria-label={`Status for ${request.title}`}
                          value={request.status}
                          onChange={(event) => updateRequest(request.id, { status: event.currentTarget.value as RequestStatus })}
                        >
                          {statusOrder.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
                        </select>
                      </td>
                      <td className="numeric">
                        <input
                          className="number-input"
                          aria-label={`Estimate hours for ${request.title}`}
                          type="number"
                          min="0.25"
                          step="0.25"
                          value={request.estimateHours}
                          onChange={(event) => {
                            const value = event.currentTarget.valueAsNumber;
                            if (Number.isFinite(value) && value > 0) updateRequest(request.id, { estimateHours: value });
                          }}
                        />
                      </td>
                      <td className="numeric">
                        <ScoreSelect title={request.title} label="Impact" value={request.impact} onChange={(value) => updateRequest(request.id, { impact: value })} />
                      </td>
                      <td className="numeric">
                        <ScoreSelect title={request.title} label="Urgency" value={request.urgency} onChange={(value) => updateRequest(request.id, { urgency: value })} />
                      </td>
                      <td className="numeric"><span className="priority-score">{calculatePriority(request)}</span></td>
                      <td>
                        {request.status === "queued"
                          ? <span className="projection-label">#{queueIndex + 1} · Week {projection.projectedWeeksById.get(request.id)}</span>
                          : <span className="muted">—</span>}
                      </td>
                      <td><span className="date-cell">{new Date(request.dateAdded).toLocaleDateString()}</span></td>
                      <td className="row-actions">
                        {request.status === "queued" && data.settings.orderMode === "manual" && (
                          <span className="move-actions">
                            <button type="button" aria-label={`Move ${request.title} up`} disabled={queueIndex <= 0} onClick={() => moveQueuedRequest(request.id, -1)}>↑</button>
                            <button type="button" aria-label={`Move ${request.title} down`} disabled={queueIndex >= queue.length - 1} onClick={() => moveQueuedRequest(request.id, 1)}>↓</button>
                          </span>
                        )}
                        <button className="delete-button" type="button" aria-label={`Delete ${request.title}`} onClick={() => deleteRequest(request.id)}>×</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel publish-panel">
        <div>
          <p className="eyebrow">Publish a snapshot</p>
          <h2>Share your current plan</h2>
          <p className="muted">Download a read-only snapshot, then replace <code>public/shared-snapshot.json</code> in the repository and publish it with GitHub Pages.</p>
          <label className="toggle-row">
            <input type="checkbox" checked={includeScores} onChange={(event) => setIncludeScores(event.currentTarget.checked)} />
            <span>Include impact and urgency scores in the public snapshot</span>
          </label>
          <p className="privacy-note">Anyone with the shared URL can view published details. Scores are omitted by default.</p>
        </div>
        <div className="publish-actions">
          <a className="share-link" href={shareUrl} target="_blank" rel="noreferrer">Preview shared view <span aria-hidden="true">↗</span></a>
          <button className="button button-primary" type="button" onClick={() => {
            downloadJson("shared-snapshot.json", createSharedSnapshot(data, includeScores));
            setFeedback("Snapshot downloaded. Replace public/shared-snapshot.json and publish the site to update the shared view.");
          }}>Download snapshot</button>
        </div>
      </section>
      <footer className="footer-note">Your owner data is stored in this browser. Export a backup regularly to move it to another device.</footer>
    </main>
  );
}

function ScoreSelect({ title, label, value, onChange }: { title: string; label: string; value: number; onChange: (value: number) => void }) {
  return (
    <select aria-label={`${label} for ${title}`} value={value} onChange={(event) => onChange(Number(event.currentTarget.value))}>
      {[1, 2, 3, 4, 5].map((score) => <option key={score} value={score}>{score}</option>)}
    </select>
  );
}

export function App() {
  const [showSharedView, setShowSharedView] = useState(window.location.hash === "#share");

  useEffect(() => {
    const updateView = () => setShowSharedView(window.location.hash === "#share");
    window.addEventListener("hashchange", updateView);
    return () => window.removeEventListener("hashchange", updateView);
  }, []);

  return showSharedView ? <SharedView /> : <OwnerView />;
}
