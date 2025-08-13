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
  getDoc,
} from "firebase/firestore";

/* ---------------------- Shared Login (no Firebase Auth) ---------------------- */
const AUTH_KEY = "rr_auth_v1";
const SHARED_USER = import.meta.env.VITE_SHARED_USERNAME || "Markup";
const SHARED_PASS = import.meta.env.VITE_SHARED_PASSWORD || "1234567";

const AuthCtx = createContext(null);
function useAuth() { return useContext(AuthCtx); }

function AuthProvider({ children }) {
  const [state, setState] = useState(() => {
    try { const raw = localStorage.getItem(AUTH_KEY); return raw ? JSON.parse(raw) : { ok:false, u:null }; }
    catch { return { ok:false, u:null }; }
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
  const logout = () => { localStorage.removeItem(AUTH_KEY); setState({ ok:false, u:null }); };

  return <AuthCtx.Provider value={{ authed: state.ok, user: state.u, login, logout }}>{children}</AuthCtx.Provider>;
}

function Protected({ children }) {
  const { authed } = useAuth();
  if (!authed) return <Navigate to="/login" replace />;
  return children;
}

/* ------------------------------- Small helpers ------------------------------- */
const isoDate = (d = new Date()) => d.toISOString().slice(0, 10);
const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || "dwcgdkoxd";
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || "retouch-markup";
const CLOUD_ROOT = import.meta.env.VITE_CLOUDINARY_FOLDER || "retouch";

/* ------------------------------------ App ----------------------------------- */
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

/* ---------------------------------- Layout ---------------------------------- */
function Shell({ children }) {
  const { logout } = useAuth();
  return (
    <div style={{ display:"flex", flexDirection:"column", minHeight:"100vh" }}>
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
      <div style={{ flex:1, minHeight:0 }}>{children}</div>
    </div>
  );
}

/* --------------------------------- /login ----------------------------------- */
function LoginPage() {
  const { authed, login } = useAuth();
  const navigate = useNavigate();
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => { if (authed) navigate("/", { replace:true }); }, [authed, navigate]);

  const submit = (e) => {
    e.preventDefault();
    setErr("");
    const ok = login(u.trim(), p);
    if (!ok) setErr("Wrong username or password.");
  };

  return (
    <div style={{ display:"grid", placeItems:"center", minHeight:"100vh", background:"#0b0f17" }}>
      <form onSubmit={submit} className="card" style={{ width:360 }}>
        <h2 style={{ marginBottom:8 }}>Retouch Room — Markups</h2>
        <div className="muted" style={{ marginBottom:12 }}>Enter the shared credentials.</div>
        <input placeholder="Username" value={u} onChange={(e)=>setU(e.target.value)} />
        <input type="password" placeholder="Password" value={p} onChange={(e)=>setP(e.target.value)} />
        {err && <div className="muted" style={{ color:"#ef4444" }}>{err}</div>}
        <button type="submit" style={{ marginTop:8, width:"100%" }}>Enter</button>
      </form>
    </div>
  );
}

/* ------------------------- Home: Projects / Folders / Images ------------------------- */
function Home() {
  const { user } = useAuth(); // simple client tag
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

  // Live projects (filter by client tag in JS so no Firestore index needed)
  useEffect(() => {
    const stop = onSnapshot(query(collection(db, "projects")), (snap) => {
      const all = snap.docs.map((d) => ({ id:d.id, ...d.data() }));
      const mine = all.filter((p) => !p.client || p.client === user)
                      .sort((a,b) => (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0));
      setProjects(mine);
      if (activeProjectId && !mine.find(p => p.id === activeProjectId)) {
        setActiveProjectId(null); setActiveFolderId(null);
      }
    });
    return () => stop();
    // eslint-disable-next-line
  }, [user, activeProjectId]);

  // Live folders
  useEffect(() => {
    setFolders([]); setActiveFolderId(null);
    if (!activeProjectId) return;
    const stop = onSnapshot(query(collection(db, "projects", activeProjectId, "folders")), (snap) => {
      const list = snap.docs.map((d) => ({ id:d.id, ...d.data() }))
        .sort((a,b) => (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0));
      setFolders(list);
    });
    return () => stop();
  }, [activeProjectId]);

  // Live images
  useEffect(() => {
    setImages([]);
    if (!activeProjectId || !activeFolderId) return;
    const stop = onSnapshot(query(collection(db, "projects", activeProjectId, "folders", activeFolderId, "images")), (snap) => {
      const list = snap.docs.map((d) => ({ id:d.id, ...d.data() }))
        .sort((a,b) => (b.uploadedAt?.seconds||0) - (a.uploadedAt?.seconds||0));
      setImages(list);
    });
    return () => stop();
  }, [activeProjectId, activeFolderId]);

  const resetToProjects = () => { setActiveFolderId(null); setActiveProjectId(null); };

  const createProject = async () => {
    const name = projectName.trim();
    if (!name) return;
    try {
      const payload = { name, dropbox: dropboxLink.trim() || null, client: user, createdAt: serverTimestamp() };
      const ref = await addDoc(collection(db, "projects"), payload);
      // optimistic add so it appears instantly
      setProjects(prev => [{ id:ref.id, ...payload, createdAt:{ seconds: Math.floor(Date.now()/1000) } }, ...prev]);
      setProjectName(""); setDropboxLink("");
      showToast("Project created ✅");
    } catch (e) { console.error(e); alert("Failed to create project."); }
  };

  const deleteProject = async (pid) => {
    const ok = window.confirm("Are you sure you want to delete this project?");
    if (!ok) return;
    try { await deleteDoc(doc(db, "projects", pid)); if (pid===activeProjectId){ setActiveProjectId(null); setActiveFolderId(null);} }
    catch { alert("Failed to delete project."); }
  };

  // Create Round N — YYYY-MM-DD (don’t auto-open)
  const createNextRound = async () => {
    if (!activeProjectId) return alert("Select a project first.");
    try {
      setFolderCreating(true);
      const count = folders.filter(f => /^Round\s+\d+/i.test(f.name||"")).length;
      const name = `Round ${count + 1} — ${isoDate()}`;
      await addDoc(collection(db, "projects", activeProjectId, "folders"), { name, createdAt: serverTimestamp() });
      showToast(`Created ${name} ✅`);
    } catch (e) { console.error(e); alert("Failed to create round."); }
    finally { setFolderCreating(false); }
  };

  const renameFolder = async (fid, name) => {
    try { await setDoc(doc(db, "projects", activeProjectId, "folders", fid), { name }, { merge:true }); showToast("Folder renamed ✅"); }
    catch { alert("Rename failed."); }
  };

  /* ------------------- Drag & Drop Upload wiring (fixed) ------------------- */
  const fileInputRef = useRef(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const handleUpload = async (fileList) => {
    if (!activeProjectId || !activeFolderId) return alert("Select a project and folder first.");
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const folderLabel = folders.find((f)=>f.id===activeFolderId)?.name || "unnamed";

    setIsUploading(true);
    try {
      for (const file of files) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("upload_preset", UPLOAD_PRESET);
        fd.append("folder", `${CLOUD_ROOT}/${activeProjectId}/${folderLabel}`);

        const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method:"POST", body: fd });
        const data = await res.json();
        if (!res.ok) { showToast(data?.error?.message || "Upload failed", "err"); continue; }

        await addDoc(collection(db, "projects", activeProjectId, "folders", activeFolderId, "images"), {
          url: data.secure_url,
          publicId: data.public_id,
          width: data.width, height: data.height,
          name: file.name,
          uploadedAt: serverTimestamp(),
        });
      }
      showToast(`Uploaded ${files.length} file(s) ✅`);
    } finally { setIsUploading(false); }
  };

  const onDragEnter = (e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); };
  const onDragOver  = (e) => { e.preventDefault(); e.stopPropagation(); };
  const onDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); if (e.currentTarget === e.target) setIsDragging(false); };
  const onDrop      = (e) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(false);
    const files = e.dataTransfer?.files; if (files?.length) handleUpload(files);
  };

  /* ------------------------------- Render -------------------------------- */
  const activeProject = useMemo(() => projects.find(p=>p.id===activeProjectId) || null, [projects, activeProjectId]);
  const activeFolder  = useMemo(() => folders.find(f=>f.id===activeFolderId) || null, [folders, activeFolderId]);

  return (
    <main className="wrap" style={{ height:"100%", overflow:"auto" }}>
      {/* Breadcrumbs */}
      <div className="card" style={{ marginBottom:12 }}>
        <div className="crumbs">
          {!activeProject ? (
            <span className="crumb-text">Projects</span>
          ) : (
            <button className="linkish" onClick={resetToProjects}>Projects</button>
          )}
          {activeProject && (<><span className="crumb-sep">›</span><button className="linkish" onClick={()=>setActiveFolderId(null)}>{activeProject.name}</button></>)}
          {activeProject && activeFolder && (<><span className="crumb-sep">›</span><span>{activeFolder.name}</span></>)}
        </div>
      </div>

      {/* Create Project */}
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
                <div key={p.id} className="project" onClick={() => setActiveProjectId(p.id)} style={{ cursor:"pointer" }}>
                  <div className="project-name">{p.name}</div>
                  {p.dropbox && <a href={p.dropbox} target="_blank" rel="noreferrer" className="dropbox" onClick={(e)=>e.stopPropagation()}>Dropbox link</a>}
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
            <div className="row" style={{ marginTop:8 }}>
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
              onDragEnter={onDragEnter}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
            >
              <p><strong>Drag & drop</strong> images here</p>
              <p className="muted">or</p>
              <button onClick={() => fileInputRef.current?.click()} disabled={isUploading}>Browse files</button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/png,image/jpeg,image/webp"
                style={{ display:"none" }}
                onChange={(e) => handleUpload(e.target.files)}
              />
              <small className="muted" style={{ display:"block", marginTop:8 }}>
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
              <div className="muted" style={{ marginTop:12 }}>No images yet for this folder.</div>
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
  const save = () => {
    const name = val.trim(); if (!name) return;
    onRename(name); setEditing(false);
  };
  return (
    <div className="project" onClick={() => !editing && onOpen()} style={{ cursor:"pointer" }}>
      {!editing ? (
        <div className="project-name">📁 {folder.name}</div>
      ) : (
        <input value={val} onChange={(e)=>setVal(e.target.value)} onClick={(e)=>e.stopPropagation()}
               onKeyDown={(e)=>{ if(e.key==="Enter") save(); if(e.key==="Escape") setEditing(false); }} />
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

/* ----------------------------------- Help ----------------------------------- */
function Help() {
  return (
    <main className="wrap" style={{ height:"100%", overflow:"auto" }}>
      <section className="card">
        <h2>Help</h2>
        <ol style={{ lineHeight:1.6 }}>
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

/* ------------------------------- Minimal Viewer ------------------------------ */
function ImageViewer() {
  const { projectId, folderId, imageId } = useParams();
  const navigate = useNavigate();
  const [imageDoc, setImageDoc] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const dref = doc(db, "projects", projectId, "folders", folderId, "images", imageId);
        const snap = await getDoc(dref);
        if (!snap.exists()) { alert("Image not found"); navigate("/"); }
        else { setImageDoc({ id: snap.id, ...snap.data() }); }
      } catch { alert("Failed to load image"); navigate("/"); }
    })();
  }, [projectId, folderId, imageId, navigate]);

  return (
    <div className="viewer">
      <div className="left">
        <div className="card" style={{ borderRadius:0 }}>
          <div className="muted">{imageDoc ? `${imageDoc.name} — ${imageDoc.width}×${imageDoc.height}` : "Loading…"}</div>
          <Link to="/" className="dropbox" style={{ marginLeft:0, display:"inline-block", marginTop:8 }}>← Home</Link>
        </div>
      </div>
      <aside className="right">
        <div className="card" style={{ borderRadius:0 }}>
          <h2>Comments</h2>
          <div className="muted">Viewer stub (routing verified). We can re-add full markup tools next.</div>
          <Link to="/" className="dropbox">← Back to Home</Link>
        </div>
      </aside>
    </div>
  );
}
