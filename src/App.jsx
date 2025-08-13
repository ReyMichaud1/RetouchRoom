import React, { useEffect, useMemo, useRef, useState, useContext, createContext } from "react";
import { HashRouter, Routes, Route, Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { db } from "./firebase";
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
} from "firebase/firestore";

/* ────────────────────────────────────────────────────────────────
   Simple shared login (no Firebase Auth for now)
──────────────────────────────────────────────────────────────── */
const AUTH_KEY = "rr_auth_v1";
const SHARED_USER = import.meta.env.VITE_SHARED_USERNAME || "Markup";
const SHARED_PASS = import.meta.env.VITE_SHARED_PASSWORD || "1234567";

const AuthCtx = createContext(null);
const useAuth = () => useContext(AuthCtx);

function AuthProvider({ children }) {
  const [state, setState] = useState(() => {
    try {
      const raw = localStorage.getItem(AUTH_KEY);
      return raw ? JSON.parse(raw) : { ok: false, u: null };
    } catch {
      return { ok: false, u: null };
    }
  });
  const login = (u, p) => {
    if (u === SHARED_USER && p === SHARED_PASS) {
      const next = { ok: true, u, t: Date.now() };
      localStorage.setItem(AUTH_KEY, JSON.stringify(next));
      setState(next);
      return true;
    }
    return false;
  };
  const logout = () => { localStorage.removeItem(AUTH_KEY); setState({ ok: false, u: null }); };
  return <AuthCtx.Provider value={{ authed: state.ok, user: state.u, login, logout }}>{children}</AuthCtx.Provider>;
}

function Protected({ children }) {
  const { authed } = useAuth();
  return authed ? children : <Navigate to="/login" replace />;
}

/* ────────────────────────────────────────────────────────────────
   Helpers / Cloudinary
──────────────────────────────────────────────────────────────── */
const isoDate = (d = new Date()) => d.toISOString().slice(0, 10);
const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || "dwcgdkoxd";
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || "retouch-markup";
const CLOUD_ROOT = import.meta.env.VITE_CLOUDINARY_FOLDER || "retouch";

/* ────────────────────────────────────────────────────────────────
   App + Routes
──────────────────────────────────────────────────────────────── */
export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <Protected>
                <Shell><Home /></Shell>
              </Protected>
            }
          />
          <Route
            path="/help"
            element={
              <Protected>
                <Shell><Help /></Shell>
              </Protected>
            }
          />
          <Route
            path="/view/:projectId/:folderId/:imageId"
            element={
              <Protected>
                <Shell><ImageViewer /></Shell>
              </Protected>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
    </AuthProvider>
  );
}

/* ────────────────────────────────────────────────────────────────
   Layout Shell
──────────────────────────────────────────────────────────────── */
function Shell({ children }) {
  const { logout } = useAuth();
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <header className="topbar">
        <div className="brand">Retouch Room — Markups</div>
        <nav className="nav">
          <Link to="/" className="navlink">Home</Link>
          <span className="dot">•</span>
          <Link to="/help" className="navlink">Help</Link>
          <span className="dot">•</span>
          <button className="navlink asbutton" onClick={logout}>Log out</button>
        </nav>
      </header>
      <div style={{ flex: 1, minHeight: 0 }}>{children}</div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────
   Login
──────────────────────────────────────────────────────────────── */
function LoginPage() {
  const { authed, login } = useAuth();
  const navigate = useNavigate();
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => { if (authed) navigate("/", { replace: true }); }, [authed, navigate]);

  const submit = (e) => {
    e.preventDefault();
    setErr("");
    if (!login(u.trim(), p)) setErr("Wrong username or password.");
  };

  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "100vh", background: "#0b0f17" }}>
      <form onSubmit={submit} className="card" style={{ width: 360 }}>
        <h2 style={{ marginBottom: 8 }}>Retouch Room — Markups</h2>
        <div className="muted" style={{ marginBottom: 12 }}>Enter the shared credentials.</div>
        <input placeholder="Username" value={u} onChange={(e)=>setU(e.target.value)} />
        <input type="password" placeholder="Password" value={p} onChange={(e)=>setP(e.target.value)} />
        {err && <div className="muted" style={{ color: "#ef4444" }}>{err}</div>}
        <button type="submit" style={{ marginTop: 8, width: "100%" }}>Enter</button>
      </form>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────
   Home (Projects → Folders → Images)
──────────────────────────────────────────────────────────────── */
function Home() {
  const { user } = useAuth();
  const [projectName, setProjectName] = useState("");
  const [dropboxLink, setDropboxLink] = useState("");

  const [activeProjectId, setActiveProjectId] = useState(null);
  const [activeFolderId, setActiveFolderId] = useState(null);

  const [projects, setProjects] = useState([]);
  const [folders, setFolders] = useState([]);
  const [images, setImages] = useState([]);

  const [folderCreating, setFolderCreating] = useState(false);
  const [notice, setNotice] = useState(null);

  const showToast = (msg, type="ok") => {
    setNotice({ msg, type });
    clearTimeout(showToast.tid);
    showToast.tid = setTimeout(() => setNotice(null), 2400);
  };

  // Projects (filter legacy + this user tag)
  useEffect(() => {
    const qy = query(collection(db, "projects"), orderBy("createdAt", "desc"));
    const stop = onSnapshot(qy, (snap) => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const mine = all.filter(p => !p.client || p.client === user);
      setProjects(mine);
      if (activeProjectId && !mine.find(p => p.id === activeProjectId)) {
        setActiveProjectId(null); setActiveFolderId(null);
      }
    });
    return () => stop();
    // eslint-disable-next-line
  }, [user, activeProjectId]);

  // Folders in active project
  useEffect(() => {
    setFolders([]); setActiveFolderId(null);
    if (!activeProjectId) return;
    const qy = query(collection(db, "projects", activeProjectId, "folders"), orderBy("createdAt", "desc"));
    const stop = onSnapshot(qy, (snap) => setFolders(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    return () => stop();
  }, [activeProjectId]);

  // Images in active folder
  useEffect(() => {
    setImages([]);
    if (!activeProjectId || !activeFolderId) return;
    const qy = query(
      collection(db, "projects", activeProjectId, "folders", activeFolderId, "images"),
      orderBy("uploadedAt", "desc")
    );
    const stop = onSnapshot(qy, (snap) => setImages(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    return () => stop();
  }, [activeProjectId, activeFolderId]);

  const resetToProjects = () => { setActiveFolderId(null); setActiveProjectId(null); };

  const createProject = async () => {
    const name = projectName.trim();
    if (!name) return;
    const payload = { name, dropbox: dropboxLink.trim() || null, client: user, createdAt: serverTimestamp() };
    const ref = await addDoc(collection(db, "projects"), payload);
    // optimistic
    setProjects(prev => [{ id: ref.id, ...payload }, ...prev]);
    setProjectName(""); setDropboxLink("");
    showToast("Project created ✅");
  };

  const deleteProject = async (pid) => {
    const ok = window.confirm("Are you sure you want to delete this project?");
    if (!ok) return;
    await deleteDoc(doc(db, "projects", pid));
    if (pid === activeProjectId) { setActiveProjectId(null); setActiveFolderId(null); }
  };

  // Round N — YYYY-MM-DD (don’t auto-open)
  const createNextRound = async () => {
    if (!activeProjectId) return alert("Select a project first.");
    try {
      setFolderCreating(true);
      const count = folders.filter(f => /^Round\s+\d+/i.test(f.name || "")).length;
      const name = `Round ${count + 1} — ${isoDate()}`;
      await addDoc(collection(db, "projects", activeProjectId, "folders"), { name, createdAt: serverTimestamp() });
      showToast(`Created ${name} ✅`);
    } finally {
      setFolderCreating(false);
    }
  };

  const renameFolder = async (fid, name) => {
    await setDoc(doc(db, "projects", activeProjectId, "folders", fid), { name }, { merge: true });
    showToast("Folder renamed ✅");
  };

  // Uploads (DnD + button)
  const fileInputRef = useRef(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const handleUpload = async (fileList) => {
    if (!activeProjectId || !activeFolderId) return alert("Select a project and folder first.");
    const files = Array.from(fileList || []);
    if (!files.length) return;

    const folderLabel = folders.find(f => f.id === activeFolderId)?.name || "unnamed";
    setIsUploading(true);
    try {
      for (const file of files) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("upload_preset", UPLOAD_PRESET);
        fd.append("folder", `${CLOUD_ROOT}/${activeProjectId}/${folderLabel}`);
        const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok) { showToast(data?.error?.message || "Upload failed", "err"); continue; }
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
      showToast(`Uploaded ${files.length} file(s) ✅`);
    } finally {
      setIsUploading(false);
    }
  };

  const onDragEnter = (e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); };
  const onDragOver  = (e) => { e.preventDefault(); e.stopPropagation(); };
  const onDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); if (e.currentTarget === e.target) setIsDragging(false); };
  const onDrop      = (e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); if (e.dataTransfer?.files?.length) handleUpload(e.dataTransfer.files); };

  const activeProject = useMemo(() => projects.find(p => p.id === activeProjectId) || null, [projects, activeProjectId]);
  const activeFolder  = useMemo(() => folders.find(f => f.id === activeFolderId) || null, [folders, activeFolderId]);

  return (
    <main className="wrap" style={{ height: "100%", overflow: "auto" }}>
      {/* Breadcrumbs */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="crumbs">
          {!activeProject ? (
            <span className="crumb-text">Projects</span>
          ) : (
            <button className="linkish" onClick={resetToProjects}>Projects</button>
          )}
          {activeProject && (<><span className="crumb-sep">›</span><button className="linkish" onClick={() => setActiveFolderId(null)}>{activeProject.name}</button></>)}
          {activeProject && activeFolder && (<><span className="crumb-sep">›</span><span>{activeFolder.name}</span></>)}
        </div>
      </div>

      {/* Projects */}
      {!activeProject && (
        <>
          <section className="card">
            <h2>Create Project</h2>
            <input placeholder="Project Name" value={projectName} onChange={(e)=>setProjectName(e.target.value)} />
            <input placeholder="Dropbox File Request Link (optional)" value={dropboxLink} onChange={(e)=>setDropboxLink(e.target.value)} />
            <button onClick={createProject} disabled={!projectName.trim()}>Add Project</button>
          </section>

          <section className="card">
            <h2>Projects</h2>
            {projects.length === 0 ? (
              <div className="muted">No projects yet — add one above.</div>
            ) : (
              projects.map((p) => (
                <div key={p.id} className="project" onClick={() => setActiveProjectId(p.id)} style={{ cursor: "pointer" }}>
                  <div className="project-name">{p.name}</div>
                  {p.dropbox && (
                    <a href={p.dropbox} target="_blank" rel="noreferrer" className="dropbox" onClick={(e)=>e.stopPropagation()}>
                      Dropbox link
                    </a>
                  )}
                  <div className="spacer" />
                  <button className="danger" onClick={(e)=>{ e.stopPropagation(); deleteProject(p.id); }}>Delete</button>
                </div>
              ))
            )}
          </section>
        </>
      )}

      {/* Folders */}
      {activeProject && !activeFolder && (
        <>
          <section className="card">
            <h2>Folders (Rounds) in “{activeProject.name}”</h2>
            <div className="row" style={{ marginTop: 8 }}>
              <button onClick={createNextRound} disabled={folderCreating}>{folderCreating ? "Creating…" : "Create a Round"}</button>
            </div>
          </section>

          <section className="card">
            <h2>All Folders</h2>
            {folders.length === 0 ? (
              <div className="muted">No folders yet — create one above.</div>
            ) : (
              folders.map((f) => (
                <FolderRow key={f.id} folder={f} onOpen={() => setActiveFolderId(f.id)} onRename={(name)=>renameFolder(f.id, name)} />
              ))
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
              <button onClick={() => setActiveFolderId(null)}>Back to Folders</button>
            </div>

            {images.length === 0 ? (
              <div className="muted" style={{ marginTop: 12 }}>No images yet for this folder.</div>
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

      {notice && <div className={`toast ${notice.type}`}>{notice.msg}</div>}
    </main>
  );
}

function FolderRow({ folder, onOpen, onRename }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(folder.name || "");
  const save = () => { const name = val.trim(); if (!name) return; onRename(name); setEditing(false); };
  return (
    <div className="project" onClick={() => !editing && onOpen()} style={{ cursor: "pointer" }}>
      {!editing ? (
        <div className="project-name">📁 {folder.name}</div>
      ) : (
        <input value={val} onChange={(e)=>setVal(e.target.value)} onClick={(e)=>e.stopPropagation()}
               onKeyDown={(e)=>{ if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }} />
      )}
      <div className="spacer" />
      {!editing ? (
        <button onClick={(e)=>{ e.stopPropagation(); setEditing(true); }}>Rename</button>
      ) : (
        <button onClick={(e)=>{ e.stopPropagation(); save(); }}>Save</button>
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
        <h2>Help</h2>
        <ol style={{ lineHeight: 1.6 }}>
          <li>Create a project, then click it to view folders.</li>
          <li>Click <b>Create a Round</b> to add a folder.</li>
          <li>Open a folder, then drag & drop images into the dashed box or click <b>Browse files</b>.</li>
          <li>Click <b>Open Markup</b> on an image to annotate.</li>
        </ol>
        <Link to="/" className="dropbox">← Back to Home</Link>
      </section>
    </main>
  );
}

/* ────────────────────────────────────────────────────────────────
   Full Image Viewer with tools
──────────────────────────────────────────────────────────────── */
function ImageViewer() {
  const { projectId, folderId, imageId } = useParams();
  const navigate = useNavigate();

  const [imageDoc, setImageDoc] = useState(null);

  const [serverStrokes, setServerStrokes] = useState([]);
  const [localStrokes, setLocalStrokes] = useState([]);
  const [comments, setComments] = useState([]);

  const [mode, setMode] = useState("select"); // select | pan | draw
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

  const commentRefs = useRef({});
  const didFit = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const offsetStart = useRef({ x: 0, y: 0 });

  const [toolboxOpen, setToolboxOpen] = useState(true);
  const [activePopout, setActivePopout] = useState(null); // pencil | zoom | color | null

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
    const qy = query(collection(db, "projects", projectId, "folders", folderId, "images", imageId, "markups"), orderBy("createdAt", "asc"));
    const stop = onSnapshot(qy, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setServerStrokes(list);
      setLocalStrokes((prev) => prev.filter((l) => !list.some((s) => s.id === l.id)));
    });
    return () => stop();
  }, [projectId, folderId, imageId]);

  // Comments live
  useEffect(() => {
    const qy = query(collection(db, "projects", projectId, "folders", folderId, "images", imageId, "comments"), orderBy("createdAt", "asc"));
    const stop = onSnapshot(qy, (snap) => setComments(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
    return () => stop();
  }, [projectId, folderId, imageId]);

  // Draw
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
        ctx.fillStyle = "#fff"; ctx.font = "10px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(String(count), x, y);
      }
    };

    const all = [...serverStrokes, ...localStrokes];
    for (const m of all) {
      // base stroke
      drawPath(m.path, m.color, m.size);
      // tag at center
      if (m.bbox) {
        const cx = m.bbox.x + m.bbox.w / 2, cy = m.bbox.y + m.bbox.h / 2;
        drawTag(cx, cy, comments.filter((c) => c.markupId === m.id).length);
      }
    }

    // Selection outline (cyan “stroke on path” look)
    if (selectedMarkupId) {
      const sel = all.find((m) => m.id === selectedMarkupId);
      if (sel) {
        // cyan outline behind
        drawPath(sel.path, "rgba(34,211,238,0.9)", (sel.size || 6) + 8); // cyan
        // draw original again on top
        drawPath(sel.path, sel.color, sel.size || 6);
      }
    }

    // Current drawing on top
    drawPath(currentPath, color, brush);
  }, [serverStrokes, localStrokes, currentPath, color, brush, comments, selectedMarkupId]);

  // Helpers
  const toImage = (e) => {
    const r = viewportRef.current.getBoundingClientRect();
    return { x: (e.clientX - r.left - offset.x) / zoom, y: (e.clientY - r.top - offset.y) / zoom };
  };

  // Zoom helper (keep viewport center fixed)
  const setZoomKeepingCenter = (zNew) => {
    if (!viewportRef.current) { setZoom(zNew); return; }
    const vw = viewportRef.current.clientWidth, vh = viewportRef.current.clientHeight;
    const vx = vw / 2, vy = vh / 2;
    const wx = (vx - offset.x) / zoom;
    const wy = (vy - offset.y) / zoom;
    const ox = vx - wx * zNew;
    const oy = vy - wy * zNew;
    setZoom(zNew);
    setOffset({ x: ox, y: oy });
  };

  // Pointer interactions
  const onPointerDown = (e) => {
    if (e.target.closest(".toolbox-wrap") ||
        /^(BUTTON|INPUT|SELECT|TEXTAREA|LABEL)$/i.test(e.target.tagName)) return;
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

    const xs = finalPath.map(p => p.x), ys = finalPath.map(p => p.y);
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

  // Click to select markup
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
      if (k === "b") setMode("draw");
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

  // Comment helpers
  const onPickRef = (file) => {
    if (!file) { setRefFile(null); if (refPreview) URL.revokeObjectURL(refPreview); setRefPreview(null); return; }
    setRefFile(file);
    setRefPreview(URL.createObjectURL(file));
  };
  const clearRef = () => onPickRef(null);

  // Allow dropping an image onto the comment area
  const onDropRef = (e) => {
    e.preventDefault();
    const f = e.dataTransfer?.files?.[0];
    if (f && /^image\//.test(f.type)) onPickRef(f);
  };

  const renderWithLinks = (text) => {
    const parts = [];
    const regex = /https?:\/\/\S+/gi;
    let last = 0; let m;
    while ((m = regex.exec(text))) {
      const url = m[0];
      if (m.index > last) parts.push(text.slice(last, m.index));
      parts.push(<a key={m.index} href={url} target="_blank" rel="noreferrer noopener" className="dropbox">{url}</a>);
      last = m.index + url.length;
    }
    if (last < text.length) parts.push(text.slice(last));
    return parts;
  };

  const addComment = async () => {
    const text = commentText.trim();
    if (!text && !linkUrl && !refFile) return;
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
      else alert(data.error?.message || "Reference image upload failed");
    }
    await addDoc(
      collection(db, "projects", projectId, "folders", folderId, "images", imageId, "comments"),
      { markupId: selectedMarkupId, text: text || null, link: linkUrl.trim() || null, refImageUrl, refImageId, createdAt: serverTimestamp() }
    );
    setCommentText(""); setLinkUrl(""); clearRef();
  };

  const deleteComment = async (cid, linkedMarkupId) => {
    const confirm1 = window.confirm("Delete this comment?");
    if (!confirm1) return;
    let also = false;
    if (linkedMarkupId) also = window.confirm("Also delete its linked markup AND all comments linked to that markup?");
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

  const onSelectMarkup = (mid) => { setSelectedMarkupId(mid || null); if (mid) scrollToFirstCommentFor(mid); };

  // Icons (white line art)
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

  // Inline styles for toolbox
  const barBG = "rgba(31,41,55,.72)";
  const toolBoxWrap = { position: "absolute", left: 10, top: 10, zIndex: 12, display: "flex", flexDirection: "column", alignItems: "stretch" };
  const toolBtn = (active=false) => ({ width: 38, height: 38, borderRadius: 10, background: active ? "rgba(16,185,129,.18)" : barBG, border: "1px solid rgba(255,255,255,.18)", display: "grid", placeItems: "center", cursor: "pointer", marginBottom: 6 });
  const colorBtn = () => ({ ...toolBtn(false), background: barBG, position: "relative", overflow: "hidden" });
  const colorDot = (current) => ({ width: 18, height: 18, borderRadius: "50%", background: current, border: "1.6px solid #fff" });
  const toolHeader = { display: "grid", gridTemplateColumns: "auto 1fr", alignItems: "center", gap: 8, background: barBG, color: "#fff", border: "1px solid rgba(255,255,255,.18)", borderRadius: 12, padding: "6px 8px", cursor: "pointer", marginBottom: 6 };
  const drawer = { background: "rgba(17,24,39,.86)", color: "#fff", border: "1px solid rgba(255,255,255,.18)", borderRadius: 12, padding: 8, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 };
  const popout = (y) => ({ position: "absolute", left: 48, top: y, background: "rgba(17,24,39,.9)", border: "1px solid rgba(255,255,255,.18)", borderRadius: 10, padding: 8, boxShadow: "0 10px 24px rgba(0,0,0,.25)", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, zIndex: 13 });
  const verticalSlider = { transform: "rotate(-90deg)", width: 140, height: 24 };

  return (
    <div className="viewer">
      {/* Left: viewport */}
      <div className="left">
        <div
          ref={viewportRef}
          className="viewport"
          style={{ cursor: mode === "pan" ? (panning ? "grabbing" : "grab") : mode === "draw" ? "crosshair" : "default" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onClick={onCanvasClick}
        >
          {/* TOOLBOX */}
          <div className="toolbox-wrap" style={toolBoxWrap} onPointerDown={(e)=>e.stopPropagation()} onPointerUp={(e)=>e.stopPropagation()} onClick={(e)=>e.stopPropagation()}>
            <div style={toolHeader} onClick={() => setToolboxOpen((s) => !s)} title="Toggle tools (T)">
              <IconToolbox open={toolboxOpen} /><span style={{ fontSize: 12, color: "#e5e7eb" }}>Tools</span>
            </div>
            {toolboxOpen && (
              <div style={drawer}>
                <button style={toolBtn(mode === "select")} onClick={() => { setMode("select"); setActivePopout(null); }} title="Select (V)"><IconCrosshair/></button>
                <button style={toolBtn(mode === "pan")}    onClick={() => { setMode("pan"); setActivePopout(null); }} title="Hand (H)"><IconHand/></button>
                <div style={{ position: "relative" }}>
                  <button style={toolBtn(mode === "draw")} onClick={() => { setMode("draw"); setActivePopout(activePopout === "pencil" ? null : "pencil"); }} title="Pencil (B)"><IconPencil/></button>
                  {activePopout === "pencil" && (
                    <div style={popout(0)}>
                      <span style={{ fontSize: 11, color: "#e5e7eb" }}>Pencil</span>
                      <input type="range" min="1" max="32" value={brush} onChange={(e)=>setBrush(Number(e.target.value))} style={verticalSlider}/>
                      <div style={{ fontSize: 11, color: "#e5e7eb" }}>{brush}px</div>
                    </div>
                  )}
                </div>
                <div style={{ position: "relative" }}>
                  <button style={toolBtn(false)} onClick={() => setActivePopout(activePopout === "zoom" ? null : "zoom")} title="Zoom"><IconZoom/></button>
                  {activePopout === "zoom" && (
                    <div style={popout(0)}>
                      <span style={{ fontSize: 11, color: "#e5e7eb" }}>Zoom</span>
                      <input
                        type="range" min="0.5" max="5" step="0.1" value={zoom}
                        onChange={(e)=>setZoomKeepingCenter(Number(e.target.value))}
                        style={verticalSlider}
                      />
                      <div style={{ fontSize: 11, color: "#e5e7eb" }}>{Math.round(zoom*100)}%</div>
                    </div>
                  )}
                </div>
                <div style={{ position: "relative" }}>
                  <button style={colorBtn()} onClick={() => setActivePopout(activePopout === "color" ? null : "color")} title="Color">
                    <div style={colorDot(color)} />
                  </button>
                  {activePopout === "color" && (
                    <div style={popout(0)}>
                      <span style={{ fontSize: 11, color: "#e5e7eb" }}>Color</span>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 22px)", gap: 6 }}>
                        {["#ff2d55","#10b981","#0d8dea","#f59e0b","#ef4444","#a855f7","#111827","#ffffff"].map((c) => (
                          <button key={c} onClick={() => setColor(c)} style={{
                            width:22,height:22,borderRadius:6,border:"1px solid rgba(255,255,255,.25)",background:c,cursor:"pointer",boxShadow: c===color ? "0 0 0 2px #22d3ee inset" : "none"
                          }}/>
                        ))}
                      </div>
                      <input type="color" value={color} onChange={(e)=>setColor(e.target.value)} style={{ width: 28, height: 28, marginTop: 6, border: "none", background: "transparent" }}/>
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
          <Link to="/" className="dropbox" style={{ marginLeft: 0, display: "inline-block", marginTop: 8 }}>← Home</Link>
        </div>
      </div>

      {/* Right: comments */}
      <aside className="right">
        <div className="card" style={{ borderRadius: 0 }}>
          <h2 style={{ marginBottom: 8 }}>Comments</h2>
          <div className="muted" style={{ marginBottom: 8 }}>
            Enter = <b>add comment</b> • Shift+Enter = newline. Select a markup first.
          </div>

          <select value={selectedMarkupId || ""} onChange={(e)=>onSelectMarkup(e.target.value)} className="select">
            <option value="">Choose a markup…</option>
            {[...serverStrokes, ...localStrokes].map((m, idx) => (
              <option key={m.id} value={m.id}>#{idx + 1} — {m.color} — {m.size || 0}px</option>
            ))}
          </select>

          <div
            onDragOver={(e)=>e.preventDefault()}
            onDrop={onDropRef}
            style={{ border: "1px dashed #334155", borderRadius: 8, padding: 8, marginTop: 8 }}
            title="Drop an image here to attach as a reference"
          >
            <textarea
              rows={3}
              placeholder="Write a comment… (URLs auto-link) • Drop an image here to attach"
              value={commentText}
              onChange={(e)=>setCommentText(e.target.value)}
              className="textarea"
              onKeyDown={(e)=>{ if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addComment(); } }}
            />
          </div>

          <input
            type="url"
            placeholder="Link (optional, e.g. https://example.com)"
            value={linkUrl}
            onChange={(e)=>setLinkUrl(e.target.value)}
            className="input"
            style={{ marginTop: 6 }}
            onKeyDown={(e)=>{ if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addComment(); } }}
          />

          <div className="ref-row" style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center" }}>
            <input id="refPick" type="file" accept="image/*" onChange={(e)=>onPickRef(e.target.files?.[0] || null)} style={{ display: "none" }} />
            <button onClick={() => document.getElementById("refPick").click()}>{refFile ? "Change Reference Image" : "Attach Reference Image"}</button>
            {refFile && <button className="danger" onClick={clearRef}>Remove</button>}
          </div>

          {refPreview && (
            <div className="ref-preview">
              <img src={refPreview} alt="Reference preview" className="ref-thumb" />
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
              return (
                <div
                  key={c.id}
                  ref={(el) => { if (el) commentRefs.current[c.id] = el; else delete commentRefs.current[c.id]; }}
                  className={`comment ${isActive ? "active" : ""}`}
                  onClick={() => { setSelectedCommentId(c.id); setSelectedMarkupId(c.markupId); }}
                >
                  <div className="comment-head" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div className="comment-link" style={{ flex: 1 }}>Linked to markup #{idx >= 0 ? idx + 1 : "?"}</div>
                    <button className="icon danger" title="Delete comment (optionally also delete its markup)" onClick={(e)=>{ e.stopPropagation(); deleteComment(c.id, c.markupId); }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                      </svg>
                    </button>
                  </div>
                  {c.text && <div style={{ marginBottom: 6 }}>{renderWithLinks(c.text)}</div>}
                  {c.link && (
                    <div style={{ marginBottom: 6 }}>
                      <a href={c.link} target="_blank" rel="noreferrer noopener" className="dropbox">{c.link}</a>
                    </div>
                  )}
                  {c.refImageUrl && (
                    <a href={c.refImageUrl} target="_blank" rel="noreferrer noopener">
                      <img src={c.refImageUrl} alt="Reference" className="ref-thumb" />
                    </a>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="card" style={{ borderRadius: 0 }}>
          <Link to="/" className="dropbox">← Back to Home</Link>
        </div>
      </aside>
    </div>
  );
}
