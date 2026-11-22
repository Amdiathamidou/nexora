import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Eraser,
  KeyRound,
  PenTool,
  ShieldAlert,
  Stamp,
  Upload,
  UserCircle,
} from 'lucide-react';
import { apiFetch } from '../api/client.ts';
import { useAuth } from '../context/AuthContext.tsx';

interface UserProfileResponse {
  profile: {
    id: string;
    companyId: string | null;
    fullName: string;
    jobTitle: string;
    email: string;
    phone: string;
    role: string;
    avatarUrl: string;
    signatureImage: string;
    stampImage: string;
    companyStampImage: string;
    companyTradeName: string;
    createdAt: string;
    services: Array<{ id: string; name: string; is_secretariat: number }>;
  };
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function generateOfficialStampSvgDataUrl(orgName: string, title: string, city: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220" viewBox="0 0 220 220">
  <circle cx="110" cy="110" r="98" fill="none" stroke="#1e3a8a" stroke-width="5"/>
  <circle cx="110" cy="110" r="88" fill="none" stroke="#1e3a8a" stroke-width="1.5" stroke-dasharray="4 3"/>
  <circle cx="110" cy="110" r="56" fill="none" stroke="#1e3a8a" stroke-width="2"/>
  <text x="110" y="54" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" font-weight="bold" fill="#1e3a8a">${escapeXml(orgName.slice(0, 24).toUpperCase())}</text>
  <text x="110" y="106" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" font-weight="bold" fill="#1e3a8a">${escapeXml(title.slice(0, 22).toUpperCase())}</text>
  <text x="110" y="124" text-anchor="middle" font-family="Arial, sans-serif" font-size="10" font-weight="bold" fill="#1e3a8a">VISA OFFICIEL</text>
  <text x="110" y="176" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" font-weight="bold" fill="#1e3a8a">${escapeXml(city.slice(0, 22).toUpperCase())}</text>
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

async function readImageFileAsDataUrl(file: File, maxDim = 480, asJpeg = false): Promise<string> {
  if (file.type === 'image/svg+xml') {
    const text = await file.text();
    return `data:image/svg+xml;utf8,${encodeURIComponent(text)}`;
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(String(reader.result));
          return;
        }
        if (asJpeg) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, w, h);
        }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(asJpeg ? canvas.toDataURL('image/jpeg', 0.88) : canvas.toDataURL('image/png'));
      };
      img.onerror = () => reject(new Error('Image illisible.'));
      img.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error('Impossible de lire le fichier image.'));
    reader.readAsDataURL(file);
  });
}

export function ProfilePage() {
  const { refreshSession } = useAuth();
  const [profile, setProfile] = useState<UserProfileResponse['profile'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');

  // Form states
  const [fullName, setFullName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [phone, setPhone] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [signatureImage, setSignatureImage] = useState('');
  const [stampImage, setStampImage] = useState('');
  const [applyAsCompanyStamp, setApplyAsCompanyStamp] = useState(true);

  // Stamp generator fields
  const [stampOrg, setStampOrg] = useState('');
  const [stampTitle, setStampTitle] = useState('');
  const [stampCity, setStampCity] = useState('Cotonou - Bénin');

  // Password form
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Signature canvas pad
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);
  const [hasCanvasStrokes, setHasCanvasStrokes] = useState(false);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<UserProfileResponse>('/api/profile');
      setProfile(res.profile);
      setFullName(res.profile.fullName);
      setJobTitle(res.profile.jobTitle);
      setPhone(res.profile.phone);
      setAvatarUrl(res.profile.avatarUrl);
      setSignatureImage(res.profile.signatureImage);
      setStampImage(res.profile.stampImage || res.profile.companyStampImage || '');
      setStampOrg(res.profile.companyTradeName || 'NEXORA');
      setStampTitle(res.profile.jobTitle || res.profile.role);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur lors du chargement du profil');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const getPointerPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const startDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.setPointerCapture(e.pointerId);
    const pos = getPointerPos(e);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    isDrawingRef.current = true;
    setHasCanvasStrokes(true);
  };

  const moveDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    const pos = getPointerPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  };

  const endDraw = () => {
    isDrawingRef.current = false;
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
    setHasCanvasStrokes(false);
  };

  const captureCanvasToSignature = () => {
    if (!canvasRef.current || !hasCanvasStrokes) {
      setError('Veuillez tracer votre signature dans le cadre avant de la capturer.');
      return;
    }
    const dataUrl = canvasRef.current.toDataURL('image/png');
    setSignatureImage(dataUrl);
    setError('');
    setFeedback('Signature tracée capturée. Cliquez sur "Enregistrer signature & cachet" pour la sauvegarder.');
  };

  const handleSaveIdentity = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setFeedback('');
    try {
      const res = await apiFetch<{ message: string }>('/api/profile', {
        method: 'PATCH',
        body: JSON.stringify({ fullName, jobTitle, phone, avatarUrl }),
      });
      setFeedback(res.message);
      await refreshSession();
      await loadProfile();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSignAssets = async () => {
    setSaving(true);
    setError('');
    setFeedback('');
    try {
      await apiFetch('/api/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          avatarUrl,
          signatureImage,
          stampImage,
          applyAsCompanyStamp,
        }),
      });
      setFeedback('Signature numérique, photo de profil et image du cachet enregistrées dans votre profil.');
      await refreshSession();
      await loadProfile();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur sauvegarde signature');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setFeedback('');
    if (newPassword !== confirmPassword) {
      setError('La confirmation du nouveau mot de passe ne correspond pas.');
      return;
    }
    try {
      const res = await apiFetch<{ message: string }>('/api/profile/password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setFeedback(res.message);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur changement mot de passe');
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setFeedback('');
    try {
      const url = await readImageFileAsDataUrl(file, 360, true);
      setAvatarUrl(url);
      await apiFetch('/api/profile', {
        method: 'PATCH',
        body: JSON.stringify({ avatarUrl: url }),
      });
      await refreshSession();
      setFeedback('Photo de profil mise à jour et enregistrée.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur photo');
    }
  };

  const handleSignatureUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const url = await readImageFileAsDataUrl(file, 480);
      setSignatureImage(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur image signature');
    }
  };

  const handleStampUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const url = await readImageFileAsDataUrl(file, 420);
      setStampImage(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur image cachet');
    }
  };

  if (loading) return <div className="p-8 text-sm text-slate-500">Chargement de votre profil...</div>;
  if (!profile) return <div className="p-6 text-sm text-red-600">{error || 'Profil introuvable'}</div>;

  const isPresidentOrAdmin = profile.role === 'PRESIDENT' || profile.role === 'ADMIN';

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            Mon profil, Signature numérique &amp; Cachet officiel
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Modifiez vos informations personnelles, votre mot de passe et configurez votre signature numérique et cachet pour la validation des courriers.
          </p>
        </div>
        <div className="text-xs font-mono text-slate-500">
          Rôle : <span className="font-bold text-slate-900 dark:text-white">{profile.role}</span>
        </div>
      </div>

      {feedback && (
        <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-sm text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}
      {error && (
        <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Personal Info & Password */}
        <div className="lg:col-span-5 space-y-6">
          <form
            onSubmit={handleSaveIdentity}
            className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-5"
          >
            <h2 className="font-display text-base font-bold flex items-center gap-2">
              <UserCircle className="w-4 h-4 text-blue-600" />
              <span>Informations personnelles</span>
            </h2>

            <div className="flex items-center gap-4">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={fullName}
                  className="w-16 h-16 rounded-full object-cover border border-slate-200 dark:border-slate-700"
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-lg font-bold text-slate-500">
                  {fullName.slice(0, 2).toUpperCase()}
                </div>
              )}
              <div>
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Changer la photo</span>
                  <input type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
                </label>
                <p className="text-[11px] text-slate-500 mt-1">PNG ou JPG (redimensionné automatiquement)</p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1">Nom complet</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Fonction / Poste</label>
                <input
                  type="text"
                  required
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Téléphone</label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+229 ..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Adresse e-mail (identifiant)</label>
                <input
                  type="email"
                  disabled
                  value={profile.email}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-sm text-slate-500"
                />
              </div>
              {profile.services.length > 0 && (
                <div>
                  <label className="block text-xs font-medium mb-1">Départements rattachés</label>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    {profile.services.map((s) => s.name).join(' · ')}
                  </p>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-slate-900 dark:bg-blue-600 text-white text-xs font-semibold disabled:opacity-60"
            >
              Enregistrer mes informations
            </button>
          </form>

          {/* Password form */}
          <form
            onSubmit={handleChangePassword}
            className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4"
          >
            <h2 className="font-display text-base font-bold flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-slate-600 dark:text-slate-300" />
              <span>Sécurité &amp; Mot de passe</span>
            </h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1">Mot de passe actuel</label>
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Nouveau mot de passe (min. 8 caractères)</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Confirmer le nouveau mot de passe</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                />
              </div>
            </div>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Mettre à jour le mot de passe
            </button>
          </form>
        </div>

        {/* Right: Digital Signature & Official Stamp */}
        <div className="lg:col-span-7 space-y-6">
          <section className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-6">
            <div>
              <h2 className="font-display text-base font-bold flex items-center gap-2">
                <PenTool className="w-4 h-4 text-blue-600" />
                <span>Signature numérique &amp; Cachet officiel</span>
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                {profile.role === 'PRESIDENT'
                  ? 'En tant que Président, votre signature numérique et l’image de votre cachet officiel sont apposées automatiquement lors de vos validations de courriers.'
                  : 'Configurez votre signature manuscrite numérisée et, si applicable, votre cachet de service.'}
              </p>
            </div>

            {/* Canvas Signature Pad */}
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold">1. Tracer une signature manuscrite numérique</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={clearCanvas}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 text-xs"
                  >
                    <Eraser className="w-3.5 h-3.5" />
                    <span>Effacer</span>
                  </button>
                  <button
                    type="button"
                    onClick={captureCanvasToSignature}
                    className="px-3 py-1 rounded-lg bg-slate-900 dark:bg-blue-600 text-white text-xs font-semibold"
                  >
                    Utiliser ce tracé
                  </button>
                  <label className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 text-xs cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Importer PNG/SVG</span>
                    <input type="file" accept="image/*" onChange={handleSignatureUpload} className="hidden" />
                  </label>
                </div>
              </div>

              <div className="rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-700 bg-white overflow-hidden">
                <canvas
                  ref={canvasRef}
                  width={560}
                  height={160}
                  onPointerDown={startDraw}
                  onPointerMove={moveDraw}
                  onPointerUp={endDraw}
                  onPointerCancel={endDraw}
                  className="w-full h-36 touch-none cursor-crosshair block"
                />
              </div>

              {signatureImage && (
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                      Aperçu de la signature enregistrée
                    </p>
                    <img
                      src={signatureImage}
                      alt="Signature numérique"
                      className="h-16 mt-1.5 bg-white rounded border border-slate-200 p-1 object-contain"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setSignatureImage('')}
                    className="text-xs text-red-600 hover:underline"
                  >
                    Retirer
                  </button>
                </div>
              )}
            </div>

            {/* Official Stamp Section */}
            <div className="pt-5 border-t border-slate-200 dark:border-slate-800 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold flex items-center gap-1.5">
                  <Stamp className="w-4 h-4 text-indigo-600" />
                  <span>2. Image du cachet officiel (Tampon / Visa)</span>
                </span>
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Importer une image du cachet</span>
                  <input type="file" accept="image/*" onChange={handleStampUpload} className="hidden" />
                </label>
              </div>

              {/* Vector Stamp Generator */}
              <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50 space-y-3">
                <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Ou générer un cachet officiel vectoriel prêt à l’emploi :
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    type="text"
                    value={stampOrg}
                    onChange={(e) => setStampOrg(e.target.value)}
                    placeholder="Organisation"
                    className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                  />
                  <input
                    type="text"
                    value={stampTitle}
                    onChange={(e) => setStampTitle(e.target.value)}
                    placeholder="Titre (ex: PRÉSIDENT DG)"
                    className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                  />
                  <input
                    type="text"
                    value={stampCity}
                    onChange={(e) => setStampCity(e.target.value)}
                    placeholder="Ville"
                    className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                  />
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setStampImage(
                      generateOfficialStampSvgDataUrl(
                        stampOrg || profile.companyTradeName,
                        stampTitle || profile.jobTitle,
                        stampCity || 'Cotonou'
                      )
                    )
                  }
                  className="px-3 py-1.5 rounded-lg border border-indigo-600 text-indigo-700 dark:text-indigo-400 text-xs font-semibold hover:bg-indigo-50 dark:hover:bg-indigo-950/30"
                >
                  Générer l’image du cachet officiel
                </button>
              </div>

              {stampImage && (
                <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <img
                      src={stampImage}
                      alt="Cachet officiel"
                      className="w-24 h-24 rounded-lg bg-white border border-slate-200 p-1 object-contain"
                    />
                    <div className="text-xs space-y-1">
                      <p className="font-semibold text-slate-900 dark:text-white">Cachet officiel actif</p>
                      <p className="text-slate-500">Sera apposé à côté de votre signature numérique lors des validations.</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setStampImage('')}
                    className="text-xs text-red-600 hover:underline"
                  >
                    Retirer
                  </button>
                </div>
              )}

              {isPresidentOrAdmin && (
                <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={applyAsCompanyStamp}
                    onChange={(e) => setApplyAsCompanyStamp(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  <span>Définir également cette image comme cachet officiel de l’entreprise</span>
                </label>
              )}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                disabled={saving}
                onClick={handleSaveSignAssets}
                className="px-5 py-2.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-500 disabled:opacity-60"
              >
                Enregistrer signature &amp; cachet dans mon profil
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
