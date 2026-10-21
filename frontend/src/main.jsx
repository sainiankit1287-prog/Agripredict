import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
import agricultureLogo from "../utilis/agriculture_logo.svg";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
const inputRanges = {
  N: { min: 0, max: 140, step: 1, unit: "" },
  P: { min: 5, max: 145, step: 1, unit: "" },
  K: { min: 5, max: 205, step: 1, unit: "" },
  temperature: { min: 8.8, max: 43.7, step: 0.1, unit: "°C" },
  humidity: { min: 14.3, max: 100, step: 0.1, unit: "%" },
  ph: { min: 3.5, max: 9.9, step: 0.1, unit: "" },
  rainfall: { min: 20.2, max: 298.6, step: 0.1, unit: "mm" },
};
const initialValues = { N: "90", P: "42", K: "43", temperature: "20.8", humidity: "82", ph: "6.5", rainfall: "202" };

async function request(path, options = {}, token) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || "Something went wrong.");
  return data;
}

function App() {
  const [session, setSession] = useState(() => JSON.parse(localStorage.getItem("agripredict_session") || "null"));
  const [mode, setMode] = useState("login");
  const [auth, setAuth] = useState({ username: "", email: "", password: "" });
  const [values, setValues] = useState(initialValues);
  const [result, setResult] = useState("");
  const [history, setHistory] = useState([]);
  const [showActivityDrawer, setShowActivityDrawer] = useState(false);
  const [deletingHistoryId, setDeletingHistoryId] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  useEffect(() => {
    if (session) request("/history", {}, session.token).then(setHistory).catch(() => logout());
  }, []);

  useEffect(() => {
    if (!showActivityDrawer) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setShowActivityDrawer(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [showActivityDrawer]);

  const logout = () => {
    localStorage.removeItem("agripredict_session");
    setSession(null);
    setHistory([]);
    setResult("");
  };

  const clearHistory = async () => {
    setLoading(true); setError("");
    try {
      await request("/history", { method: "DELETE" }, session.token);
      setHistory([]);
      setConfirmation(null);
    } catch (requestError) { setError(requestError.message); }
    finally { setLoading(false); }
  };

  const deleteHistoryItem = async (historyId) => {
    setDeletingHistoryId(historyId); setError("");
    try {
      await request(`/history/${historyId}`, { method: "DELETE" }, session.token);
      setHistory((currentHistory) => currentHistory.filter((item) => item.id !== historyId));
      setConfirmation(null);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setDeletingHistoryId(null);
    }
  };

  const deleteAccount = async () => {
    setLoading(true); setError("");
    try {
      await request("/auth/me", { method: "DELETE" }, session.token);
      setConfirmation(null);
      logout();
    } catch (requestError) { setError(requestError.message); }
    finally { setLoading(false); }
  };

  const submitAuth = async (event) => {
    event.preventDefault();
    setLoading(true); setError("");
    try {
      const data = await request(`/auth/${mode}`, { method: "POST", body: JSON.stringify(auth) });
      localStorage.setItem("agripredict_session", JSON.stringify(data));
      setSession(data); setAuth({ username: "", email: "", password: "" });
      setHistory(await request("/history", {}, data.token));
    } catch (requestError) { setError(requestError.message); }
    finally { setLoading(false); }
  };

  const submitPrediction = async (event) => {
    event.preventDefault();
    setLoading(true); setError(""); setResult("");
    try {
      const invalidField = Object.entries(values).find(([field, value]) => {
        const number = Number(value);
        return value.trim() === "" || !Number.isFinite(number) || number < inputRanges[field].min || number > inputRanges[field].max;
      });
      if (invalidField) {
        const [field] = invalidField;
        throw new Error(`${field} must be between ${inputRanges[field].min} and ${inputRanges[field].max}.`);
      }
      const data = await request(
        "/predict",
        { method: "POST", body: JSON.stringify(Object.fromEntries(Object.entries(values).map(([field, value]) => [field, Number(value)]))) },
        session.token,
      );
      setResult(data.crop);
      setHistory(await request("/history", {}, session.token));
    } catch (requestError) {
      if (requestError.message.includes("session")) logout();
      setError(requestError.message);
    } finally { setLoading(false); }
  };

  const useSampleValues = () => {
    setValues(initialValues);
    setError("");
    setResult("");
  };

  const resetValues = () => {
    setValues(Object.fromEntries(Object.keys(initialValues).map((field) => [field, ""])));
    setError("");
    setResult("");
  };

  const fieldGroups = [
    { title: "Soil nutrients", description: "The mineral profile of your soil.", fields: ["N", "P", "K", "ph"] },
    { title: "Weather conditions", description: "Current conditions around your field.", fields: ["temperature", "humidity", "rainfall"] },
  ];

  const fieldLabels = { N: "Nitrogen", P: "Phosphorus", K: "Potassium", temperature: "Temperature", humidity: "Humidity", ph: "pH", rainfall: "Rainfall" };
  const fieldRanges = { N: "0–140", P: "5–145", K: "5–205", temperature: "8.8–43.7", humidity: "14.3–100", ph: "3.5–9.9", rainfall: "20.2–298.6" };

  if (!session) return (
    <main className="auth-shell">
      <section className="auth-card">
        <img className="brand-logo" src={agricultureLogo} alt="AgriPredict agriculture logo" />
        <p className="eyebrow">Smart agriculture</p>
        <h1>AgriPredict</h1>
        <p className="intro">Make every growing decision with a little more confidence.</p>
        <div className="tabs">
          <button className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>Sign in</button>
          <button className={mode === "register" ? "active" : ""} onClick={() => setMode("register")}>Create account</button>
        </div>
        <form onSubmit={submitAuth}>
          {mode === "register" && <label>Username<input value={auth.username} onChange={(e) => setAuth({ ...auth, username: e.target.value })} required /></label>}
          <label>Email<input type="email" value={auth.email} onChange={(e) => setAuth({ ...auth, email: e.target.value })} required /></label>
          <label>Password<input type="password" minLength="8" value={auth.password} onChange={(e) => setAuth({ ...auth, password: e.target.value })} required /></label>
          <button className="primary" disabled={loading}>{loading ? "Please wait..." : mode === "login" ? "Sign in" : "Create account"}</button>
        </form>
        {error && <p className="error">{error}</p>}
      </section>
    </main>
  );

  return (
    <main className="dashboard">
      <header className="topbar">
        <div className="brand-heading"><img className="brand-logo dashboard-logo" src={agricultureLogo} alt="AgriPredict agriculture logo" /><div><p className="eyebrow">Smart agriculture</p><h1>AgriPredict</h1></div></div>
        <div className="header-actions"><button className="history-trigger" type="button" aria-label="Open prediction history" onClick={() => setShowActivityDrawer(true)}><span aria-hidden="true">◷</span>{history.length > 0 && <span className="header-history-count">{history.length}</span>}</button><div className="account-menu"><button className="user-trigger" type="button" aria-expanded={userMenuOpen} onClick={() => setUserMenuOpen((open) => !open)}><span className="avatar">{session.user.username.slice(0, 1).toUpperCase()}</span><span className="user-name">{session.user.username}</span><span className="chevron">⌄</span></button>{userMenuOpen && <div className="user-menu"><p>Signed in as<br /><strong>{session.user.email}</strong></p><button onClick={logout}>Log out</button><button className="menu-danger" onClick={() => { setUserMenuOpen(false); setConfirmation({ type: "delete-account" }); }}>Delete account</button></div>}</div></div>
      </header>

      <section className="page-intro" id="recommend"><div><p className="eyebrow">Crop recommendation</p><h2>Make your next growing decision with confidence.</h2><p>Share your field conditions and our model will suggest the crop best suited to them.</p></div></section>

      <div className="content-grid">
        <section className="card prediction-card">
          <div className="card-heading"><div><p className="eyebrow">Field inputs</p><h3>Tell us about your field</h3></div><div className="heading-actions"><button className="text-button" type="button" onClick={useSampleValues}>Use sample values</button><button className="reset-button" type="button" onClick={resetValues}>Reset</button></div></div>
          <form onSubmit={submitPrediction} className="prediction-form">
            {fieldGroups.map((group) => <fieldset key={group.title}><legend>{group.title}</legend><p className="section-help">{group.description}</p><div className="field-grid">{group.fields.map((field) => <div className="field-wrap" key={field}><label htmlFor={`input-${field}`}>{fieldLabels[field]}</label><div className="input-shell"><input id={`input-${field}`} name={field} type="number" step={inputRanges[field].step} min={inputRanges[field].min} max={inputRanges[field].max} value={values[field]} onChange={(e) => setValues({ ...values, [field]: e.target.value })} aria-describedby={`help-${field}`} required /><span>{inputRanges[field].unit || "value"}</span></div><small id={`help-${field}`}>Typical range: {fieldRanges[field]}{inputRanges[field].unit ? ` ${inputRanges[field].unit}` : ""}</small></div>)}</div></fieldset>)}
            <button className="primary recommend-button" disabled={loading}>{loading ? <><span className="spinner" /> Analyzing field...</> : "Recommend crop"}<span>→</span></button>
          </form>
          {error && <p className="error" role="alert" aria-live="assertive">{error}</p>}
        </section>

        <section className={`card result-panel ${loading ? "is-loading" : ""}`} aria-live="polite">
          <div className="card-heading"><div><p className="eyebrow">Your recommendation</p><h3>Best crop for your field</h3></div></div>
          {loading ? <div className="result-skeleton"><span /><span /><span /></div> : result ? <div className="result-success"><div className="crop-icon">🌱</div><p className="result-label">Recommended crop</p><h2>{result}</h2><p>Based on the soil nutrients and weather conditions you entered, this crop is the strongest match for your field.</p><div className="input-summary"><strong>Inputs analyzed</strong><span>{values.N} N · {values.P} P · {values.K} K · {values.temperature}°C</span></div></div> : <div className="result-empty"><div className="empty-icon">✦</div><h4>Your recommendation will appear here</h4><p>Complete the field inputs and select “Recommend crop” to get started.</p></div>}
          {result && <button className="retry-button" type="button" onClick={submitPrediction} disabled={loading}>Run again</button>}
          <div className="recent-recommendations"><div><strong>Recent recommendations</strong><button type="button" onClick={() => setShowActivityDrawer(true)}>View all</button></div>{history.slice(0, 3).map((item) => <div className="recent-item" key={item.id}><span><strong>{item.crop}</strong><small>{new Date(`${item.created_at}Z`).toLocaleDateString()}</small></span></div>)}</div>
        </section>
      </div>
      <footer>AgriPredict © 2026 <span>Built for better growing decisions.</span></footer>
      {showActivityDrawer && <div className="drawer-backdrop" role="presentation" onClick={() => setShowActivityDrawer(false)}><aside className="activity-drawer" role="dialog" aria-modal="true" aria-labelledby="activity-drawer-title" onClick={(event) => event.stopPropagation()}><div className="drawer-heading"><div><p className="eyebrow">Activities</p><h2 id="activity-drawer-title">Prediction history</h2></div><button className="drawer-close" type="button" aria-label="Close activities" onClick={() => setShowActivityDrawer(false)}>×</button></div><div className="drawer-toolbar"><span className="count">{history.length}</span><button className="clear-history-button" onClick={() => setConfirmation({ type: "clear-history" })} disabled={loading || history.length === 0}>Clear history</button></div>{history.length === 0 ? <p className="empty">No predictions yet. Your recommendations will show up here.</p> : <div className="history-list">{history.map((item) => <article key={item.id}><div><strong>{item.crop}</strong><small>{new Date(`${item.created_at}Z`).toLocaleString()}</small></div><span>{item.inputs.N} N · {item.inputs.rainfall} mm</span><div className="history-item-actions"><button className="delete-button" aria-label="Delete prediction" onClick={() => setConfirmation({ type: "history-item", historyId: item.id })}>⌫</button></div></article>)}</div>}</aside></div>}
      {confirmation && <div className="modal-backdrop" role="presentation" onClick={() => !loading && setConfirmation(null)}><section className="confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="confirmation-title" onClick={(event) => event.stopPropagation()}><div className="modal-icon">!</div><h2 id="confirmation-title">{confirmation.type === "delete-account" ? "Delete account?" : confirmation.type === "clear-history" ? "Clear prediction history?" : "Delete this prediction?"}</h2><p>{confirmation.type === "delete-account" ? "Your account and all saved prediction history will be permanently deleted." : confirmation.type === "clear-history" ? "All of your saved predictions will be permanently deleted." : "This prediction will be permanently removed from your history."}</p><div className="modal-actions"><button className="cancel-button" onClick={() => setConfirmation(null)} disabled={loading}>Cancel</button><button className="delete-button" onClick={() => confirmation.type === "delete-account" ? deleteAccount() : confirmation.type === "clear-history" ? clearHistory() : deleteHistoryItem(confirmation.historyId)} disabled={loading}>{loading ? "Deleting..." : "Delete"}</button></div></section></div>}
    </main>
  );
}

createRoot(document.getElementById("root")).render(<StrictMode><App /></StrictMode>);
