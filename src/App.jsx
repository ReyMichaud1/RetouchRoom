import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  HashRouter,
  Routes,
  Route,
  Link,
  Navigate,
  useLocation,
  useParams,
  useNavigate,
} from "react-router-dom";
import { db, auth } from "./firebase";
import {
  collection,
  addDoc,
  setDoc,
  serverTimestamp,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
  getDoc,
  getDocs,
  where,
  updateDoc,
} from "firebase/firestore";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";

/* ────────────────────────────────────────────────────────────────
   Cloudinary (unsigned)
──────────────────────────────────────────────────────────────── */
const CLOUD_NAME = "dwcgdkoxd";
const UPLOAD_PRESET = "retouch-markup";
const CLOUD_ROOT = "retouch";

/* ────────────────────────────────────────────────────────────────
   Shared-Login (env)
   VITE_SHARED_USERNAME="Markup,ClientA"
   VITE_SHARED_DOMAIN="retouch.local"
──────────────────────────────────────────────────────────────── */
const SHARED_DOMAIN =
  import.meta.env.VITE_SHARED_DOMAIN && String(import.meta.env.VITE_SHARED_DOMAIN).trim()
    ? String(import.meta.env.VITE_SHARED_DOMAIN).trim()
    : "retouch.local";
const SHARED_USERNAMES = (import.meta.env.VITE_SHARED_USERNAME || "Markup")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const isoDate = (d = new Date()) => d.toISOString().slice(0, 10);

/* ────────────────────────────────────────────────────────────────
   Root App + Auth Guard
──────────────────────────────────────────────────────────────── */
export default function App() {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const off = onAuthStateChanged(auth, (u) => {
      setUser(u || null);
      setAuthReady(true);
    });
    return () => off();
  }, []);

  function RequireAuth({ children }) {
    const location = useLocation();
    if (!authReady) return <div style={{ padding: 24 }}>Loading…</div>;
    if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
    return children;
  }

  const doSignOut = async () => {
    try {
      await signOut(auth);
    } catch (e) {
      alert(e.message || "Sign out failed");
    }
  };

  const goHome = (e) => {
    e.preventDefault();
    window.dispatchEvent(new CustomEvent("goHome"));
  };

  return (
    <HashRouter>
      <StyleInjector />
      <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
        <header className="topbar">
          <a href="#/" className="brand" onClick={goHome} style={{ textDecoration: "none", color: "inherit" }}>
            Retouch Room - Markups
          </a>
          <nav className="nav">
            {user ? (
              <>
                <a href="#/" className="navlink" onClick={goHome}>Home</a>
                <span className="dot">•</span>
                <Link to="/help" className="navlink">Help</Link>
                <span className="dot">•</span>
                <span className="navlink" style={{ opacity: 0.8 }}>{user.email}</span>
                <button className="danger" style={{ marginLeft: 8 }} onClick={doSignOut}>Sign out</button>
              </>
            ) : (
              <Link to="/login" className="navlink">Sign in</Link>
            )}
          </nav>
        </header>

        <div style={{ flex: 1, minHeight: 0 }}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/"
              element={
                <RequireAuth>
                  <Home />
                </RequireAuth>
              }
            />
            <Route
              path="/view/:projectId/:folderId/:imageId"
              element={
                <RequireAuth>
                  <ImageViewer />
                </RequireAuth>
              }
            />
            <Route
              path="/help"
              element={
                <RequireAuth>
                  <Help />
                </RequireAuth>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>
    </HashRouter>
  );
}

/* ────────────────────────────────────────────────────────────────
   Tiny CSS injector (sliders/popouts/comment DnD + clickable rows)
──────────────────────────────────────────────────────────────── */
function StyleInjector() {
  return (
    <style>{`
      .pop-card {
        background: rgba(17,24,39,.92);
        border: 1px solid rgba(255,255,255,.14);
        border-radius: 12px;
        padding: 10px 12px;
        color: #e5e7eb;
        box-shadow: 0 10px 30px rgba(0,0,0,.35), 0 0 0 1px rgba(255,255,255,.04) inset;
        backdrop-filter: blur(6px);
      }
      .vrange {
        -webkit-appearance: none; appearance: none;
        width: 160px; height: 28px; transform: rotate(-90deg);
        background: transparent; outline: none;
      }
      .vrange::-webkit-slider-runnable-track {
        height: 6px; background: linear-gradient(90deg,#0ea5e9,#22d3ee);
        border-radius: 999px; box-shadow: 0 2px 10px rgba(0,0,0,.35) inset;
      }
      .vrange::-moz-range-track { height: 6px; background: linear-gradient(90deg,#0ea5e9,#22d3ee); border-radius: 999px; }
      .vrange::-webkit-slider-thumb {
        -webkit-appearance: none; width: 16px; height: 16px; border-radius: 50%;
        background: #3b82f6; border: 2px solid #e5f0ff; margin-top: -5px; box-shadow: 0 1px 4px rgba(0,0,0,.4);
      }
      .vrange::-moz-range-thumb { width: 16px; height: 16px; border-radius: 50%; background: #3b82f6; border: 2px solid #e5f0ff; }

      .pop-grid { display: grid; grid-template-columns: 36px 1fr; align-items: center; gap: 12px; min-width: 220px; }
      .pop-rail { width: 36px; height: 170px; display: flex; align-items: center; justify-content: center; }
      .pop-labels { display: flex; flex-direction: column; gap: 6px; }
      .pop-title { font-size: 12px; font-weight: 600; opacity: .9; }
      .pop-value { font-size: 12px; opacity: .85; }

      .comment-dropwrap { position: relative; }
      .comment-dropwrap.drag-in textarea {
        border: 2px dashed #06b6d4 !important;
        background: rgba(6,182,212,0.06);
      }
      .drop-hint { font-size: 12px; color: #6b7280; margin: 6px 2px 0; }
      .chip { display:inline-flex; align-items:center; gap:6px; padding:4px 8px; border-radius:999px; background:#0f172a; color:#e5e7eb; border:1px solid rgba(255,255,255,.1); font-size:12px; margin-top:6px; }
      .chip button { background:none; border:none; color:#e5e7eb; cursor:pointer; }

      .row-click { cursor: pointer; border-radius: 10px; transition: background .15s ease, border-color .15s ease; }
      .row-click:hover { background: rgba(59,130,246,.08); }
      .row-title { font-weight: 600; }
      .crumbs { font-size: 13px; color: #6b7280; display: flex; gap: 6px; align-items:center; flex-wrap: wrap; }
      .crumbs a { color: #0d8dea; text-decoration: none; cursor: pointer; }
      .crumbs .sep { opacity: .6; }

      .pill { display:inline-flex; align-items:center; gap:6px; padding:4px 10px; border-radius:999px; background:#0b1220; border:1px solid rgba(255,255,255,.12); color:#c7d2fe; font-size:12px; }
      .pill .small { font-size: 11px; color: #9ca3af; }
      .pill .rm { cursor:pointer; color:#fca5a5; margin-left: 6px; }
      .pill + .pill { margin-left: 6px; }
    `}</style>
  );
}

/* ────────────────────────────────────────────────────────────────
   Breadcrumbs
──────────────────────────────────────────────────────────────── */
function Breadcrumbs({ project, folder, onRoot, onProject }) {
  return (
    <div className="crumbs" style={{ margin: "8px 0 16px" }}>
      <a onClick={onRoot}>Projects</a>
      {project && (
        <>
          <span className="sep">›</span>
          <a onClick={onProject}>{project.name}</a>
        </>
      )}
      {folder && (
        <>
          <span className="sep">›</span>
          <span>{folder.name}</span>
        </>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────
   Login
──────────────────────────────────────────────────────────────── */
function Login() {
  const nav = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || "/";

  const [username, setUsername] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const toEmail = (u) => {
    const trimmed = (u || "").trim();
    if (trimmed.includes("@")) return trimmed; // allow direct email
    const uname = trimmed.toLowerCase();
    const match = SHARED_USERNAMES.find((n) => n.toLowerCase() === uname);
    const finalName = match || uname;
    return `${finalName}@${SHARED_DOMAIN}`;
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      await signInWithEmailAndPassword(auth, toEmail(username), pw);
      nav(from, { replace: true });
    } catch (e) {
      const code = e?.code || "";
      if (code.includes("operation-not-allowed")) setErr("Email/Password is not enabled in Firebase.");
      else if (code.includes("user-not-found") || code.includes("wrong-password")) setErr("Invalid username or password.");
      else if (code.includes("too-many-requests")) setErr("Too many attempts—try again later.");
      else setErr(e.message || "Sign in failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="wrap" style={{ height: "100%", display: "grid", placeItems: "center" }}>
      <form className="card" onSubmit={onSubmit} style={{ minWidth: 340, maxWidth: 420 }}>
        <h2 style={{ marginBottom: 12 }}>Sign in</h2>
        <input
          type="text"
          placeholder="Username (e.g., Markup) or email"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          autoFocus
        />
        <input
          type="password"
          placeholder="Password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          minLength={6}
          required
          style={{ marginTop: 8 }}
          autoComplete="current-password"
        />
        {err && <div className="muted" style={{ color: "#ef4444", marginTop: 8 }}>{err}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        </div>
        <div className="muted" style={{ marginTop: 10 }}>
          Use the shared credentials you were given.
        </div>
      </form>
    </main>
  );
}

/* ────────────────────────────────────────────────────────────────
   Home (Projects → Rounds → Images) with Access Control + Manage Access
──────────────────────────────────────────────────────────────── */
function Home() {
  const userEmail = auth.currentUser?.email || "";

  // Projects
  const [projects, setProjects] = useState([]);
  const [projectName, setProjectName] = useState("");
  const [dropboxLink, setDropboxLink] = useState("");
  const [allowedRaw, setAllowedRaw] = useState(""); // comma-separated usernames or emails
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [deletingProjectId, setDeletingProjectId] = useState(null);

  // Folders (Rounds)
  const [folders, setFolders] = useState([]);
  const [activeFolderId, setActiveFolderId] = useState(null);
  const [creatingFolder, setCreatingFolder] = useState(false);

  // Folder rename
  const [editingFolderId, setEditingFolderId] = useState(null);
  const [editFolderName, setEditFolderName] = useState("");

  // Images
  const [images, setImages] = useState([]);

  // Upload UI + toast
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);
  const [notice, setNotice] = useState(null);
  const showNotice = (msg, type = "ok") => {
    setNotice({ msg, type });
    window.clearTimeout(showNotice.tid);
    showNotice.tid = window.setTimeout(() => setNotice(null), 2800);
  };

  // Allow topbar "Home" to reset the view
  useEffect(() => {
    const fn = () => { setActiveProjectId(null); setActiveFolderId(null); };
    window.addEventListener("goHome", fn);
    return () => window.removeEventListener("goHome", fn);
  }, []);

  /** Projects live — ONLY those where current user is allowed (no orderBy; client-side sort) */
  useEffect(() => {
    if (!userEmail) return;
    const qy = query(
      collection(db, "projects"),
      where("allowedEmails", "array-contains", userEmail)
    );
    const stop = onSnapshot(
      qy,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        // newest first (createdAt may be missing briefly; treat as 0)
        list.sort((a, b) => {
          const aSec = a.createdAt?.seconds ?? 0;
          const bSec = b.createdAt?.seconds ?? 0;
          return bSec - aSec;
        });
        setProjects(list);
        if (activeProjectId && !list.find((p) => p.id === activeProjectId)) {
          setActiveProjectId(null);
          setActiveFolderId(null);
        }
      },
      (err) => {
        console.error("Projects query error:", err);
        alert(err?.message || "Failed to load projects");
      }
    );
    return () => stop();
    // eslint-disable-next-line
  }, [userEmail, activeProjectId]);

  /** Folders live */
  useEffect(() => {
    if (!activeProjectId) {
      setFolders([]);
      setActiveFolderId(null);
      return;
    }
    const qy = query(collection(db, "projects", activeProjectId, "folders"), orderBy("createdAt", "desc"));
    const stop = onSnapshot(qy, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setFolders(list);
      if (activeFolderId && !list.find((f) => f.id === activeFolderId)) setActiveFolderId(null);
    });
    return () => stop();
  }, [activeProjectId, activeFolderId]);

  /** Images live */
  useEffect(() => {
    if (!activeProjectId || !activeFolderId) {
      setImages([]);
      return;
    }
    const qy = query(
      collection(db, "projects", activeProjectId, "folders", activeFolderId, "images"),
      orderBy("uploadedAt", "desc")
    );
    const stop = onSnapshot(qy, (snap) => setImages(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
    return () => stop();
  }, [activeProjectId, activeFolderId]);

  /** Helpers for allowed list */
  const toEmail = (token) => {
    const t = (token || "").trim();
    if (!t) return null;
    if (t.includes("@")) return t.toLowerCase();
    return `${t.toLowerCase()}@${SHARED_DOMAIN}`;
  };
  const parseAllowed = (raw) => {
    const parts = (raw || "").split(",").map((s) => s.trim()).filter(Boolean);
    return parts.map(toEmail).filter(Boolean);
  };

  /** Actions */
  const createProject = async () => {
    const name = projectName.trim();
    if (!name) return;

    const parsed = parseAllowed(allowedRaw);
    const allowed = Array.from(new Set([userEmail, ...parsed])).filter(Boolean);

    try {
      await addDoc(collection(db, "projects"), {
        name,
        dropbox: dropboxLink.trim() || null,
        ownerUid: auth.currentUser?.uid || null,
        ownerEmail: userEmail || null,
        allowedEmails: allowed,
        createdAt: serverTimestamp(),
      });
      setProjectName("");
      setDropboxLink("");
      setAllowedRaw("");
      setActiveProjectId(null);
      setActiveFolderId(null);
      showNotice(`Created project “${name}” ✅`, "ok");
    } catch (e) {
      alert(e.message || "Failed to create project");
    }
  };

  const deleteProject = async (id, name, ownerEmail) => {
    if (ownerEmail !== userEmail) {
      alert("Only the project owner can delete this project.");
      return;
    }
    const ok = window.confirm(`Are you sure you want to delete the project “${name}”? This cannot be undone.`);
    if (!ok) return;
    try {
      setDeletingProjectId(id);
      await deleteDoc(doc(db, "projects", id));
      if (id === activeProjectId) { setActiveProjectId(null); setActiveFolderId(null); }
    } catch (e) {
      alert(e.message || "Failed to delete project");
    } finally {
      setDeletingProjectId(null);
    }
  };

  // Next "Round N"
  const nextRoundNumber = () => {
    let max = 0;
    for (const f of folders) {
      const m = /^Round\s+(\d+)/i.exec(f.name || "");
      if (m) {
        const n = parseInt(m[1], 10);
        if (!Number.isNaN(n)) max = Math.max(max, n);
      }
    }
    return max + 1;
  };

  const createRound = async () => {
    if (!activeProjectId) return alert("Select a project first.");
    try {
      setCreatingFolder(true);
      const n = nextRoundNumber();
      const name = `Round ${n} — ${isoDate()}`;
      await addDoc(collection(db, "projects", activeProjectId, "folders"), {
        name,
        createdAt: serverTimestamp(),
      });
      showNotice(`Created ${name} ✅ (click to open)`, "ok");
    } catch (e) {
      alert(e.message || "Failed to create round.");
    } finally {
      setCreatingFolder(false);
    }
  };

  // Rename folder
  const startRenameFolder = (f) => {
    setEditingFolderId(f.id);
    setEditFolderName(f.name || "");
  };
  const cancelRenameFolder = () => { setEditingFolderId(null); setEditFolderName(""); };
  const saveRenameFolder = async () => {
    if (!editingFolderId) return;
    const newName = (editFolderName || "").trim();
    if (!newName) return;
    try {
      const fref = doc(db, "projects", activeProjectId, "folders", editingFolderId);
      await updateDoc(fref, { name: newName, updatedAt: serverTimestamp() });
      cancelRenameFolder();
      showNotice("Folder name updated ✅", "ok");
    } catch (e) {
      alert(e.message || "Failed to rename folder");
    }
  };

  // Upload to Cloudinary then save metadata to Firestore
  const handleUpload = async (fileList) => {
    if (!activeProjectId || !activeFolderId) return alert("Select a project and folder first.");
    const files = Array.from(fileList || []);
    if (!files.length) return;

    const folderObj = folders.find((f) => f.id === activeFolderId);
    const folderLabel = folderObj?.name || "unnamed";

    setIsUploading(true);
    try {
      for (const file of files) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("upload_preset", UPLOAD_PRESET);
        fd.append("folder", `${CLOUD_ROOT}/${activeProjectId}/${folderLabel}`);

        const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
          method: "POST",
          body: fd,
        });
        const data = await res.json();
        if (!res.ok) {
          showNotice(data.error?.message || "Cloudinary upload failed", "err");
          continue;
        }
        await addDoc(
          collection(db, "projects", activeProjectId, "folders", activeFolderId, "images"),
          {
            url: data.secure_url,
            publicId: data.public_id,
            format: data.format,
            bytes: data.bytes,
            width: data.width,
            height: data.height,
            name: file.name,
            uploadedAt: serverTimestamp(),
          }
        );
      }
      const n = files.length;
      showNotice(`Uploaded ${n} file${n > 1 ? "s" : ""} ✅`, "ok");
    } finally {
      setIsUploading(false);
    }
  };

  /** DnD for the image grid uploader */
  const onDragEnter = (e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); };
  const onDragOver  = (e) => { e.preventDefault(); e.stopPropagation(); };
  const onDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); if (e.currentTarget === e.target) setIsDragging(false); };
  const onDrop      = (e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); if (e.dataTransfer?.files?.length) handleUpload(e.dataTransfer.files); };

  const activeProject = useMemo(() => projects.find((p) => p.id === activeProjectId) || null, [projects, activeProjectId]);
  const activeFolder  = useMemo(() => folders.find((f) => f.id === activeFolderId) || null, [folders, activeFolderId]);

  /* Clickable row helpers (accessibility) */
  const rowKeyOpen = (openFn) => (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openFn();
    }
  };

  /* Manage Access helpers */
  const canManageAccess = activeProject && activeProject.ownerEmail === userEmail;
  const [addUserInput, setAddUserInput] = useState("");

  const currentAllowed = (activeProject?.allowedEmails || []).slice().sort();
  const addAllowedUser = async () => {
    if (!activeProject) return;
    const asEmailList = addUserInput
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((t) => (t.includes("@") ? t.toLowerCase() : `${t.toLowerCase()}@${SHARED_DOMAIN}`));

    if (asEmailList.length === 0) return;

    const updated = Array.from(new Set([...currentAllowed, ...asEmailList]));
    if (!updated.includes(activeProject.ownerEmail)) updated.push(activeProject.ownerEmail);

    try {
      await updateDoc(doc(db, "projects", activeProject.id), {
        allowedEmails: updated,
        updatedAt: serverTimestamp(),
      });
      setAddUserInput("");
      showNotice(`Access updated ✅`, "ok");
    } catch (e) {
      alert(e.message || "Failed to update access");
    }
  };

  const removeAllowedUser = async (email) => {
    if (!activeProject) return;
    if (email === activeProject.ownerEmail) {
      alert("You can’t remove the project owner.");
      return;
    }
    if (email === userEmail && currentAllowed.length <= 1) {
      alert("You can’t remove the last allowed user.");
      return;
    }
    const updated = currentAllowed.filter((e) => e !== email);
    try {
      await updateDoc(doc(db, "projects", activeProject.id), {
        allowedEmails: updated,
        updatedAt: serverTimestamp(),
      });
      showNotice(`Removed ${email} ✅`, "ok");
    } catch (e) {
      alert(e.message || "Failed to update access");
    }
  };

  return (
    <main className="wrap" style={{ height: "100%", overflow: "auto" }}>
      {/* Breadcrumbs */}
      <Breadcrumbs
        project={activeProject}
        folder={activeFolder}
        onRoot={() => { setActiveProjectId(null); setActiveFolderId(null); }}
        onProject={() => { setActiveFolderId(null); }}
      />

      {/* Projects (root) */}
      {!activeProject && (
        <>
          <section className="card">
            <h2>Create Project</h2>
            <input placeholder="Project Name" value={projectName} onChange={(e) => setProjectName(e.target.value)} />
            <input placeholder="Dropbox File Request Link (optional)" value={dropboxLink} onChange={(e) => setDropboxLink(e.target.value)} />
            <input
              placeholder="Allowed users (comma-separated usernames or emails)"
              value={allowedRaw}
              onChange={(e) => setAllowedRaw(e.target.value)}
              title={`Examples: "ClientA" or "clienta@${SHARED_DOMAIN}"`}
            />
            <button onClick={createProject}>Add Project</button>
            <div className="muted" style={{ marginTop: 6 }}>
              Tip: enter client usernames (we’ll convert to <code>@{SHARED_DOMAIN}</code>) or paste full emails.
            </div>
          </section>

          <section className="card">
            <h2>Projects</h2>
            {projects.length === 0 ? (
              <div className="muted">No projects yet — add one above, or your account is not allowed on existing projects.</div>
            ) : (
              projects.map((p) => {
                const isOwner = p.ownerEmail === userEmail;
                return (
                  <div
                    key={p.id}
                    className="project row-click"
                    title="Click to open project"
                    onClick={() => { setActiveProjectId(p.id); setActiveFolderId(null); }}
                    onKeyDown={rowKeyOpen(() => { setActiveProjectId(p.id); setActiveFolderId(null); })}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="project-name row-title">{p.name}</div>
                    {p.dropbox && (
                      <a href={p.dropbox} target="_blank" rel="noreferrer" className="dropbox" onClick={(e) => e.stopPropagation()}>
                        Dropbox link
                      </a>
                    )}
                    <div className="spacer" />
                    {isOwner && (
                      <button
                        className="danger"
                        onClick={(e) => { e.stopPropagation(); deleteProject(p.id, p.name, p.ownerEmail); }}
                        disabled={deletingProjectId === p.id}
                        title="Delete project"
                      >
                        {deletingProjectId === p.id ? "Deleting…" : "Delete"}
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </section>
        </>
      )}

      {/* Rounds (Folders) & Manage Access */}
      {activeProject && !activeFolder && (
        <>
          {/* Manage Access (owner only) */}
          <section className="card">
            <h2>Manage Access for “{activeProject.name}”</h2>
            <div style={{ margin: "6px 0 10px", display: "flex", flexWrap: "wrap", gap: 6 }}>
              <span className="pill">
                Owner: <strong>{activeProject.ownerEmail || "unknown"}</strong>
              </span>
              {(activeProject.allowedEmails || []).map((em) => (
                <span key={em} className="pill">
                  <span>{em}</span>
                  {canManageAccess && em !== activeProject.ownerEmail ? (
                    <span className="rm" onClick={() => removeAllowedUser(em)} title="Remove">✕</span>
                  ) : (
                    <span className="small">•</span>
                  )}
                </span>
              ))}
            </div>
            {canManageAccess ? (
              <>
                <div className="row" style={{ marginTop: 6, gap: 8 }}>
                  <input
                    placeholder={`Add users (comma-separated usernames or emails) • @${SHARED_DOMAIN}`}
                    value={addUserInput}
                    onChange={(e) => setAddUserInput(e.target.value)}
                    aria-label="Add allowed users"
                  />
                  <button onClick={addAllowedUser}>Add</button>
                </div>
                <div className="muted" style={{ marginTop: 6 }}>
                  Hint: “ClientA” becomes <code>clienta@{SHARED_DOMAIN}</code>. You can paste multiple, separated by commas.
                </div>
              </>
            ) : (
              <div className="muted">Only the project owner can change access.</div>
            )}
          </section>

          <section className="card">
            <h2>Rounds in “{activeProject.name}”</h2>
            <div className="row" style={{ marginTop: 8 }}>
              <button onClick={createRound} disabled={creatingFolder}>
                {creatingFolder ? "Creating…" : "Create Round"}
              </button>
              <button className="danger" style={{ marginLeft: 8 }} onClick={() => { setActiveProjectId(null); setActiveFolderId(null); }}>
                ← Back to Projects
              </button>
            </div>
          </section>

          <section className="card">
            <h2>All Rounds</h2>
            {folders.length === 0 ? (
              <div className="muted">No rounds yet — click <b>Create Round</b>.</div>
            ) : (
              folders.map((f) => {
                const isEditing = f.id === editingFolderId;
                return (
                  <div
                    key={f.id}
                    className={`project ${isEditing ? "" : "row-click"}`}
                    {...(!isEditing ? {
                      onClick: () => setActiveFolderId(f.id),
                      onKeyDown: rowKeyOpen(() => setActiveFolderId(f.id)),
                      role: "button",
                      tabIndex: 0,
                      title: "Click to open round"
                    } : {})}
                  >
                    {!isEditing ? (
                      <>
                        <div className="project-name row-title">📁 {f.name}</div>
                        <div className="spacer" />
                        <button
                          className="icon"
                          title="Rename"
                          onClick={(e) => { e.stopPropagation(); startRenameFolder(f); }}
                          style={{ margin-left: 8 }}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M13 5l6 6-8 8H5v-6z"/><path d="M16 4l4 4"/>
                          </svg>
                        </button>
                      </>
                    ) : (
                      <>
                        <input
                          value={editFolderName}
                          onChange={(e) => setEditFolderName(e.target.value)}
                          style={{ flex: 1, marginRight: 8 }}
                          aria-label="Folder name"
                          onClick={(e) => e.stopPropagation()}
                        />
                        <button onClick={(e) => { e.stopPropagation(); saveRenameFolder(); }}>Save</button>
                        <button className="danger" onClick={(e) => { e.stopPropagation(); cancelRenameFolder(); }} style={{ marginLeft: 6 }}>Cancel</button>
                      </>
                    )}
                  </div>
                );
              })
            )}
          </section>
        </>
      )}

      {/* Images */}
      {activeProject && activeFolder && (
        <>
          <section className="card">
            <h2>Images — {activeProject.name} / {activeFolder.name}</h2>
          </section>

          <section className="card">
            <h2>Upload Images</h2>
            <div
              className={`dropzone ${isDragging ? "is-dragging" : ""} ${isUploading ? "is-uploading" : ""}`}
              onDragEnter={onDragEnter} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
            >
              <p><strong>Drag & drop</strong> images here</p>
              <p className="muted">or</p>
              <button onClick={() => fileInputRef.current?.click()} disabled={isUploading}>Browse files</button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/png,image/jpeg,image/webp"
                style={{ display: "none" }}
                onChange={(e) => handleUpload(e.target.files)}
              />
              <small className="muted" style={{ display: "block", marginTop: 8 }}>
                Cloudinary path: <code>{CLOUD_ROOT}/{activeProjectId}/{activeFolder.name}</code>
              </small>
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <h2>Image List</h2>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setActiveFolderId(null)}>← Back to Rounds</button>
                <button className="danger" onClick={() => { setActiveFolderId(null); setActiveProjectId(null); }}>← Back to Projects</button>
              </div>
            </div>

            {images.length === 0 ? (
              <div className="muted" style={{ marginTop: 12 }}>No images yet for this round.</div>
            ) : (
              <div className="grid images">
                {images.map((img) => (
                  <div key={img.id} className="img-tile" title={img.name}>
                    <img src={img.url} alt={img.name} />
                    <div className="img-meta">
                      <div className="img-name" title={img.name}>{img.name}</div>
                      <div className="img-size">{img.width}×{img.height}</div>
                    </div>
                    <div className="img-actions">
                      <Link className="dropbox" to={`/view/${activeProjectId}/${activeFolderId}/${img.id}`}>Open Markup</Link>
                      <a className="dropbox" href={img.url} target="_blank" rel="noreferrer">Open Image</a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {notice && (
        <div className={`toast ${notice.type}`} role="status" aria-live="polite">
          {notice.msg}
        </div>
      )}
    </main>
  );
}

/* ────────────────────────────────────────────────────────────────
   Image Viewer (zoom-at-center, cyan outline, edit comments, DnD ref)
──────────────────────────────────────────────────────────────── */
function ImageViewer() {
  const { projectId, folderId, imageId } = useParams();
  const navigate = useNavigate();

  const [imageDoc, setImageDoc] = useState(null);

  const [serverStrokes, setServerStrokes] = useState([]);
  const [localStrokes, setLocalStrokes] = useState([]);
  const [comments, setComments] = useState([]);

  const [mode, setMode] = useState("select");
  const [color, setColor] = useState("#ff2d55");
  const [brush, setBrush] = useState(6);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 20, y: 20 });

  const viewportRef = useRef(null);
  const canvasRef = useRef(null);
  const imgRef = useRef(null);

  const [drawing, setDrawing] = useState(false);
  const [panning, setPanning] = useState(false);
  const [currentPath, setCurrentPath] = useState([]);
  const [selectedMarkupId, setSelectedMarkupId] = useState(null);

  const [commentText, setCommentText] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [refFile, setRefFile] = useState(null);
  const [refPreview, setRefPreview] = useState(null);
  const [selectedCommentId, setSelectedCommentId] = useState(null);

  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");
  const [editLink, setEditLink] = useState("");

  const commentRefs = useRef({});
  const commentBoxRef = useRef(null);
  const didFit = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const offsetStart = useRef({ x: 0, y: 0 });

  const [toolboxOpen, setToolboxOpen] = useState(true);
  const [activePopout, setActivePopout] = useState(null);

  const [notice, setNotice] = useState(null);
  const showNotice = (msg, type = "ok") => {
    setNotice({ msg, type });
    window.clearTimeout(showNotice.tid);
    showNotice.tid = window.setTimeout(() => setNotice(null), 2000);
  };

  // Zoom helpers
  const Z_MIN = 0.2, Z_MAX = 5;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const zoomAt = (newZoom, focalPx) => {
    const view = viewportRef.current;
    if (!view) { setZoom(clamp(newZoom, Z_MIN, Z_MAX)); return; }
    const rect = view.getBoundingClientRect();
    const cx = focalPx?.x ?? rect.width / 2;
    const cy = focalPx?.y ?? rect.height / 2;
    const z0 = zoom;
    const z1 = clamp(newZoom, Z_MIN, Z_MAX);
    const ix = (cx - offset.x) / z0;
    const iy = (cy - offset.y) / z0;
    const ox = cx - ix * z1;
    const oy = cy - iy * z1;
    setZoom(z1);
    setOffset({ x: ox, y: oy });
  };
  const onWheelZoom = (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const rect = viewportRef.current.getBoundingClientRect();
    const target = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const factor = Math.exp(-e.deltaY * 0.0015);
    zoomAt(zoom * factor, target);
  };

  // Load image
  useEffect(() => {
    (async () => {
      const dref = doc(db, "projects", projectId, "folders", folderId, "images", imageId);
      const snap = await getDoc(dref);
      if (snap.exists()) setImageDoc({ id: snap.id, ...snap.data() });
      else { alert("Image not found"); navigate("/"); }
    })();
  }, [projectId, folderId, imageId, navigate]);

  // Auto-fit once
  useEffect(() => {
    if (!imageDoc || !viewportRef.current || didFit.current) return;
    requestAnimationFrame(() => {
      const vw = viewportRef.current.clientWidth;
      const vh = viewportRef.current.clientHeight;
      if (!vw || !vh) return;
      const z = Math.max(0.2, Math.min(5, Math.min(vw / imageDoc.width, vh / imageDoc.height)));
      const ox = (vw - imageDoc.width * z) / 2;
      const oy = (vh - imageDoc.height * z) / 2;
      setZoom(z);
      setOffset({ x: ox, y: oy });
      didFit.current = true;
    });
  }, [imageDoc]);

  // Server strokes
  useEffect(() => {
    const qy = query(
      collection(db, "projects", projectId, "folders", folderId, "images", imageId, "markups"),
      orderBy("createdAt", "asc")
    );
    const stop = onSnapshot(qy, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setServerStrokes(list);
      setLocalStrokes((prev) => prev.filter((l) => !list.some((s) => s.id === l.id)));
    });
    return () => stop();
  }, [projectId, folderId, imageId]);

  // Comments live
  useEffect(() => {
    const qy = query(
      collection(db, "projects", projectId, "folders", folderId, "images", imageId, "comments"),
      orderBy("createdAt", "asc")
    );
    const stop = onSnapshot(qy, (snap) => setComments(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
    return () => stop();
  }, [projectId, folderId, imageId]);

  // Draw everything
  useEffect(() => {
    const cvs = canvasRef.current, img = imgRef.current;
    if (!cvs || !img || !img.naturalWidth) return;

    cvs.width = img.naturalWidth;
    cvs.height = img.naturalHeight;

    const ctx = cvs.getContext("2d");
    ctx.clearRect(0, 0, cvs.width, cvs.height);

    const drawPath = (path, col, w) => {
      if (!path || path.length < 2) return;
      ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineJoin = "round"; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(path[0].x, path[0].y);
      for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
      ctx.stroke();
    };
    const drawTag = (x, y, count) => {
      const r = 8;
      ctx.fillStyle = "#0d8dea";
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      if (count > 0) {
        ctx.fillStyle = "#fff"; ctx.font = "10px system-ui"; ctx.textAlign="center"; ctx.textBaseline="middle";
        ctx.fillText(String(count), x, y);
      }
    };

    const all = [...serverStrokes, ...localStrokes];
    for (const m of all) {
      drawPath(m.path, m.color, m.size);
      if (m.bbox) {
        const cx = m.bbox.x + m.bbox.w / 2, cy = m.bbox.y + m.bbox.h / 2;
        drawTag(cx, cy, comments.filter((c) => c.markupId === m.id).length);
      }
    }

    // Cyan outline under selected markup
    if (selectedMarkupId) {
      const sel = [...serverStrokes, ...localStrokes].find((m) => m.id === selectedMarkupId);
      if (sel && sel.path && sel.path.length > 1) {
        const outlineWidth = Math.max(2, (sel.size || 6) + 6);
        ctx.save();
        ctx.globalCompositeOperation = "destination-over";
        ctx.strokeStyle = "#06b6d4";
        ctx.lineWidth = outlineWidth;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(sel.path[0].x, sel.path[0].y);
        for (let i = 1; i < sel.path.length; i++) ctx.lineTo(sel.path[i].x, sel.path[i].y);
        ctx.stroke();
        ctx.restore();
      }
    }

    drawPath(currentPath, color, brush);
  }, [serverStrokes, localStrokes, currentPath, color, brush, comments, selectedMarkupId]);

  const toImage = (e) => {
    const r = viewportRef.current.getBoundingClientRect();
    return { x: (e.clientX - r.left - offset.x) / zoom, y: (e.clientY - r.top - offset.y) / zoom };
  };

  const onPointerDown = (e) => {
    if (e.target.closest(".toolbox-wrap") || /^(BUTTON|INPUT|SELECT|TEXTAREA|LABEL)$/i.test(e.target.tagName)) return;
    if (!imageDoc) return;
    if (mode === "select") return;

    const el = viewportRef.current;
    el.setPointerCapture?.(e.pointerId);

    if (mode === "pan") {
      e.preventDefault();
      setPanning(true);
      panStart.current = { x: e.clientX, y: e.clientY };
      offsetStart.current = { ...offset };
    } else if (mode === "draw") {
      e.preventDefault();
      setDrawing(true);
      setCurrentPath([toImage(e)]);
    }
  };
  const onPointerMove = (e) => {
    if (panning && mode === "pan") {
      const dx = e.clientX - panStart.current.x, dy = e.clientY - panStart.current.y;
      setOffset({ x: offsetStart.current.x + dx, y: offsetStart.current.y + dy });
    }
    if (drawing && mode === "draw") setCurrentPath((p) => [...p, toImage(e)]);
  };
  const onPointerUp = async (e) => {
    if (e.target.closest(".toolbox-wrap")) return;

    const el = viewportRef.current;
    el.releasePointerCapture?.(e.pointerId);

    if (mode === "pan" && panning) { setPanning(false); return; }
    if (mode !== "draw") return;

    if (currentPath.length < 2) { setDrawing(false); setCurrentPath([]); return; }
    const finalPath = currentPath.slice();

    const xs = finalPath.map((p) => p.x), ys = finalPath.map((p) => p.y);
    const bbox = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };

    const coll = collection(db, "projects", projectId, "folders", folderId, "images", imageId, "markups");
    const newRef = doc(coll);
    const stroke = { id: newRef.id, color, size: brush, path: finalPath, bbox, createdAt: new Date() };

    setLocalStrokes((prev) => [...prev, stroke]);
    setSelectedMarkupId(newRef.id);
    setDrawing(false);
    setCurrentPath([]);

    await setDoc(newRef, { color, size: brush, path: finalPath, bbox, createdAt: serverTimestamp() });
  };

  // Select via click on canvas (only in select mode)
  const scrollToFirstCommentFor = (mid) => {
    if (!mid || comments.length === 0) return;
    const target = comments.find((c) => c.markupId === mid);
    if (!target) return;
    const el = commentRefs.current[target.id];
    if (el?.scrollIntoView) el.scrollIntoView({ behavior: "smooth", block: "center" });
    setSelectedCommentId(target.id);
  };

  const onCanvasClick = (e) => {
    if (e.target.closest(".toolbox-wrap")) return;
    if (mode !== "select") return;
    const p = toImage(e);
    const all = [...serverStrokes, ...localStrokes];
    const PAD = 4;
    for (let i = all.length - 1; i >= 0; i--) {
      const b = all[i].bbox;
      if (b && p.x >= b.x - PAD && p.x <= b.x + b.w + PAD && p.y >= b.y - PAD && p.y <= b.y + b.h + PAD) {
        const mid = all[i].id;
        setSelectedMarkupId(mid);
        scrollToFirstCommentFor(mid);
        return;
      }
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = async (e) => {
      const tag = (e.target?.tagName || "").toLowerCase();
      if (["input", "textarea", "select"].includes(tag)) return;

      const k = e.key.toLowerCase();
      if (k === "v") setMode("select");
      if (k === "h") setMode("pan");
      if (k === "b") setMode("draw"); // pencil
      if (k === "t") setToolboxOpen((s) => !s);

      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedCommentId) {
          const linked = comments.find(c => c.id === selectedCommentId)?.markupId || null;
          await deleteComment(selectedCommentId, linked);
        } else if (selectedMarkupId) {
          await deleteSelectedMarkup();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedMarkupId, selectedCommentId, comments]);

  // Comment edit helpers
  const startEdit = (c) => {
    setEditingId(c.id);
    setEditText(c.text || "");
    setEditLink(c.link || "");
    setSelectedCommentId(c.id);
    setSelectedMarkupId(c.markupId);
  };
  const cancelEdit = () => { setEditingId(null); setEditText(""); setEditLink(""); };
  const saveEdit = async () => {
    if (!editingId) return;
    try {
      const cref = doc(db, "projects", projectId, "folders", folderId, "images", imageId, "comments", editingId);
      await updateDoc(cref, { text: editText.trim() || null, link: editLink.trim() || null, updatedAt: serverTimestamp() });
      cancelEdit();
      showNotice("Comment updated ✅", "ok");
    } catch (e) { alert(e.message || "Failed to update"); }
  };

  // Reference image via DnD
  const onPickRef = (e) => {
    const f = e.target.files?.[0];
    if (!f) { setRefFile(null); setRefPreview(null); return; }
    setRefFile(f);
    setRefPreview(URL.createObjectURL(f));
  };
  const clearRef = () => { setRefFile(null); if (refPreview) URL.revokeObjectURL(refPreview); setRefPreview(null); };

  const [isCommentDrag, setIsCommentDrag] = useState(false);
  const onCommentDragEnter = (e) => { e.preventDefault(); e.stopPropagation(); setIsCommentDrag(true); };
  const onCommentDragOver = (e) => { e.preventDefault(); e.stopPropagation(); };
  const onCommentDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); if (e.currentTarget === e.target) setIsCommentDrag(false); };
  const onCommentDrop = (e) => {
    e.preventDefault(); e.stopPropagation(); setIsCommentDrag(false);
    const f = e.dataTransfer?.files?.[0]; if (!f) return;
    if (!f.type.startsWith("image/")) { showNotice("Please drop an image file.", "err"); return; }
    clearRef(); setRefFile(f); setRefPreview(URL.createObjectURL(f)); showNotice("Reference image attached ✅", "ok");
  };

  const renderWithLinks = (text) => {
    const parts = []; const regex = /https?:\/\/\S+/gi; let last = 0; let m;
    while ((m = regex.exec(text))) {
      const url = m[0]; if (m.index > last) parts.push(text.slice(last, m.index));
      parts.push(<a key={m.index} href={url} target="_blank" rel="noreferrer noopener" className="dropbox">{url}</a>);
      last = m.index + url.length;
    }
    if (last < text.length) parts.push(text.slice(last));
    return parts;
  };

  const addComment = async () => {
    const text = commentText.trim();
    if (!text && !linkUrl.trim() && !refFile) return;
    if (!selectedMarkupId) { alert("Select or draw a markup first."); return; }

    let refImageUrl = null, refImageId = null;
    if (refFile) {
      const fd = new FormData();
      fd.append("file", refFile);
      fd.append("upload_preset", UPLOAD_PRESET);
      fd.append("folder", `${CLOUD_ROOT}/refs/${projectId}/${imageId}`);
      const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: "POST", body: fd });
      const data = await res.json();
      if (res.ok) { refImageUrl = data.secure_url; refImageId = data.public_id; }
      else { alert(data.error?.message || "Reference image upload failed"); return; }
    }

    await addDoc(
      collection(db, "projects", projectId, "folders", folderId, "images", imageId, "comments"),
      { markupId: selectedMarkupId, text: text || null, link: linkUrl.trim() || null, refImageUrl, refImageId, createdAt: serverTimestamp() }
    );

    setCommentText(""); setLinkUrl(""); clearRef(); showNotice("Comment added ✅", "ok"); commentBoxRef.current?.focus();
  };

  const deleteComment = async (cid, linkedMarkupId) => {
    const confirm1 = window.confirm("Delete this comment?"); if (!confirm1) return;
    let also = false; if (linkedMarkupId) also = window.confirm("Also delete its linked markup AND all comments linked to that markup?");
    try {
      if (also) {
        await deleteMarkupAndComments(linkedMarkupId);
      } else {
        await deleteDoc(doc(db, "projects", projectId, "folders", folderId, "images", imageId, "comments", cid));
        if (selectedCommentId === cid) setSelectedCommentId(null);
      }
    } catch (e) {
      alert(e.message || "Failed to delete");
    }
  };

  const deleteSelectedMarkup = async () => {
    if (!selectedMarkupId) return;
    await deleteMarkupAndComments(selectedMarkupId);
  };

  const deleteMarkupAndComments = async (markupId) => {
    const proceed = window.confirm("Delete this markup and all comments linked to it?");
    if (!proceed) return;
    const mref = doc(db, "projects", projectId, "folders", folderId, "images", imageId, "markups", markupId);
    try {
      const cRef = collection(db, "projects", projectId, "folders", folderId, "images", imageId, "comments");
      const qy = query(cRef, where("markupId", "==", markupId));
      const snap = await getDocs(qy);
      const batchDeletes = snap.docs.map((d) => deleteDoc(d.ref));
      await Promise.all(batchDeletes);
      await deleteDoc(mref);
      setLocalStrokes((prev) => prev.filter((s) => s.id !== markupId));
      if (selectedMarkupId === markupId) setSelectedMarkupId(null);
      setSelectedCommentId(null);
    } catch (e) {
      alert(e.message || "Failed to delete markup");
    }
  };

  const onSelectMarkup = (mid) => {
    setSelectedMarkupId(mid || null);
    if (mid) {
      const target = comments.find((c) => c.markupId === mid);
      const el = target ? commentRefs.current[target.id] : null;
      if (el?.scrollIntoView) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  const stroke = "#fff", sw = 1.6, none = "none";
  const IconToolbox = ({ open }) => (
    <svg width="22" height="22" viewBox="0 0 24 24">
      <rect x="3" y={open ? 9 : 10} width="18" height="10" rx="2" fill="rgba(255,255,255,0.04)" stroke={stroke} strokeWidth={sw}/>
      <rect x="4" y={open ? 6 : 8.5} width="16" height="2" rx="1" fill="rgba(255,255,255,0.08)" stroke={stroke} strokeWidth={sw}/>
      <rect x="9" y={open ? 6.5 : 8} width="6" height="2" rx="1" fill={stroke}/>
    </svg>
  );
  const IconCrosshair = () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill={none} stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="7"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/>
    </svg>
  );
  const IconHand = () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill={none} stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 11v-3a1.5 1.5 0 013 0v3"/><path d="M10 10V6a1.5 1.5 0 013 0v4"/>
      <path d="M13 10V5a1.5 1.5 0 013 0v5"/><path d="M16 11v-2a1.5 1.5 0 013 0v4a5 5 0 01-5 5h-1a5 5 0 01-5-5v-2"/>
    </svg>
  );
  const IconPencil = () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill={none} stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 5l6 6-8 8H5v-6z"/><path d="M16 4l4 4"/>
    </svg>
  );
  const IconZoom = () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill={none} stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="10" r="6"/><path d="M21 21l-5.2-5.2"/><path d="M7 10h6M10 7v6"/>
    </svg>
  );
  const IconTrash = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
    </svg>
  );

  const barBG = "rgba(31,41,55,.72)";
  const toolBoxWrap = {
    position: "absolute", left: 10, top: 10, zIndex: 12,
    display: "flex", flexDirection: "column", alignItems: "stretch"
  };
  const toolBtn = (active=false) => ({
    width: 38, height: 38, borderRadius: 10,
    background: active ? "rgba(16,185,129,.18)" : barBG,
    border: "1px solid rgba(255,255,255,.18)",
    display: "grid", placeItems: "center",
    cursor: "pointer", marginBottom: 6
  });
  const colorBtn = () => ({
    ...toolBtn(false),
    background: barBG,
    position: "relative",
    overflow: "hidden",
  });
  const colorDot = (current) => ({
    width: 18, height: 18, borderRadius: "50%",
    background: current,
    border: "1.6px solid #fff",
  });
  const toolHeader = {
    display: "grid", gridTemplateColumns: "auto 1fr", alignItems: "center", gap: 8,
    background: barBG, color: "#fff", border: "1px solid rgba(255,255,255,.18)",
    borderRadius: 12, padding: "6px 8px", cursor: "pointer", marginBottom: 6
  };
  const drawer = {
    background: "rgba(17,24,39,.86)", color: "#fff",
    border: "1px solid rgba(255,255,255,.18)", borderRadius: 12,
    padding: 8, display: "flex", flexDirection: "column", alignItems: "center", gap: 8
  };
  const popout = (y) => ({
    position: "absolute", left: 48, top: y,
    borderRadius: 10, padding: 8,
    display: "flex", flexDirection: "column", alignItems: "center", gap: 6, zIndex: 13
  });

  return (
    <div className="viewer">
      {/* Left */}
      <div className="left">
        <div
          ref={viewportRef}
          className="viewport"
          style={{ cursor: mode === "pan" ? (panning ? "grabbing" : "grab") : mode === "draw" ? "crosshair" : "default" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onClick={onCanvasClick}
          onWheel={onWheelZoom}
        >
          {/* TOOLBOX */}
          <div
            className="toolbox-wrap"
            style={toolBoxWrap}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={toolHeader} onClick={() => setToolboxOpen((s) => !s)} title="Toggle tools (T)">
              <IconToolbox open={toolboxOpen} />
              <span style={{ fontSize: 12, color: "#e5e7eb" }}>Tools</span>
            </div>

            {toolboxOpen && (
              <div style={drawer}>
                <button style={toolBtn(mode === "select")} onClick={() => { setMode("select"); setActivePopout(null); }} title="Select (V)">
                  <IconCrosshair/>
                </button>

                <button style={toolBtn(mode === "pan")} onClick={() => { setMode("pan"); setActivePopout(null); }} title="Hand (H)">
                  <IconHand/>
                </button>

                <div style={{ position: "relative" }}>
                  <button style={toolBtn(mode === "draw")} onClick={() => { setMode("draw"); setActivePopout(activePopout === "pencil" ? null : "pencil"); }} title="Pencil (B)">
                    <IconPencil/>
                  </button>
                  {activePopout === "pencil" && (
                    <div className="pop-card" style={popout(0)}>
                      <div className="pop-grid">
                        <div className="pop-rail">
                          <input type="range" min="1" max="32" value={brush} onChange={(e) => setBrush(Number(e.target.value))} className="vrange" aria-label="Brush size"/>
                        </div>
                        <div className="pop-labels">
                          <div className="pop-title">Pencil</div>
                          <div className="pop-value">{brush}px</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div style={{ position: "relative" }}>
                  <button style={toolBtn(false)} onClick={() => setActivePopout(activePopout === "zoom" ? null : "zoom")} title="Zoom">
                    <IconZoom/>
                  </button>
                  {activePopout === "zoom" && (
                    <div className="pop-card" style={popout(0)}>
                      <div className="pop-grid">
                        <div className="pop-rail">
                          <input type="range" min="0.2" max="5" step="0.05" value={zoom} onChange={(e) => zoomAt(Number(e.target.value))} className="vrange" aria-label="Zoom"/>
                        </div>
                        <div className="pop-labels">
                          <div className="pop-title">Zoom</div>
                          <div className="pop-value">{Math.round(zoom*100)}%</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div style={{ position: "relative" }}>
                  <button style={colorBtn()} onClick={() => setActivePopout(activePopout === "color" ? null : "color")} title="Color">
                    <div style={colorDot(color)} />
                  </button>
                  {activePopout === "color" && (
                    <div className="pop-card" style={popout(0)}>
                      <span className="pop-title">Color</span>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 22px)", gap: 6 }}>
                        {["#ff2d55","#10b981","#0d8dea","#f59e0b","#ef4444","#a855f7","#111827","#ffffff"].map((c) => (
                          <button key={c} onClick={() => setColor(c)} style={{
                            width:22,height:22,borderRadius:6,border:"1px solid rgba(255,255,255,.25)",
                            background:c,cursor:"pointer",boxShadow: c===color ? "0 0 0 2px #10b981 inset" : "none"
                          }} aria-label={`Color ${c}`}/>
                        ))}
                      </div>
                      <input type="color" value={color} onChange={(e)=>setColor(e.target.value)} style={{ width: 28, height: 28, marginTop: 6, border: "none", background: "transparent" }} aria-label="Custom color"/>
                    </div>
                  )}
                </div>

                <button
                  style={{ ...toolBtn(false), background: "rgba(127,29,29,.65)" }}
                  onClick={deleteSelectedMarkup}
                  disabled={!selectedMarkupId}
                  title="Delete selected markup + comments (Del)"
                >
                  <IconTrash/>
                </button>
              </div>
            )}
          </div>

          {imageDoc && (
            <div
              style={{
                position: "absolute",
                left: 0, top: 0,
                transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
                transformOrigin: "top left",
              }}
            >
              <img
                ref={imgRef}
                src={imageDoc.url}
                alt={imageDoc.name}
                style={{ display: "block", width: imageDoc.width, height: imageDoc.height }}
                draggable={false}
              />
              <canvas
                ref={canvasRef}
                width={imageDoc.width}
                height={imageDoc.height}
                style={{ position: "absolute", left: 0, top: 0, width: imageDoc.width, height: imageDoc.height, pointerEvents: "none" }}
              />
            </div>
          )}
        </div>

        <div className="card" style={{ borderRadius: 0 }}>
          <div className="muted">
            {imageDoc ? `${imageDoc.name} — ${imageDoc.width}×${imageDoc.height}` : "Loading…"}
          </div>
          <a href="#/" onClick={(e) => { e.preventDefault(); window.dispatchEvent(new CustomEvent("goHome")); }} className="dropbox" style={{ marginLeft: 0, display: "inline-block", marginTop: 8 }}>← Home</a>
        </div>
      </div>

      {/* Right */}
      <aside className="right">
        <div className="card" style={{ borderRadius: 0 }}>
          <h2 style={{ marginBottom: 8 }}>Comments</h2>
          <div className="muted" style={{ marginBottom: 8 }}>
            Enter = <b>add comment</b> • Shift+Enter = <b>newline</b>. Select a markup first.
          </div>

          <select
            value={selectedMarkupId || ""}
            onChange={(e) => onSelectMarkup(e.target.value)}
            className="select"
          >
            <option value="">Choose a markup…</option>
            {[...serverStrokes, ...localStrokes].map((m, idx) => (
              <option key={m.id} value={m.id}>#{idx + 1} — {m.color} — {m.size || 0}px</option>
            ))}
          </select>

          {/* Comment text with DnD for reference image */}
          <div
            className={`comment-dropwrap ${isCommentDrag ? "drag-in" : ""}`}
            onDragEnter={onCommentDragEnter}
            onDragOver={onCommentDragOver}
            onDragLeave={onCommentDragLeave}
            onDrop={onCommentDrop}
          >
            <textarea
              ref={commentBoxRef}
              rows={3}
              placeholder="Write a comment… (Drag an image here to attach • URLs auto-link)"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  const canAdd = !!selectedMarkupId && !!(commentText.trim() || linkUrl.trim() || refFile);
                  if (canAdd) addComment();
                }
              }}
              className="textarea"
              aria-label="Comment text"
            />
          </div>
          <div className="drop-hint">Tip: drag an image into the box above to attach a reference.</div>

          <input
            type="url"
            placeholder="Link (optional, e.g. https://example.com)"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            className="input"
            style={{ marginTop: 6 }}
            aria-label="Optional link"
          />
          <input id="refPick" type="file" accept="image/*" onChange={onPickRef} style={{ display: "none" }} />

          {refFile && (
            <div className="chip">
              <span>Attached image</span>
              <button onClick={clearRef} title="Remove">✕</button>
            </div>
          )}

          {refPreview && (
            <div className="ref-preview">
              <a href={refPreview} target="_blank" rel="noreferrer">
                <img src={refPreview} alt="Reference preview" className="ref-thumb" />
              </a>
            </div>
          )}
        </div>

        <div style={{ overflow: "auto", padding: 12, minHeight: 0 }}>
          {comments.length === 0 ? (
            <div className="muted">No comments yet.</div>
          ) : (
            comments.map((c) => {
              const all = [...serverStrokes, ...localStrokes];
              const idx = all.findIndex((m) => m.id === c.markupId);
              const isActive = c.id === selectedCommentId;
              const isEditing = c.id === editingId;

              return (
                <div
                  key={c.id}
                  ref={(el) => { if (el) commentRefs.current[c.id] = el; else delete commentRefs.current[c.id]; }}
                  className={`comment ${isActive ? "active" : ""}`}
                  onClick={() => {
                    if (isEditing) return;
                    setSelectedCommentId(c.id);
                    setSelectedMarkupId(c.markupId);
                  }}
                >
                  <div className="comment-head" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div className="comment-link" style={{ flex: 1 }}>Linked to markup #{idx >= 0 ? idx + 1 : "?"}</div>

                    {!isEditing && (
                      <button
                        className="icon"
                        title="Edit comment"
                        onClick={(e) => { e.stopPropagation(); startEdit(c); }}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M13 5l6 6-8 8H5v-6z"/><path d="M16 4l4 4"/>
                        </svg>
                      </button>
                    )}

                    <button
                      className="icon danger"
                      title="Delete comment (optionally also delete its markup)"
                      onClick={(e) => { e.stopPropagation(); const linked = c.markupId || null; (async () => { await deleteComment(c.id, linked); })(); }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                      </svg>
                    </button>
                  </div>

                  {!isEditing ? (
                    <>
                      {c.text && <div style={{ marginBottom: 6 }}>{renderWithLinks(c.text)}</div>}
                      {c.link && (
                        <div style={{ marginBottom: 6 }}>
                          <a href={c.link} target="_blank" rel="noreferrer noopener" className="dropbox">
                            {c.link}
                          </a>
                        </div>
                      )}
                      {c.refImageUrl && (
                        <a href={c.refImageUrl} target="_blank" rel="noreferrer noopener">
                          <img src={c.refImageUrl} alt="Reference" className="ref-thumb" />
                        </a>
                      )}
                    </>
                  ) : (
                    <div style={{ display: "grid", gap: 6 }}>
                      <textarea
                        rows={3}
                        className="textarea"
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); (async () => saveEdit())(); } }}
                        placeholder="Edit comment text… (Shift+Enter = newline)"
                        autoFocus
                      />
                      <input
                        type="url"
                        className="input"
                        value={editLink}
                        onChange={(e) => setEditLink(e.target.value)}
                        placeholder="Edit link (optional)"
                      />
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={saveEdit}>Save</button>
                        <button className="danger" onClick={cancelEdit}>Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="card" style={{ borderRadius: 0 }}>
          <a href="#/" onClick={(e) => { e.preventDefault(); window.dispatchEvent(new CustomEvent("goHome")); }} className="dropbox">← Back to Home</a>
        </div>
      </aside>

      {notice && (
        <div className={`toast ${notice.type}`} role="status" aria-live="polite" style={{ position: "fixed", bottom: 12, left: 12 }}>
          {notice.msg}
        </div>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────
   Help
──────────────────────────────────────────────────────────────── */
function Help() {
  return (
    <main className="wrap" style={{ height: "100%", overflow: "auto" }}>
      <section className="card">
        <h2>How to use Retouch Room</h2>
        <ol style={{ lineHeight: 1.6 }}>
          <li><b>Create a project</b> — name it, optionally paste a Dropbox File Request link, add allowed users, click <b>Add Project</b>.</li>
          <li><b>Open a project</b> — click the project row.</li>
          <li><b>Create a round</b> — click <b>Create Round</b> to add “Round N — {isoDate()}” (click a round to open it). Rename with the pencil.</li>
          <li><b>Upload images</b> — drag files into the dashed box or click <b>Browse files</b>.</li>
          <li><b>Open Markup</b> — click <b>Open Markup</b> on an image to annotate.</li>
          <li><b>Breadcrumbs</b> — use the trail at the top to jump back (Projects › Project › Round).</li>
          <li><b>Comments</b> — select a markup, type your note, press <b>Enter</b> to add. Drag an image into the comment box to attach a reference. Click the pencil to edit a comment.</li>
          <li><b>Toolbox</b> — press <b>T</b> to toggle tools. Pop-outs for Pencil size, Zoom (centers on viewer), and Color.</li>
          <li><b>Delete</b> — trash deletes the selected markup (with all its comments). Deleting a comment can also remove its linked markup.</li>
        </ol>
        <a href="#/" onClick={(e)=>{e.preventDefault(); window.dispatchEvent(new CustomEvent("goHome"));}} className="dropbox">← Back to Home</a>
      </section>
    </main>
  );
}
