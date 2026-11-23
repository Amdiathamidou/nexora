import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  FileText,
  FileUp,
  Loader2,
  RotateCw,
  ScanLine,
  Sparkles,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { motion } from 'motion/react';
import { apiFetch, uploadFileWithProgress } from '../api/client.ts';
import type { AppPage } from '../components/common/AppShell.tsx';
import type { AiExtractionPayload, CircuitItem, MailDirection, MailPriority, ServiceItem } from '../types/nexora.ts';

interface UploadedFileInfo {
  fileId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  storedFilename: string;
}

interface DuplicateMatch {
  id: string;
  reference: string;
  subject: string;
  sender_name: string;
  external_ref: string;
  mail_date: string;
  reason: string;
}

export const DOCUMENT_NATURE_OPTIONS = [
  { value: 'lettre', label: '📄 Lettre administrative / Demande' },
  { value: 'note', label: '📝 Note de service / Information' },
  { value: 'rapport', label: '📊 Rapport d’activité / Compte-rendu' },
  { value: 'facture', label: '💰 Facture / Bordereau financier' },
  { value: 'convocation', label: '📋 Convocation / Invitation' },
  { value: 'memo', label: '📌 Mémo / Mémorandum' },
  { value: 'circulaire', label: '📢 Circulaire administrative' },
  { value: 'instruction', label: '📜 Instruction / Décision' },
  { value: 'contrat', label: '🗂️ Contrat / Convention' },
  { value: 'autre', label: '📦 Autre document' },
];

export function normalizeDocumentNature(raw?: string): string {
  const s = (raw || '').toLowerCase().trim();
  if (!s) return 'lettre';
  if (s.includes('lettre') || s.includes('demande') || s.includes('courrier') || s.includes('requete') || s.includes('requête') || s.includes('autorisation')) return 'lettre';
  if (s.includes('note')) return 'note';
  if (s.includes('rapport') || s.includes('compte-rendu') || s.includes('bilan')) return 'rapport';
  if (s.includes('facture') || s.includes('paiement') || s.includes('bordereau') || s.includes('devis')) return 'facture';
  if (s.includes('convocation') || s.includes('invitation')) return 'convocation';
  if (s.includes('memo') || s.includes('mémorandum') || s.includes('memorandum')) return 'memo';
  if (s.includes('circulaire')) return 'circulaire';
  if (s.includes('instruction') || s.includes('decision') || s.includes('décision') || s.includes('arrete') || s.includes('arrêté')) return 'instruction';
  if (s.includes('contrat') || s.includes('convention') || s.includes('accord')) return 'contrat';
  return 'autre';
}

interface UserOption {
  id: string;
  full_name: string;
  role: string;
  services: Array<{ service_id: string; service_name: string }>;
}

interface MailCreateAIPageProps {
  onNavigate: (page: AppPage, mailId?: string) => void;
}

export function MailCreateAIPage({ onNavigate }: MailCreateAIPageProps) {
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [circuits, setCircuits] = useState<CircuitItem[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);

  const [uploadedFile, setUploadedFile] = useState<UploadedFileInfo | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewMimeType, setPreviewMimeType] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const scanTimerRef = useRef<number | null>(null);
  const [aiError, setAiError] = useState('');
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<AiExtractionPayload | null>(null);
  const [aiInitialSnapshot, setAiInitialSnapshot] = useState<Record<string, string>>({});
  const [duplicates, setDuplicates] = useState<DuplicateMatch[]>([]);
  const [duplicateConfirmed, setDuplicateConfirmed] = useState(false);

  // Left preview viewer controls
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const pdfContainerRef = useRef<HTMLDivElement>(null);
  const originalFileRef = useRef<File | null>(null);

  // Registration form
  const [form, setForm] = useState({
    direction: 'ENTRANT' as MailDirection,
    category: 'lettre',
    subject: '',
    description: '',
    senderName: '',
    senderOrg: '',
    recipientName: '',
    recipientOrg: '',
    externalRef: '',
    mailDate: new Date().toISOString().slice(0, 10),
    dueDate: '',
    priority: 'NORMALE' as MailPriority,
    isConfidential: false,
    requiresResponse: false,
    currentServiceId: '',
    assignedAgentId: '',
    circuitId: '',
  });

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    Promise.all([
      apiFetch<{ services: ServiceItem[] }>('/api/services'),
      apiFetch<{ circuits: CircuitItem[] }>('/api/circuits'),
      apiFetch<{ users: UserOption[] }>('/api/users'),
    ])
      .then(([sData, cData, uData]) => {
        setServices(sData.services);
        setCircuits(cData.circuits);
        setUsers(uData.users);
        const sec = sData.services.find((s) => s.is_secretariat === 1);
        const defaultCir = cData.circuits.find((c) => c.mail_direction === 'ENTRANT');
        setForm((prev) => ({
          ...prev,
          currentServiceId: prev.currentServiceId || sec?.id || '',
          circuitId: prev.circuitId || defaultCir?.id || '',
        }));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    return () => {
      if (scanTimerRef.current !== null) {
        window.clearInterval(scanTimerRef.current);
      }
    };
  }, []);

  const stopScanTimer = () => {
    if (scanTimerRef.current !== null) {
      window.clearInterval(scanTimerRef.current);
      scanTimerRef.current = null;
    }
  };

  const getScanStageLabel = (pct: number): string => {
    if (pct <= 25) return 'Téléversement et vérification du document...';
    if (pct <= 48) return 'Numérisation optique (OCR) des pages...';
    if (pct <= 72) return 'Extraction des entités (expéditeur, objet, dates, références)...';
    if (pct <= 90) return 'Génération des résumés & recherche de doublons...';
    if (pct < 100) return 'Finalisation du préremplissage et suggestion de circuit...';
    return 'Scan OCR et extraction terminés à 100 %';
  };

  const renderPdfToContainer = async (
    file: File,
    scale = 1.0,
    rotationDeg = 0
  ): Promise<{ text: string; page1Base64?: string }> => {
    const container = pdfContainerRef.current;
    if (!container) return { text: '' };
    container.innerHTML = '';
    const w = window as unknown as { pdfjsLib?: { getDocument: (opts: unknown) => { promise: Promise<any> } } };
    if (!w.pdfjsLib) return { text: '' };

    try {
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = w.pdfjsLib.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;
      let fullText = '';
      let page1Base64 = '';

      const containerWidth = Math.max(300, (container.clientWidth || 500) - 24);

      for (let pageNum = 1; pageNum <= Math.min(pdf.numPages, 10); pageNum++) {
        const page = await pdf.getPage(pageNum);
        const baseViewport = page.getViewport({ scale: 1, rotation: rotationDeg });
        const fitScale = (containerWidth / baseViewport.width) * scale;
        const viewport = page.getViewport({ scale: fitScale, rotation: rotationDeg });

        const pageWrapper = document.createElement('div');
        pageWrapper.className = 'relative mb-4 bg-white shadow-lg rounded overflow-hidden border border-slate-200 dark:border-slate-700';
        pageWrapper.style.width = `${viewport.width}px`;
        pageWrapper.style.height = `${viewport.height}px`;

        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.display = 'block';
        const ctx = canvas.getContext('2d');
        if (ctx) {
          await page.render({ canvasContext: ctx, viewport }).promise;
        }

        if (pageNum === 1) {
          try {
            page1Base64 = canvas.toDataURL('image/jpeg', 0.85);
          } catch {}
        }

        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((i: any) => i.str).join(' ').trim();
        fullText += ' ' + pageText;

        pageWrapper.appendChild(canvas);
        container.appendChild(pageWrapper);
      }

      return { text: fullText.trim(), page1Base64 };
    } catch (err) {
      console.warn('[renderPdfToContainer] Erreur PDF.js :', err);
      return { text: '' };
    }
  };

  useEffect(() => {
    if (originalFileRef.current && (previewMimeType === 'application/pdf' || originalFileRef.current.name.toLowerCase().endsWith('.pdf'))) {
      renderPdfToContainer(originalFileRef.current, zoom, rotation).catch(() => {});
    }
  }, [zoom, rotation]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    originalFileRef.current = file;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const localBlobUrl = URL.createObjectURL(file);
    setPreviewUrl(localBlobUrl);
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    setPreviewMimeType(file.type || (isPdf ? 'application/pdf' : 'image/png'));
    setUploading(true);
    setScanProgress(4);
    setAiError('');
    setExtraction(null);
    setDuplicates([]);

    let clientText = '';
    let page1Img = '';

    // Rendu haute fidélité PDF.js comme dans XAMPP Nexora
    if (isPdf) {
      try {
        const rendered = await renderPdfToContainer(file, zoom, rotation);
        clientText = rendered.text;
        page1Img = rendered.page1Base64 || '';
      } catch (e) {
        console.warn('Erreur rendu PDF initial :', e);
      }
    }

    try {
      const fd = new FormData();
      fd.append('file', file);
      const uploaded = await uploadFileWithProgress<UploadedFileInfo>('/api/mails/upload-file', fd, (pct) => {
        // Phase 1 accounts for 0% -> 25%
        setScanProgress(Math.max(4, Math.round(pct * 0.25)));
      });
      setUploadedFile(uploaded);
      setUploading(false);
      await runAiAnalysis(uploaded, 25, clientText, page1Img);
    } catch (err) {
      stopScanTimer();
      setScanProgress(0);
      setAiError(err instanceof Error ? err.message : 'Erreur lors du téléversement.');
    } finally {
      setUploading(false);
    }
  };

  const runAiAnalysis = async (
    fileInfo: UploadedFileInfo,
    startPct = 10,
    browserText = '',
    pageImageBase64 = ''
  ) => {
    stopScanTimer();
    setAnalyzing(true);
    setAiError('');
    setScanProgress(startPct);

    // Progression fluide pendant la réponse Groq LPU
    scanTimerRef.current = window.setInterval(() => {
      setScanProgress((prev) => {
        if (prev >= 95) return 95;
        const step = prev < 50 ? 3.5 : prev < 78 ? 2.0 : 0.8;
        return Math.min(95, Number((prev + step).toFixed(1)));
      });
    }, 120);

    try {
      const res = await apiFetch<{
        analysisId: string;
        extraction: AiExtractionPayload;
        suggestedServiceId: string;
        suggestedCircuitId: string;
        duplicates: DuplicateMatch[];
      }>('/api/ai/analyze', {
        method: 'POST',
        body: JSON.stringify({
          storedFilename: fileInfo.storedFilename,
          mimeType: fileInfo.mimeType,
          browserText: browserText || undefined,
          pageImageBase64: pageImageBase64 || undefined,
        }),
      });

      stopScanTimer();
      setScanProgress(100);
      setAnalysisId(res.analysisId);
      setExtraction(res.extraction);
      setDuplicates(res.duplicates || []);
      setDuplicateConfirmed(false);

      const cleanVal = (v: string) => (v && v !== 'Non détecté' ? v : '');
      const prefilled = {
        subject: cleanVal(res.extraction.subject),
        senderName: cleanVal(res.extraction.senderName),
        senderOrg: cleanVal(res.extraction.senderOrg),
        recipientName: cleanVal(res.extraction.recipientName),
        recipientOrg: cleanVal(res.extraction.recipientOrg),
        externalRef: cleanVal(res.extraction.externalRef),
        mailDate: /^\d{4}-\d{2}-\d{2}$/.test(res.extraction.mailDate)
          ? res.extraction.mailDate
          : form.mailDate,
        dueDate: /^\d{4}-\d{2}-\d{2}$/.test(res.extraction.deadlineMentioned)
          ? res.extraction.deadlineMentioned
          : '',
        category: normalizeDocumentNature(res.extraction.mailNature || res.extraction.category),
        description: res.extraction.shortSummary || '',
      };

      setAiInitialSnapshot(prefilled);
      setForm((prev) => ({
        ...prev,
        ...prefilled,
        priority: res.extraction.suggestedPriority || prev.priority,
        requiresResponse: Boolean(res.extraction.requiresResponse),
        currentServiceId: res.suggestedServiceId || prev.currentServiceId,
        circuitId: res.suggestedCircuitId || prev.circuitId,
      }));
    } catch (err) {
      stopScanTimer();
      setScanProgress(0);
      setAiError(err instanceof Error ? err.message : 'L’analyse IA a échoué. Vous pouvez poursuivre manuellement.');
    } finally {
      stopScanTimer();
      setAnalyzing(false);
    }
  };

  const checkManualDuplicates = async () => {
    try {
      const res = await apiFetch<{ duplicates: DuplicateMatch[] }>('/api/mails/check-duplicates', {
        method: 'POST',
        body: JSON.stringify({
          externalRef: form.externalRef,
          senderName: form.senderName,
          mailDate: form.mailDate,
          subject: form.subject,
        }),
      });
      setDuplicates(res.duplicates || []);
    } catch {
      // ignore
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError('');
    if (duplicates.length > 0 && !duplicateConfirmed) {
      setSaveError('Des doublons potentiels ont été détectés. Veuillez confirmer qu’il s’agit bien d’un nouveau courrier.');
      return;
    }

    setSaving(true);
    try {
      const corrections: Record<string, { ai: string; human: string }> = {};
      if (analysisId) {
        (Object.keys(aiInitialSnapshot) as Array<keyof typeof aiInitialSnapshot>).forEach((k) => {
          const val = String((form as Record<string, unknown>)[k] ?? '');
          if (aiInitialSnapshot[k] !== val) {
            corrections[k] = { ai: aiInitialSnapshot[k], human: val };
          }
        });
      }

      const res = await apiFetch<{ id: string; reference: string; departmentEmailsTriggered: number }>('/api/mails', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          uploadedFile,
          analysisId,
          humanCorrections: corrections,
        }),
      });
      onNavigate('mail-detail', res.id);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Erreur lors de l’enregistrement.');
    } finally {
      setSaving(false);
    }
  };

  const agents = users.filter((u) => u.role === 'AGENT');
  const directionCircuits = circuits.filter((c) => c.mail_direction === form.direction && c.is_active === 1);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            Enregistrement &amp; Analyse IA d’un courrier
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Déposez un PDF ou une image pour lancer l’analyse IA et l'OCR haute vitesse et préremplir automatiquement le formulaire. Validation humaine requise avant enregistrement officiel.
          </p>
        </div>

        <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-900 dark:bg-blue-600 text-white text-sm font-semibold cursor-pointer hover:bg-slate-800 dark:hover:bg-blue-500 whitespace-nowrap">
          <FileUp className="w-4 h-4" />
          <span>{uploading ? 'Téléversement...' : 'Importer PDF / Image'}</span>
          <input
            type="file"
            accept=".pdf,image/jpeg,image/jpg,image/png,image/webp"
            onChange={handleFileUpload}
            className="hidden"
          />
        </label>
      </div>

      {/* Split Workspace: Left Original Document | Right AI Analysis + Human Validation Form */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT ZONE: Original Document Preview */}
        <div className="lg:col-span-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate">
              {uploadedFile ? uploadedFile.filename : 'Aperçu du document original'}
            </span>
            {uploadedFile && (
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.max(0.6, Number((z - 0.2).toFixed(1))))}
                  className="p-1.5 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                  title="Dézoomer"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="font-mono text-xs px-1.5 tabular-nums">{Math.round(zoom * 100)}%</span>
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.min(2.2, Number((z + 0.2).toFixed(1))))}
                  className="p-1.5 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                  title="Zoomer"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setRotation((r) => (r + 90) % 360)}
                  className="p-1.5 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                  title="Pivoter 90°"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          <div className="relative min-h-[420px] max-h-[720px] overflow-auto bg-slate-100 dark:bg-slate-950 flex items-center justify-center p-4">
            {!previewUrl ? (
              <div className="text-center max-w-xs space-y-2">
                <FileUp className="w-10 h-10 text-slate-400 mx-auto" />
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Aucun document importé
                </p>
                <p className="text-xs text-slate-500">
                  Importez un PDF (texte ou scanné multipage) ou une photo (JPG/PNG) pour activer l’OCR, ou saisissez directement le courrier à droite.
                </p>
              </div>
            ) : (previewMimeType || uploadedFile?.mimeType) === 'application/pdf' ? (
              <div
                ref={pdfContainerRef}
                className="w-full flex flex-col items-center overflow-y-auto max-h-[640px] p-2 bg-slate-200/50 dark:bg-slate-950 rounded border border-slate-200 dark:border-slate-800"
              />
            ) : (
              <img
                src={previewUrl}
                alt="Courrier numérisé"
                style={{ transform: `scale(${zoom}) rotate(${rotation}deg)` }}
                className="max-w-full transition-transform duration-150 rounded shadow-sm"
              />
            )}

            {/* Real-time Document Laser Scanner Overlay during Upload & OCR */}
            {(uploading || analyzing) && previewUrl && (
              <div className="pointer-events-none absolute inset-0 overflow-hidden bg-slate-950/20 backdrop-blur-[1px]">
                {/* Precision Corner Reticles */}
                <div className="absolute top-3 left-3 w-5 h-5 border-t-2 border-l-2 border-blue-500" />
                <div className="absolute top-3 right-3 w-5 h-5 border-t-2 border-r-2 border-blue-500" />
                <div className="absolute bottom-3 left-3 w-5 h-5 border-b-2 border-l-2 border-blue-500" />
                <div className="absolute bottom-3 right-3 w-5 h-5 border-b-2 border-r-2 border-blue-500" />

                {/* Sweeping OCR Laser Line */}
                <motion.div
                  initial={{ top: '6%' }}
                  animate={{ top: ['6%', '92%', '6%'] }}
                  transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                  className="absolute inset-x-3 h-1 bg-gradient-to-r from-transparent via-blue-500 to-transparent shadow-[0_0_18px_4px_rgba(59,130,246,0.65)]"
                >
                  <div className="absolute inset-x-0 -top-10 h-10 bg-gradient-to-t from-blue-500/20 to-transparent" />
                </motion.div>

                {/* Live Scan HUD */}
                <div className="absolute bottom-5 left-1/2 -translate-x-1/2 px-3.5 py-2 rounded-lg bg-slate-900/90 border border-blue-500/40 text-white shadow-lg flex items-center gap-2.5 text-xs">
                  <ScanLine className="w-4 h-4 text-blue-400" />
                  <span className="font-medium whitespace-nowrap">Scan OCR en cours</span>
                  <span className="font-mono font-bold text-blue-400 tabular-nums">{Math.round(scanProgress)}%</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT ZONE: AI Extraction & Pre-filled Human-Validated Form */}
        <div className="lg:col-span-7 space-y-6">
          {/* AI Analysis Status Panel */}
          {(uploading || analyzing || extraction || aiError) && (
            <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-blue-600" />
                  <h2 className="font-display text-sm font-bold">Analyse IA Haute Vitesse (Assistance à la saisie)</h2>
                </div>
                {uploadedFile && !analyzing && !uploading && (
                  <button
                    type="button"
                    onClick={() => runAiAnalysis(uploadedFile, 15)}
                    className="text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline"
                  >
                    Relancer l’analyse
                  </button>
                )}
              </div>

              {(uploading || analyzing || (scanProgress === 100 && extraction)) && (
                <div className="space-y-3 p-4 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                      {scanProgress < 100 ? (
                        <Loader2 className="w-3.5 h-3.5 text-blue-600 animate-spin shrink-0" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      )}
                      <span>{getScanStageLabel(scanProgress)}</span>
                    </span>
                    <span className="font-mono font-bold text-sm text-blue-700 dark:text-blue-400 tabular-nums">
                      {Math.round(scanProgress)} %
                    </span>
                  </div>

                  {/* Smooth 0-100% Progress Track */}
                  <div className="w-full h-2.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                    <motion.div
                      initial={{ width: '0%' }}
                      animate={{ width: `${Math.min(100, Math.round(scanProgress))}%` }}
                      transition={{ duration: 0.15, ease: 'easeOut' }}
                      className={`h-full rounded-full ${
                        scanProgress >= 100 ? 'bg-emerald-600' : 'bg-blue-600'
                      }`}
                    />
                  </div>

                  {/* 4-Step Verification Pipeline */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[11px]">
                    {[
                      { label: '1. Fichier reçu', threshold: 25 },
                      { label: '2. Lecture OCR', threshold: 48 },
                      { label: '3. Données extraites', threshold: 75 },
                      { label: '4. Résumé & routage', threshold: 100 },
                    ].map((st, idx, arr) => {
                      const prevThresh = idx === 0 ? 0 : arr[idx - 1].threshold;
                      const done = scanProgress >= st.threshold;
                      const active = !done && scanProgress > prevThresh;
                      return (
                        <div
                          key={st.label}
                          className={`px-2.5 py-1.5 rounded border flex items-center gap-1.5 ${
                            done
                              ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300'
                              : active
                              ? 'border-blue-300 dark:border-blue-700 bg-blue-50/70 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300 font-medium'
                              : 'border-slate-200 dark:border-slate-700 text-slate-400'
                          }`}
                        >
                          {done ? (
                            <Check className="w-3 h-3 shrink-0" />
                          ) : active ? (
                            <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                          ) : (
                            <span className="w-3 h-3 text-center font-mono">·</span>
                          )}
                          <span className="truncate">{st.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {aiError && (
                <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300 space-y-1">
                  <p className="font-semibold">Analyse IA indisponible — Mode manuel actif</p>
                  <p>{aiError}</p>
                </div>
              )}

              {extraction && (
                <div className="space-y-3 text-xs">
                  {/* Badge Nature du document & Priorité détectées par l'IA */}
                  <div className="flex flex-wrap items-center gap-2 pt-0.5 pb-1">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                      <FileText className="w-3.5 h-3.5" />
                      <span>
                        Nature détectée : {DOCUMENT_NATURE_OPTIONS.find((o) => o.value === form.category)?.label || extraction.mailNature || '📄 Lettre administrative'}
                      </span>
                    </span>
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200">
                      Priorité : {extraction.suggestedPriority || 'NORMALE'}
                    </span>
                  </div>

                  {extraction.readabilityWarning && (
                    <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300">
                      Attention lisibilité : {extraction.readabilityWarning}
                    </div>
                  )}

                  {extraction.uncertainFields.length > 0 && (
                    <p className="text-amber-700 dark:text-amber-400">
                      Champs incertains à vérifier : {extraction.uncertainFields.join(', ')}
                    </p>
                  )}

                  <div>
                    <p className="font-semibold text-slate-700 dark:text-slate-300 mb-1">Résumé court généré</p>
                    <p className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 leading-relaxed">
                      {extraction.shortSummary}
                    </p>
                  </div>

                  <details className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                    <summary className="font-semibold cursor-pointer text-slate-700 dark:text-slate-300">
                      Résumé détaillé &amp; Texte OCR brut ({extraction.ocrText.length} caractères)
                    </summary>
                    <div className="mt-3 space-y-3">
                      <p className="whitespace-pre-line text-slate-600 dark:text-slate-300">{extraction.detailedSummary}</p>
                      <pre className="p-3 rounded bg-slate-50 dark:bg-slate-950 text-[11px] font-mono overflow-x-auto max-h-48 whitespace-pre-wrap">
                        {extraction.ocrText || 'Aucun texte extrait'}
                      </pre>
                    </div>
                  </details>
                </div>
              )}
            </div>
          )}

          {/* Duplicate Detection Alert */}
          {duplicates.length > 0 && (
            <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 space-y-3">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-5 h-5 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="text-xs space-y-1">
                  <p className="font-bold text-amber-900 dark:text-amber-200">
                    Correspondance potentielle détectée ({duplicates.length} doublon(s) possible(s))
                  </p>
                  <p className="text-amber-800 dark:text-amber-300">
                    Vérifiez si ce courrier n’a pas déjà été enregistré avant de valider.
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                {duplicates.map((d) => (
                  <div
                    key={d.id}
                    className="flex items-center justify-between bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-amber-200 dark:border-amber-800 text-xs"
                  >
                    <div className="min-w-0">
                      <span className="font-mono font-semibold text-blue-700 dark:text-blue-400">{d.reference}</span>
                      <span className="mx-2 text-slate-400">·</span>
                      <span className="font-medium truncate">{d.subject}</span>
                      <p className="text-slate-500 mt-0.5">{d.reason}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onNavigate('mail-detail', d.id)}
                      className="text-blue-700 dark:text-blue-400 font-medium shrink-0 ml-3"
                    >
                      Consulter
                    </button>
                  </div>
                ))}
              </div>

              <label className="flex items-center gap-2 text-xs font-medium text-amber-900 dark:text-amber-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={duplicateConfirmed}
                  onChange={(e) => setDuplicateConfirmed(e.target.checked)}
                />
                <span>Je confirme qu’il s’agit d’un nouveau courrier distinct</span>
              </label>
            </div>
          )}

          {/* Official Registration Form */}
          <form
            onSubmit={handleSubmit}
            className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-5"
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h2 className="font-display text-base font-bold">Formulaire d’enregistrement officiel</h2>
              <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
                {(['ENTRANT', 'SORTANT', 'INTERNE'] as MailDirection[]).map((dir) => (
                  <button
                    key={dir}
                    type="button"
                    onClick={() => {
                      const matched = circuits.find((c) => c.mail_direction === dir);
                      setForm({ ...form, direction: dir, circuitId: matched?.id || '' });
                    }}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                      form.direction === dir
                        ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {dir === 'ENTRANT' ? 'Entrant' : dir === 'SORTANT' ? 'Sortant' : 'Interne'}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium mb-1">Objet du courrier *</label>
                <input
                  type="text"
                  required
                  value={form.subject}
                  onBlur={checkManualDuplicates}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  placeholder="Objet officiel..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">Expéditeur</label>
                <input
                  type="text"
                  value={form.senderName}
                  onChange={(e) => setForm({ ...form, senderName: e.target.value })}
                  placeholder="Non détecté / Nom..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Organisation expéditrice</label>
                <input
                  type="text"
                  value={form.senderOrg}
                  onChange={(e) => setForm({ ...form, senderOrg: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">Destinataire</label>
                <input
                  type="text"
                  value={form.recipientName}
                  onChange={(e) => setForm({ ...form, recipientName: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Référence externe</label>
                <input
                  type="text"
                  value={form.externalRef}
                  onBlur={checkManualDuplicates}
                  onChange={(e) => setForm({ ...form, externalRef: e.target.value })}
                  placeholder="Ex: PAC/DG/2026/..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium">Nature du document</label>
                  {extraction && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
                      ✨ Détecté : {DOCUMENT_NATURE_OPTIONS.find((o) => o.value === form.category)?.label.split(' ')[1] || 'Détecté'}
                    </span>
                  )}
                </div>
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-medium"
                >
                  {DOCUMENT_NATURE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Priorité</label>
                <select
                  value={form.priority}
                  onChange={(e) => setForm({ ...form, priority: e.target.value as MailPriority })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                >
                  <option value="BASSE">Basse</option>
                  <option value="NORMALE">Normale</option>
                  <option value="HAUTE">Haute</option>
                  <option value="URGENTE">Urgente</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">Date du courrier</label>
                <input
                  type="date"
                  value={form.mailDate}
                  onChange={(e) => setForm({ ...form, mailDate: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Date limite de traitement</label>
                <input
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">Service concerné</label>
                <select
                  value={form.currentServiceId}
                  onChange={(e) => setForm({ ...form, currentServiceId: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                >
                  <option value="">Sélectionner un service</option>
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">Circuit administratif à démarrer</label>
                <select
                  value={form.circuitId}
                  onChange={(e) => setForm({ ...form, circuitId: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                >
                  <option value="">Enregistrer sans démarrer de circuit</option>
                  {directionCircuits.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} (v{c.current_version})
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium mb-1">
                  Affecter directement un Agent (optionnel — envoie un e-mail au chef de département)
                </label>
                <select
                  value={form.assignedAgentId}
                  onChange={(e) => setForm({ ...form, assignedAgentId: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                >
                  <option value="">Laisser le Responsable affecter ultérieurement</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.full_name} ({a.services.map((s) => s.service_name).join(', ') || 'Agent'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium mb-1">Description / Synthèse</label>
                <textarea
                  rows={3}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                />
              </div>

              <div className="sm:col-span-2 flex flex-wrap gap-6 text-xs">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.requiresResponse}
                    onChange={(e) => setForm({ ...form, requiresResponse: e.target.checked })}
                  />
                  <span>Une réponse officielle est requise</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.isConfidential}
                    onChange={(e) => setForm({ ...form, isConfidential: e.target.checked })}
                  />
                  <span>Courrier confidentiel (accès restreint)</span>
                </label>
              </div>
            </div>

            {saveError && <p className="text-sm text-red-600 dark:text-red-400">{saveError}</p>}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => onNavigate('mails')}
                className="px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-medium"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-slate-900 dark:bg-blue-600 text-white text-sm font-semibold hover:bg-slate-800 dark:hover:bg-blue-500 disabled:opacity-60"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{saving ? 'Enregistrement...' : 'Valider et enregistrer officiellement'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
