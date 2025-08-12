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
} from "firebase/firestore";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
} from "firebase/auth";

/** Cloudinary (unsigned) */
const CLOUD_NAME = "dwcgdkoxd";
const UPLOAD_PRESET = "retouch-markup";
const CLOUD_ROOT = "retouch";

/** Helpers */
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

  return (
    <HashRouter>
      {/* Inject small CSS for popouts/sliders */}
      <StyleInjector />
      <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
        <header className="topbar">
          <div className="brand">retouchRoom — Client Markups</div>
          <nav className="nav">
            {user ? (
              <>
                <Link to="/" className="navlink">
                  Home
                </Link>
                <span className="dot">•</span>
                <Link to="/help" className="navlink">
                  Help
                </Link>
                <span className="dot">•</span>
                <span className="navlink" style={{ opacity: 0.8 }}>
                  {user.email}
                </span>
                <button className="danger" style={{ marginLeft: 8 }} onClick={doSignOut}>
                  Sign out
                </button>
              </>
            ) : (
              <Link to="/login" className="navlink">
                Sign in
              </Link>
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
          </Routes>
        </div>
      </div>
    </HashRouter>
  );
}

/* Tiny CSS injector for popouts + sliders */
function StyleInjector() {
  return (
    <style>{`
      .pop-card {
        background: rgba(17, 24, 39, 0.92);
        border: 1px solid rgba(255,255,255,.14);
        border-radius: 12px;
        padding: 10px 12px;
        color: #e5e7eb;
        box-shadow: 0 10px 30px rgba(0,0,0,.35), 0 0 0 1px rgba(255,255,255,.04) inset;
        backdrop-filter: blur(6px);
      }

      /* Pretty vertical slider */
      .vrange {
        -webkit-appearance: none;
        appearance: none;
        width: 160px; height: 28px;
        transform: rotate(-90deg);
        background: transparent;
        outline: none;
      }
      .vrange::-webkit-slider-runnable-track {
        height: 6px;
        background: linear-gradient(90deg,#0ea5e9,#22d3ee);
        border-radius: 999px;
        box-shadow: 0 2px 10px rgba(0,0,0,.35) inset;
      }
      .vrange::-moz-range-track {
        height: 6px;
        background: linear-gradient(90deg,#0ea5e9,#22d3ee);
        border-radius: 999px;
      }
      .vrange::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 16px; height: 16px; border-radius: 50%;
        background: #3b82f6; border: 2px solid #e5f0ff;
        margin-top: -5px;
        box-shadow: 0 1px 4px rgba(0,0,0,.4);
      }
      .vrange::-moz-range-thumb {
        width: 16px; height: 16px; border-radius: 50%;
        background: #3b82f6; border: 2px solid #e5f0ff;
        box-shadow: 0 1px 4px rgba(0,0,0,.4);
      }

      /* Keep slider and labels side-by-side so they never overlap */
      .pop-grid {
        display: grid;
        grid-template-columns: 36px 1fr; /* rail | labels */
        align-items: center;
        gap: 12px;
        min-width: 220px;
      }
      .pop-rail {
        width: 36px; height: 170px;
        display: flex; align-items: center; justify-content: center;
      }
      .pop-labels { display: flex; flex-direction: column; gap: 6px; }
      .pop-title { font-size: 12px; font-weight: 600; opacity: .9; }
      .pop-value { font-size: 12px; opacity: .85; }
    `}</style>
  );
}

/* ────────────────────────────────────────────────────────────────
   Login (Email/Password)
──────────────────────────────────────────────────────────────── */
function Login() {
  const nav = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || "/";

  const [mode, setMode] = useState("signin"); // 'signin' | 'signup'
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      if (mode === "signin") {
        await signInWithEmailAndPassword(auth, email.trim(), pw);
      } else {
        await createUserWithEmailAndPassword(auth, email.trim(), pw);
      }
      nav(from, { replace: true });
    } catch (e) {
      setErr(e.message || "Authentication failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="wrap" style={{ height: "100%", display: "grid", placeItems: "center" }}>
      <form className="card" onSubmit={onSubmit} style={{ minWidth: 340, maxWidth: 420 }}>
        <h2 style={{ marginBottom: 12 }}>{mode === "signin" ? "Sign in" : "Create account"}</h2>
        <input
          type="email"
          placeholder="Email"
          value={email}
          autoComplete="email"
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Password (min 6 chars)"
          value={pw}
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          onChange={(e) => setPw(e.target.value)}
          minLength={6}
          required
          style={{ marginTop: 8 }}
        />
        {err && <div className="muted" style={{ color: "#ef4444", marginTop: 8 }}>{err}</div>}

        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button type="submit" disabled={busy}>
            {busy ? (mode === "signin" ? "Signing in…" : "Creating…") : (mode === "signin" ? "Sign in" : "Create account")}
          </button>
          <button type="button" onClick={() => setMode(mode === "signin" ? "signup" : "signin")} disabled={busy}>
            {mode === "signin" ? "Need an account?" : "Have an account?"}
          </button>
        </div>
      </form>
    </main>
  );
}

/* ────────────────────────────────────────────────────────────────
   Home (Projects → Folders → Images)
──────────────────────────────────────────────────────────────── */
function Home() {
  // Projects
  const [projects, setProjects] = useState([]);
  const [projectName, setProjectName] = useState("");
  const [dropboxLink, setDropboxLink] = useState("");
  const [activeProjectId, setActiveProjectId] = useState(null);

  // Folders
  const [folders, setFolders] = useState([]);
  const [folderName, setFolderName] = useState(isoDate());
  const [activeFolderId, setActiveFolderId] = useState(null);
  const [creatingFolder, setCreatingFolder] = useState(false);

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

  /** Projects live */
  useEffect(() => {
    const qy = query(collection(db, "projects"), orderBy("createdAt", "desc"));
    const stop = onSnapshot(qy, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setProjects(list);
      if (activeProjectId && !list.find((p) => p.id === activeProjectId)) setActiveProjectId(null);
    });
    return () => stop();
  }, [activeProjectId]);

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

  /** Actions */
  const createProject = async () => {
    const name = projectName.trim();
    if (!name) return;
    const ref = await addDoc(collection(db, "projects"), {
      name,
      dropbox: dropboxLink.trim() || null,
      createdAt: serverTimestamp(),
    });
    setProjectName("");
    setDropboxLink("");
    setActiveProjectId(ref.id);
  };

  const deleteProject = async (id) => {
    await deleteDoc(doc(db, "projects", id));
    if (id === activeProjectId) setActiveProjectId(null);
  };

  const createFolder = async () => {
    if (!activeProjectId) return alert("Open a project first.");
    const name = (folderName || isoDate()).trim();
    if (!name) return;
    try {
      setCreatingFolder(true);
      const ref = await addDoc(collection(db, "projects", activeProjectId, "folders"), {
        name,
        createdAt: serverTimestamp(),
      });
      setActiveFolderId(ref.id);
      setFolderName(isoDate());
    } catch (e) {
      alert(e.message || "Failed to create folder.");
    } finally {
      setCreatingFolder(false);
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
        await addDoc(collection(db, "projects", activeProjectId, "folders", activeFolderId, "images"), {
          url: data.secure_url,
          publicId: data.public_id,
          format: data.format,
          bytes: data.bytes,
          width: data.width,
          height: data.height,
          name: file.name,
          uploadedAt: serverTimestamp(),
        });
      }
      const n = files.length;
      showNotice(`Uploaded ${n} file${n > 1 ? "s" : ""} ✅`, "ok");
    } finally {
      setIsUploading(false);
    }
  };

  /** DnD */
  const onDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };
  const onDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };
  const onDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget === e.target) setIsDragging(false);
  };
  const onDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer?.files?.length) handleUpload(e.dataTransfer.files);
  };

  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId) || null,
    [projects, activeProjectId]
  );
  const activeFolder = useMemo(
    () => folders.find((f) => f.id === activeFolderId) || null,
    [folders, activeFolderId]
  );

  return (
    <main className="wrap" style={{ height: "100%", overflow: "auto" }}>
      {/* Projects */}
      {!activeProject && (
        <>
          <section className="card">
            <h2>Create Project</h2>
            <input
              placeholder="Project Name"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
            />
            <input
              placeholder="Dropbox File Request Link (optional)"
              value={dropboxLink}
              onChange={(e) => setDropboxLink(e.target.value)}
            />
            <button onClick={createProject}>Add Project</button>
          </section>

          <section className="card">
            <h2>Projects</h2>
            {projects.length === 0 ? (
              <div className="muted">No projects yet — add one above.</div>
            ) : (
              projects.map((p) => (
                <div key={p.id} className="project">
                  <div className="project-name">{p.name}</div>
                  {p.dropbox && (
                    <a href={p.dropbox} target="_blank" rel="noreferrer" className="dropbox">
                      Dropbox link
                    </a>
                  )}
                  <div className="spacer" />
                  <button onClick={() => setActiveProjectId(p.id)}>
                    {activeProjectId === p.id ? "Active" : "Open"}
                  </button>
                  <button className="danger" onClick={() => deleteProject(p.id)}>
                    Delete
                  </button>
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
              <input
                placeholder="Folder name (e.g., 2025-08-11 or Round 1)"
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
              />
              <button onClick={createFolder} disabled={creatingFolder || !folderName.trim()}>
                {creatingFolder ? "Creating…" : "+ Create Folder"}
              </button>
            </div>
          </section>

          <section className="card">
            <h2>All Folders</h2>
            {folders.length === 0 ? (
              <div className="muted">No folders yet — create one above.</div>
            ) : (
              folders.map((f) => (
                <div key={f.id} className="project">
                  <div className="project-name">📁 {f.name}</div>
                  <div className="spacer" />
                  <button onClick={() => setActiveFolderId(f.id)}>Open</button>
                </div>
              ))
            )}
          </section>
        </>
      )}

      {/* Images */}
      {activeProject && activeFolder && (
        <>
          <section className="card">
            <h2>
              Images — {activeProject.name} / {activeFolder.name}
            </h2>
          </section>

          <section className="card">
            <h2>Upload Images</h2>
            <div
              className={`dropzone ${isDragging ? "is-dragging" : ""} ${
                isUploading ? "is-uploading" : ""
              }`}
              onDragEnter={onDragEnter}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
            >
              <p>
                <strong>Drag & drop</strong> images here
              </p>
              <p className="muted">or</p>
              <button onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
                Browse files
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/png,image/jpeg,image/webp"
                style={{ display: "none" }}
                onChange={(e) => handleUpload(e.target.files)}
              />
              <small className="muted" style={{ display: "block", marginTop: 8 }}>
                Cloudinary path: <code>{CLOUD_ROOT}/{activeProjectId}/{activeFolder?.name}</code>
              </small>
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <h2>Image List</h2>
              <button onClick={() => setActiveFolderId(null)}>Back to Folders</button>
            </div>

            {images.length === 0 ? (
              <div className="muted" style={{ marginTop: 12 }}>
                No images yet for this folder.
              </div>
            ) : (
              <div className="grid images">
                {images.map((img) => (
                  <div key={img.id} className="img-tile" title={img.name}>
                    <img src={img.url} alt={img.name} />
                    <div className="img-meta">
                      <div className="img-name" title={img.name}>
                        {img.name}
                      </div>
                      <div className="img-size">
                        {img.width}×{img.height}
                      </div>
                    </div>
                    <div className="img-actions">
                      <Link className="dropbox" to={`/view/${activeProjectId}/${activeFolderId}/${img.id}`}>
                        Open Markup
                      </Link>
                      <a className="dropbox" href={img.url} target="_blank" rel="noreferrer">
                        Open Image
                      </a>
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
   Image Viewer with Stylized Toolbox & Popouts + Centered Zoom
──────────────────────────────────────────────────────────────── */
function ImageViewer() {
  const { projectId, folderId, imageId } = useParams();
  const navigate = useNavigate();

  const [imageDoc, setImageDoc] = useState(null);

  const [serverStrokes, setServerStrokes] = useState([]); // from Firestore
  const [localStrokes, setLocalStrokes] = useState([]); // optimistic-only
  const [comments, setComments] = useState([]);

  const [mode, setMode] = useState("select"); // "select" | "pan" | "draw"
  const [color, setColor] = useState("#ff2d55");
  const [brush, setBrush] = useState(6); // pencil size
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

  const commentRefs = useRef({}); // id -> element
  const commentBoxRef = useRef(null);
  const didFit = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const offsetStart = useRef({ x: 0, y: 0 });

  // Toolbox open/close + active popout
  const [toolboxOpen, setToolboxOpen] = useState(true);
  const [activePopout, setActivePopout] = useState(null); // "zoom" | "pencil" | "color" | null

  // Local toast in viewer
  const [notice, setNotice] = useState(null);
  const showNotice = (msg, type = "ok") => {
    setNotice({ msg, type });
    window.clearTimeout(showNotice.tid);
    showNotice.tid = window.setTimeout(() => setNotice(null), 2000);
  };

  // ---- Zoom helpers ----
  const Z_MIN = 0.2,
    Z_MAX = 5;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /** Keep the focal point (default = viewer center) fixed while zooming */
  const zoomAt = (newZoom, focalPx) => {
    const view = viewportRef.current;
    if (!view) {
      setZoom(clamp(newZoom, Z_MIN, Z_MAX));
      return;
    }

    const rect = view.getBoundingClientRect();
    const cx = focalPx?.x ?? rect.width / 2;
    const cy = focalPx?.y ?? rect.height / 2;

    const z0 = zoom;
    const z1 = clamp(newZoom, Z_MIN, Z_MAX);

    // Convert focal screen point to image coords at old zoom
    const ix = (cx - offset.x) / z0;
    const iy = (cy - offset.y) / z0;

    // New offset so the same image coord stays under the focal point
    const ox = cx - ix * z1;
    const oy = cy - iy * z1;

    setZoom(z1);
    setOffset({ x: ox, y: oy });
  };

  /** Trackpad pinch (or Ctrl/⌘ + wheel) zooms around pointer */
  const onWheelZoom = (e) => {
    if (!(e.ctrlKey || e.metaKey)) return; // only when pinching / ctrl-zooming
    e.preventDefault();
    const rect = viewportRef.current.getBoundingClientRect();
    const target = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const factor = Math.exp(-e.deltaY * 0.0015); // smooth
    zoomAt(zoom * factor, target);
  };

  // Load image
  useEffect(() => {
    (async () => {
      const dref = doc(db, "projects", projectId, "folders", folderId, "images", imageId);
      const snap = await getDoc(dref);
      if (snap.exists()) setImageDoc({ id: snap.id, ...snap.data() });
      else {
        alert("Image not found");
        navigate("/");
      }
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
    const stop = onSnapshot(qy, (snap) =>
      setComments(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => stop();
  }, [projectId, folderId, imageId]);

  // Draw everything
  useEffect(() => {
    const cvs = canvasRef.current,
      img = imgRef.current;
    if (!cvs || !img || !img.naturalWidth) return;

    cvs.width = img.naturalWidth;
    cvs.height = img.naturalHeight;

    const ctx = cvs.getContext("2d");
    ctx.clearRect(0, 0, cvs.width, cvs.height);

    const drawPath = (path, col, w) => {
      if (!path || path.length < 2) return;
      ctx.strokeStyle = col;
      ctx.lineWidth = w;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(path[0].x, path[0].y);
      for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
      ctx.stroke();
    };
    const drawTag = (x, y, count) => {
      const r = 8;
      ctx.fillStyle = "#0d8dea";
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      if (count > 0) {
        ctx.fillStyle = "#fff";
        ctx.font = "10px system-ui";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(count), x, y);
      }
    };

    const all = [...serverStrokes, ...localStrokes];
    for (const m of all) {
      drawPath(m.path, m.color, m.size);
      if (m.bbox) {
        const cx = m.bbox.x + m.bbox.w / 2,
          cy = m.bbox.y + m.bbox.h / 2;
        drawTag(
          cx,
          cy,
          comments.filter((c) => c.markupId === m.id).length
        );
      }
    }

    // Cyan outline for selected markup (under the original stroke)
    if (selectedMarkupId) {
      const allStrokes = [...serverStrokes, ...localStrokes];
      const sel = allStrokes.find((m) => m.id === selectedMarkupId);
      if (sel && sel.path && sel.path.length > 1) {
        const outlineWidth = Math.max(2, (sel.size || 6) + 6);
        ctx.save();
        ctx.globalCompositeOperation = "destination-over";
        ctx.strokeStyle = "#06b6d4"; // cyan
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

    // Current drawing on top
    drawPath(currentPath, color, brush);
  }, [serverStrokes, localStrokes, currentPath, color, brush, comments, selectedMarkupId]);

  // Helpers
  const toImage = (e) => {
    const r = viewportRef.current.getBoundingClientRect();
    return {
      x: (e.clientX - r.left - offset.x) / zoom,
      y: (e.clientY - r.top - offset.y) / zoom,
    };
  };

  // Pointer interactions
  const onPointerDown = (e) => {
    if (
      e.target.closest(".toolbox-wrap") ||
      /^(BUTTON|INPUT|SELECT|TEXTAREA|LABEL)$/i.test(e.target.tagName)
    ) {
      return;
    }
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
      const dx = e.clientX - panStart.current.x,
        dy = e.clientY - panStart.current.y;
      setOffset({ x: offsetStart.current.x + dx, y: offsetStart.current.y + dy });
    }
    if (drawing && mode === "draw") setCurrentPath((p) => [...p, toImage(e)]);
  };
  const onPointerUp = async (e) => {
    if (e.target.closest(".toolbox-wrap")) return;

    const el = viewportRef.current;
    el.releasePointerCapture?.(e.pointerId);

    if (mode === "pan" && panning) {
      setPanning(false);
      return;
    }
    if (mode !== "draw") return;

    if (currentPath.length < 2) {
      setDrawing(false);
      setCurrentPath([]);
      return;
    }
    const finalPath = currentPath.slice();

    const xs = finalPath.map((p) => p.x),
      ys = finalPath.map((p) => p.y);
    const bbox = {
      x: Math.min(...xs),
      y: Math.min(...ys),
      w: Math.max(...xs) - Math.min(...xs),
      h: Math.max(...ys) - Math.min(...ys),
    };

    const coll = collection(
      db,
      "projects",
      projectId,
      "folders",
      folderId,
      "images",
      imageId,
      "markups"
    );
    const newRef = doc(coll);
    const stroke = {
      id: newRef.id,
      color,
      size: brush,
      path: finalPath,
      bbox,
      createdAt: new Date(),
    };

    setLocalStrokes((prev) => [...prev, stroke]);
    setSelectedMarkupId(newRef.id);
    setDrawing(false);
    setCurrentPath([]);

    await setDoc(newRef, {
      color,
      size: brush,
      path: finalPath,
      bbox,
      createdAt: serverTimestamp(),
    });
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
      if (
        b &&
        p.x >= b.x - PAD &&
        p.x <= b.x + b.w + PAD &&
        p.y >= b.y - PAD &&
        p.y <= b.y + b.h + PAD
      ) {
        const mid = all[i].id;
        setSelectedMarkupId(mid);
        scrollToFirstCommentFor(mid);
        return;
      }
    }
  };

  // Keyboard shortcuts (global)
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
          const linked = comments.find((c) => c.id === selectedCommentId)?.markupId || null;
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
  const onPickRef = (e) => {
    const f = e.target.files?.[0];
    if (!f) {
      setRefFile(null);
      setRefPreview(null);
      return;
    }
    setRefFile(f);
    setRefPreview(URL.createObjectURL(f));
  };
  const clearRef = () => {
    setRefFile(null);
    if (refPreview) URL.revokeObjectURL(refPreview);
    setRefPreview(null);
  };

  const renderWithLinks = (text) => {
    const parts = [];
    const regex = /https?:\/\/\S+/gi;
    let last = 0;
    let m;
    while ((m = regex.exec(text))) {
      const url = m[0];
      if (m.index > last) parts.push(text.slice(last, m.index));
      parts.push(
        <a
          key={m.index}
          href={url}
          target="_blank"
          rel="noreferrer noopener"
          className="dropbox"
        >
          {url}
        </a>
      );
      last = m.index + url.length;
    }
    if (last < text.length) parts.push(text.slice(last));
    return parts;
  };

  const addComment = async () => {
    const text = commentText.trim();
    const hasContent = !!(text || linkUrl.trim() || refFile);
    if (!hasContent) return;
    if (!selectedMarkupId) {
      alert("Select or draw a markup first.");
      return;
    }

    let refImageUrl = null,
      refImageId = null;
    if (refFile) {
      const fd = new FormData();
      fd.append("file", refFile);
      fd.append("upload_preset", UPLOAD_PRESET);
      fd.append("folder", `${CLOUD_ROOT}/refs/${projectId}/${imageId}`);
      const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (res.ok) {
        refImageUrl = data.secure_url;
        refImageId = data.public_id;
      } else {
        alert(data.error?.message || "Reference image upload failed");
        return;
      }
    }

    await addDoc(
      collection(db, "projects", projectId, "folders", folderId, "images", imageId, "comments"),
      {
        markupId: selectedMarkupId,
        text: text || null,
        link: linkUrl.trim() || null,
        refImageUrl,
        refImageId,
        createdAt: serverTimestamp(),
      }
    );

    setCommentText("");
    setLinkUrl("");
    clearRef();
    showNotice("Comment added ✅", "ok");
    commentBoxRef.current?.focus();
  };

  // Delete comment (optionally also delete its markup + all comments)
  const deleteComment = async (cid, linkedMarkupId) => {
    const confirm1 = window.confirm("Delete this comment?");
    if (!confirm1) return;
    let also = false;
    if (linkedMarkupId) {
      also = window.confirm(
        "Also delete its linked markup AND all comments linked to that markup?"
      );
    }
    try {
      if (also) {
        await deleteMarkupAndComments(linkedMarkupId);
      } else {
        await deleteDoc(
          doc(db, "projects", projectId, "folders", folderId, "images", imageId, "comments", cid)
        );
        if (selectedCommentId === cid) setSelectedCommentId(null);
      }
    } catch (e) {
      alert(e.message || "Failed to delete");
    }
  };

  // Delete the selected markup (+ all comments linked to it)
  const deleteSelectedMarkup = async () => {
    if (!selectedMarkupId) return;
    await deleteMarkupAndComments(selectedMarkupId);
  };

  // Delete a markup by id plus ALL comments that reference it
  const deleteMarkupAndComments = async (markupId) => {
    const proceed = window.confirm("Delete this markup and all comments linked to it?");
    if (!proceed) return;
    const mref = doc(
      db,
      "projects",
      projectId,
      "folders",
      folderId,
      "images",
      imageId,
      "markups",
      markupId
    );
    try {
      const cRef = collection(
        db,
        "projects",
        projectId,
        "folders",
        folderId,
        "images",
        imageId,
        "comments"
      );
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

  // Selecting from dropdown should scroll
  const onSelectMarkup = (mid) => {
    setSelectedMarkupId(mid || null);
    if (mid) scrollToFirstCommentFor(mid);
  };

  /* ── White line-art icons ─────────────────────────────────── */
  const stroke = "#fff",
    sw = 1.6,
    none = "none";
  const IconToolbox = ({ open }) => (
    <svg width="22" height="22" viewBox="0 0 24 24">
      <rect
        x="3"
        y={open ? 9 : 10}
        width="18"
        height="10"
        rx="2"
        fill="rgba(255,255,255,0.04)"
        stroke={stroke}
        strokeWidth={sw}
      />
      <rect
        x="4"
        y={open ? 6 : 8.5}
        width="16"
        height="2"
        rx="1"
        fill="rgba(255,255,255,0.08)"
        stroke={stroke}
        strokeWidth={sw}
      />
      <rect x="9" y={open ? 6.5 : 8} width="6" height="2" rx="1" fill={stroke} />
    </svg>
  );
  const IconCrosshair = () => (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill={none}
      stroke={stroke}
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="7" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
    </svg>
  );
  const IconHand = () => (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill={none}
      stroke={stroke}
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7 11v-3a1.5 1.5 0 013 0v3" />
      <path d="M10 10V6a1.5 1.5 0 013 0v4" />
      <path d="M13 10V5a1.5 1.5 0 013 0v5" />
      <path d="M16 11v-2a1.5 1.5 0 013 0v4a5 5 0 01-5 5h-1a5 5 0 01-5-5v-2" />
    </svg>
  );
  const IconPencil = () => (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill={none}
      stroke={stroke}
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M13 5l6 6-8 8H5v-6z" />
      <path d="M16 4l4 4" />
    </svg>
  );
  const IconZoom = () => (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill={none}
      stroke={stroke}
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="10" cy="10" r="6" />
      <path d="M21 21l-5.2-5.2" />
      <path d="M7 10h6M10 7v6" />
    </svg>
  );
  const IconTrash = () => (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#fff"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );

  // Styles (inline)
  const barBG = "rgba(31,41,55,.72)";
  const toolBoxWrap = {
    position: "absolute",
    left: 10,
    top: 10,
    zIndex: 12,
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
  };
  const toolBtn = (active = false) => ({
    width: 38,
    height: 38,
    borderRadius: 10,
    background: active ? "rgba(16,185,129,.18)" : barBG,
    border: "1px solid rgba(255,255,255,.18)",
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
    marginBottom: 6,
  });
  const colorBtn = () => ({
    ...toolBtn(false),
    background: barBG,
    position: "relative",
    overflow: "hidden",
  });
  const colorDot = (current) => ({
    width: 18,
    height: 18,
    borderRadius: "50%",
    background: current,
    border: "1.6px solid #fff",
  });
  const toolHeader = {
    display: "grid",
    gridTemplateColumns: "auto 1fr",
    alignItems: "center",
    gap: 8,
    background: barBG,
    color: "#fff",
    border: "1px solid rgba(255,255,255,.18)",
    borderRadius: 12,
    padding: "6px 8px",
    cursor: "pointer",
    marginBottom: 6,
  };
  const drawer = {
    background: "rgba(17,24,39,.86)",
    color: "#fff",
    border: "1px solid rgba(255,255,255,.18)",
    borderRadius: 12,
    padding: 8,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 8,
  };
  const popout = (y) => ({
    position: "absolute",
    left: 48,
    top: y,
    borderRadius: 10,
    padding: 8,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 6,
    zIndex: 13,
  });

  return (
    <div className="viewer">
      {/* Left */}
      <div className="left">
        <div
          ref={viewportRef}
          className="viewport"
          style={{
            cursor:
              mode === "pan" ? (panning ? "grabbing" : "grab") : mode === "draw" ? "crosshair" : "default",
          }}
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
              <span style={{ fontSize: 12, color: "#e5e7eb" }}>{toolboxOpen ? "Tools" : "Tools"}</span>
            </div>

            {toolboxOpen && (
              <div style={drawer}>
                <button
                  style={toolBtn(mode === "select")}
                  onClick={() => {
                    setMode("select");
                    setActivePopout(null);
                  }}
                  title="Select (V)"
                >
                  <IconCrosshair />
                </button>

                <button
                  style={toolBtn(mode === "pan")}
                  onClick={() => {
                    setMode("pan");
                    setActivePopout(null);
                  }}
                  title="Hand (H)"
                >
                  <IconHand />
                </button>

                <div style={{ position: "relative" }}>
                  <button
                    style={toolBtn(mode === "draw")}
                    onClick={() => {
                      setMode("draw");
                      setActivePopout(activePopout === "pencil" ? null : "pencil");
                    }}
                    title="Pencil (B)"
                  >
                    <IconPencil />
                  </button>
                  {activePopout === "pencil" && (
                    <div className="pop-card" style={popout(0)}>
                      <div className="pop-grid">
                        <div className="pop-rail">
                          <input
                            type="range"
                            min="1"
                            max="32"
                            value={brush}
                            onChange={(e) => setBrush(Number(e.target.value))}
                            className="vrange"
                            aria-label="Brush size"
                          />
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
                  <button
                    style={toolBtn(false)}
                    onClick={() => setActivePopout(activePopout === "zoom" ? null : "zoom")}
                    title="Zoom"
                  >
                    <IconZoom />
                  </button>
                  {activePopout === "zoom" && (
                    <div className="pop-card" style={popout(0)}>
                      <div className="pop-grid">
                        <div className="pop-rail">
                          <input
                            type="range"
                            min="0.2"
                            max="5"
                            step="0.05"
                            value={zoom}
                            onChange={(e) => zoomAt(Number(e.target.value))}
                            className="vrange"
                            aria-label="Zoom"
                          />
                        </div>
                        <div className="pop-labels">
                          <div className="pop-title">Zoom</div>
                          <div className="pop-value">{Math.round(zoom * 100)}%</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div style={{ position: "relative" }}>
                  <button
                    style={colorBtn()}
                    onClick={() => setActivePopout(activePopout === "color" ? null : "color")}
                    title="Color"
                  >
                    <div style={colorDot(color)} />
                  </button>
                  {activePopout === "color" && (
                    <div className="pop-card" style={popout(0)}>
                      <span className="pop-title">Color</span>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 22px)", gap: 6 }}>
                        {[
                          "#ff2d55",
                          "#10b981",
                          "#0d8dea",
                          "#f59e0b",
                          "#ef4444",
                          "#a855f7",
                          "#111827",
                          "#ffffff",
                        ].map((c) => (
                          <button
                            key={c}
                            onClick={() => setColor(c)}
                            style={{
                              width: 22,
                              height: 22,
                              borderRadius: 6,
                              border: "1px solid rgba(255,255,255,.25)",
                              background: c,
                              cursor: "pointer",
                              boxShadow: c === color ? "0 0 0 2px #10b981 inset" : "none",
                            }}
                            aria-label={`Color ${c}`}
                          />
                        ))}
                      </div>
                      <input
                        type="color"
                        value={color}
                        onChange={(e) => setColor(e.target.value)}
                        style={{ width: 28, height: 28, marginTop: 6, border: "none", background: "transparent" }}
                        aria-label="Custom color"
                      />
                    </div>
                  )}
                </div>

                <button
                  style={{ ...toolBtn(false), background: "rgba(127,29,29,.65)" }}
                  onClick={deleteSelectedMarkup}
                  disabled={!selectedMarkupId}
                  title="Delete selected markup + comments (Del)"
                >
                  <IconTrash />
                </button>
              </div>
            )}
          </div>

          {imageDoc && (
            <div
              style={{
                position: "absolute",
                left: 0,
                top: 0,
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
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  width: imageDoc.width,
                  height: imageDoc.height,
                  pointerEvents: "none",
                }}
              />
            </div>
          )}
        </div>

        <div className="card" style={{ borderRadius: 0 }}>
          <div className="muted">
            {imageDoc ? `${imageDoc.name} — ${imageDoc.width}×${imageDoc.height}` : "Loading…"}
          </div>
          <Link to="/" className="dropbox" style={{ marginLeft: 0, display: "inline-block", marginTop: 8 }}>
            ← Home
          </Link>
        </div>
      </div>

      {/* Right */}
      <aside className="right">
        <div className="card" style={{ borderRadius: 0 }}>
          <h2 style={{ marginBottom: 8 }}>Comments</h2>
          <div className="muted" style={{ marginBottom: 8 }}>
            Enter = <b>add comment</b> • Shift+Enter = <b>newline</b>. Select a markup first.
          </div>

          <select value={selectedMarkupId || ""} onChange={(e) => onSelectMarkup(e.target.value)} className="select">
            <option value="">Choose a markup…</option>
            {[...serverStrokes, ...localStrokes].map((m, idx) => (
              <option key={m.id} value={m.id}>
                #{idx + 1} — {m.color} — {m.size || 0}px
              </option>
            ))}
          </select>

          <textarea
            ref={commentBoxRef}
            rows={3}
            placeholder="Write a comment… (URLs auto-link)"
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

          <input
            type="url"
            placeholder="Link (optional, e.g. https://example.com)"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            className="input"
            style={{ marginTop: 6 }}
            aria-label="Optional link"
          />

          <div className="ref-row">
            <input id="refPick" type="file" accept="image/*" onChange={onPickRef} style={{ display: "none" }} />
            <button onClick={() => document.getElementById("refPick").click()}>
              {refFile ? "Change Reference Image" : "Attach Reference Image"}
            </button>
            {refFile && <button className="danger" onClick={clearRef}>Remove</button>}
          </div>

          {refPreview && (
            <div className="ref-preview">
              <img src={refPreview} alt="Reference preview" className="ref-thumb" />
            </div>
          )}

          <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
            <button
              onClick={addComment}
              disabled={!selectedMarkupId || (!commentText.trim() && !linkUrl && !refFile)}
              title="Enter = add • Shift+Enter = newline"
            >
              Add Comment
            </button>
            <button
              onClick={() => {
                setCommentText("");
                setLinkUrl("");
                clearRef();
              }}
            >
              Clear
            </button>
          </div>
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
                  ref={(el) => {
                    if (el) commentRefs.current[c.id] = el;
                    else delete commentRefs.current[c.id];
                  }}
                  className={`comment ${isActive ? "active" : ""}`}
                  onClick={() => {
                    setSelectedCommentId(c.id);
                    setSelectedMarkupId(c.markupId);
                  }}
                >
                  <div className="comment-head" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div className="comment-link" style={{ flex: 1 }}>
                      Linked to markup #{idx >= 0 ? idx + 1 : "?"}
                    </div>
                    <button
                      className="icon danger"
                      title="Delete comment (optionally also delete its markup)"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteComment(c.id, c.markupId);
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                        <path d="M10 11v6M14 11v6" />
                        <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                      </svg>
                    </button>
                  </div>
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
                </div>
              );
            })
          )}
        </div>

        <div className="card" style={{ borderRadius: 0 }}>
          <Link to="/" className="dropbox">
            ← Back to Home
          </Link>
        </div>
      </aside>

      {/* Tiny toast */}
      {notice && (
        <div
          className={`toast ${notice.type}`}
          role="status"
          aria-live="polite"
          style={{ position: "fixed", right: 16, bottom: 16 }}
        >
          {notice.msg}
        </div>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────
   Help / Instructions
──────────────────────────────────────────────────────────────── */
function Help() {
  return (
    <main className="wrap" style={{ height: "100%", overflow: "auto" }}>
      <section className="card">
        <h2>How to use retouchRoom</h2>
        <ol style={{ lineHeight: 1.6 }}>
          <li>
            <b>Create a project</b> — name it, optionally paste a Dropbox File Request link, click{" "}
            <b>Add Project</b>.
          </li>
          <li>
            <b>Open the project</b> — click <b>Open</b>.
          </li>
          <li>
            <b>Create a folder (round)</b> — name it (date or “Round 1”) and click <b>+ Create Folder</b>.
          </li>
          <li>
            <b>Upload images</b> — drag files into the dashed box or click <b>Browse files</b>.
          </li>
          <li>
            <b>Open Markup</b> — click <b>Open Markup</b> to annotate.
          </li>
          <li>
            <b>Toolbox</b> — click the toolbox icon (or press <b>T</b>) to open/close tools. Pop-outs: Pencil size,
            Zoom, and Color.
          </li>
          <li>
            <b>Delete</b> — trash in the bar deletes the selected markup (with all its comments). Deleting a comment
            will ask if you also want to delete its linked markup.
          </li>
          <li>
            <b>Comments</b> — Enter adds a comment; Shift+Enter inserts a newline. Select a markup first.
          </li>
        </ol>
        <Link to="/" className="dropbox">
          ← Back to Home
        </Link>
      </section>
    </main>
  );
}
