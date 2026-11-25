import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Archive,
  ArrowLeft,
  Bold,
  Calendar,
  CheckCircle2,
  Copy,
  Download,
  Eraser,
  Eye,
  EyeOff,
  FileDown,
  FileEdit,
  FileText,
  Heading1,
  Heading2,
  Italic,
  List,
  ListOrdered,
  Lock,
  MailCheck,
  Maximize2,
  MessageSquarePlus,
  Minimize2,
  PenTool,
  Printer,
  Redo,
  Save,
  Send,
  ShieldAlert,
  Sparkles,
  Stamp,
  Table,
  Underline,
  Undo,
  Upload,
  UserCheck,
  X,
} from 'lucide-react';
import { apiFetch, downloadAuthenticatedFile, getAuthToken } from '../api/client.ts';
import type { AppPage } from '../components/common/AppShell.tsx';
import { PriorityLabel, StatusLabel } from '../components/common/StatusBadge.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import type {
  CircuitItem,
  CircuitStepConfig,
  CircuitTemplateItem,
  MailActionLockInfo,
  MailItem,
  MailSignatureItem,
  ServiceItem,
} from '../types/nexora.ts';

interface MailDetailResponse {
  mail: MailItem & { created_by_name?: string };
  documents: Array<{
    id: string;
    doc_kind: string;
    filename: string;
    mime_type: string;
    size_bytes: number;
    version: number;
    uploaded_by_name: string;
    created_at: string;
  }>;
  aiAnalyses: Array<{
    id: string;
    status: string;
    is_simulated: number;
    short_summary: string;
    detailed_summary: string;
    ocr_text: string;
    validated_by_name: string | null;
    created_at: string;
  }>;
  workflowInstance: { id: string; status: string; current_step_index: number } | null;
  workflowSteps: Array<{
    id: string;
    step_order: number;
    step_name: string;
    step_type: string;
    mode: string;
    status: string;
    service_name: string | null;
    assigned_user_name: string | null;
    decision: string;
    decision_motif: string;
    observations: string;
    decided_by_name: string | null;
    decided_at: string | null;
    due_at: string | null;
    parallel_approvals_json: string;
  }>;
  tasks: Array<{ id: string; title: string; status: string; assigned_user_name: string | null; due_date: string }>;
  comments: Array<{ id: string; user_name: string; user_role: string; comment_type: string; content: string; created_at: string }>;
  shipments: Array<{ id: string; dispatch_mode: string; tracking_ref: string; recipient_details: string; dispatched_by_name: string; dispatched_at: string; notes: string }>;
  emailLogs: Array<{ id: string; recipient_email: string; recipient_name: string; department_name: string; subject: string; delivery_status: string; created_at: string }>;
  auditLogs: Array<{ id: string; user_name: string; action: string; old_value_json: string; new_value_json: string; context: string; created_at: string }>;
  signatures: MailSignatureItem[];
  parallelInterventions?: Array<{
    id: string;
    workflow_step_id: string;
    user_id: string;
    user_full_name: string;
    user_actual_role: string;
    service_name: string | null;
    is_required: number;
    status: string;
    decision: string;
    opinion_text: string;
    completed_at: string | null;
  }>;
  actionLock: MailActionLockInfo;
  currentUserSignAssets: {
    signatureImage: string;
    stampImage: string;
    companyStampImage: string;
  };
}

interface MailDetailPageProps {
  mailId: string;
  onNavigate: (page: AppPage, param?: string) => void;
}

export function MailDetailPage({ mailId, onNavigate }: MailDetailPageProps) {
  const { user } = useAuth();
  const [data, setData] = useState<MailDetailResponse | null>(null);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [circuits, setCircuits] = useState<CircuitItem[]>([]);
  const [templates, setTemplates] = useState<CircuitTemplateItem[]>([]);
  const [users, setUsers] = useState<Array<{ id: string; full_name: string; role: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');

  // Orientation & Circuit type inputs
  const [orientMode, setOrientMode] = useState<'CUSTOM' | 'CIRCUIT' | 'TEMPLATE'>('CUSTOM');
  const [circuitTypeChoice, setCircuitTypeChoice] = useState<'SEQUENTIEL' | 'PARALLELE' | 'MIXTE'>('SEQUENTIEL');
  const [orientServiceId, setOrientServiceId] = useState('');
  const [orientTargetUserId, setOrientTargetUserId] = useState('');
  const [orientCircuitId, setOrientCircuitId] = useState('');
  const [orientTemplateId, setOrientTemplateId] = useState('');
  const [orientInstructions, setOrientInstructions] = useState('');
  const [parallelRuleChoice, setParallelRuleChoice] = useState<'ALL' | 'MIN_COUNT' | 'CONSULTATIVE'>('ALL');
  const [parallelMinApprovals, setParallelMinApprovals] = useState(2);
  const [selectedParallelUserIds, setSelectedParallelUserIds] = useState<string[]>([]);

  // Sequential multi-step builder state
  const [sequentialStepsList, setSequentialStepsList] = useState<
    Array<{ id: string; userId: string; role: string; serviceId: string; instructions: string }>
  >([]);
  const [assignAgentId, setAssignAgentId] = useState('');
  const [assignDueDate, setAssignDueDate] = useState('');
  const [assignInstructions, setAssignInstructions] = useState('');
  const [decisionNote, setDecisionNote] = useState('');
  const [commentText, setCommentText] = useState('');
  const [commentType, setCommentType] = useState('OBSERVATION');
  const [dispatchForm, setDispatchForm] = useState({ dispatchMode: 'COURSIER', trackingRef: '', recipientDetails: '', notes: '' });
  const [docKind, setDocKind] = useState('PROJET_REPONSE');

  // President Signature & Stamp state
  const [sigMode, setSigMode] = useState<'SAVED' | 'DRAW'>('SAVED');
  const [includeStamp, setIncludeStamp] = useState(true);
  const [customStampImg, setCustomStampImg] = useState('');
  const [hasDrawnSig, setHasDrawnSig] = useState(false);
  const sigCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);

  // Document viewer state
  const [previewDocId, setPreviewDocId] = useState<string | null>(null);
  const [docBlobUrls, setDocBlobUrls] = useState<Record<string, string>>({});
  const [docLoadingId, setDocLoadingId] = useState<string | null>(null);

  // Archive with template modal state
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [saveAsTemplateChoice, setSaveAsTemplateChoice] = useState<'OUI' | 'NON'>('NON');
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateDescription, setNewTemplateDescription] = useState('');
  const [draftHtml, setDraftHtml] = useState('');
  const [draftSaving, setDraftSaving] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);
  const [isEditorFullscreen, setIsEditorFullscreen] = useState(false);
  const [editorFontSize, setEditorFontSize] = useState('3');
  const [editorFontFamily, setEditorFontFamily] = useState('Arial, sans-serif');
  const draftEditorRef = useRef<HTMLDivElement | null>(null);
  const draftSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [detail, svcRes, cirRes, usrRes, tmplRes] = await Promise.all([
        apiFetch<MailDetailResponse>(`/api/mails/${mailId}`),
        apiFetch<{ services: ServiceItem[] }>('/api/services'),
        apiFetch<{ circuits: CircuitItem[] }>('/api/circuits'),
        apiFetch<{ users: Array<{ id: string; full_name: string; role: string }> }>('/api/users'),
        apiFetch<{ templates: CircuitTemplateItem[] }>('/api/circuit-templates').catch(() => ({ templates: [] })),
      ]);
      setData(detail);
      setServices(svcRes.services);
      setCircuits(cirRes.circuits);
      setTemplates(tmplRes.templates || []);
      setUsers(usrRes.users);
      setOrientServiceId(detail.mail.current_service_id || '');
      setOrientCircuitId(detail.mail.circuit_id || cirRes.circuits.find((c) => c.mail_direction === detail.mail.direction)?.id || '');
      if (!detail.currentUserSignAssets?.signatureImage) {
        setSigMode('DRAW');
      } else {
        setSigMode('SAVED');
      }
      // Initialize draft editor with server content
      const serverDraft = (detail.mail as MailItem & { draft_response_html?: string }).draft_response_html || '';
      setDraftHtml(serverDraft);
      if (draftEditorRef.current && draftEditorRef.current.innerHTML !== serverDraft) {
        draftEditorRef.current.innerHTML = serverDraft;
      }

      // Auto-preview original attached document
      if (detail.documents && detail.documents.length > 0) {
        const primaryDoc = detail.documents.find((d) => d.doc_kind === 'ORIGINAL') || detail.documents[0];
        setPreviewDocId(primaryDoc.id);
        loadDocBlob(primaryDoc.id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement du courrier');
    } finally {
      setLoading(false);
    }
  }, [mailId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const getPointerPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = sigCanvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const startSigDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = sigCanvasRef.current;
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
    setHasDrawnSig(true);
  };

  const moveSigDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || !sigCanvasRef.current) return;
    const ctx = sigCanvasRef.current.getContext('2d');
    if (!ctx) return;
    const pos = getPointerPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  };

  const endSigDraw = () => {
    isDrawingRef.current = false;
  };

  const clearSigCanvas = () => {
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawnSig(false);
  };

  const handleUploadCustomStamp = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCustomStampImg(String(reader.result));
    reader.readAsDataURL(file);
  };

  const handleOrient = async () => {
    setFeedback('');
    setError('');
    try {
      let customStepsPayload: any = undefined;

      if (orientMode === 'CUSTOM') {
        if (circuitTypeChoice === 'PARALLELE') {
          if (selectedParallelUserIds.length === 0) {
            setError('Veuillez sélectionner au moins un intervenant pour le circuit parallèle.');
            return;
          }
          const targets = selectedParallelUserIds.map((uid) => {
            const u = users.find((x) => x.id === uid);
            return {
              userId: uid,
              userName: u?.full_name || 'Utilisateur',
              userRole: u?.role,
              isRequired: parallelRuleChoice !== 'CONSULTATIVE',
            };
          });
          customStepsPayload = [
            {
              name: 'Consultation Parallèle des Services',
              mode: 'PARALLEL',
              parallelRule: parallelRuleChoice,
              minApprovals: parallelMinApprovals,
              parallelTargets: targets,
              slaHours: 48,
            },
          ];
        } else if (circuitTypeChoice === 'MIXTE') {
          const targets = selectedParallelUserIds.map((uid) => {
            const u = users.find((x) => x.id === uid);
            return {
              userId: uid,
              userName: u?.full_name || 'Utilisateur',
              userRole: u?.role,
              isRequired: true,
            };
          });
          customStepsPayload = [
            {
              name: 'Examen initial & Synthèse',
              mode: 'SEQUENTIAL',
              targetRole: 'RESPONSABLE',
              targetServiceId: orientServiceId || null,
              slaHours: 24,
            },
            {
              name: 'Consultation & Avis des Directions',
              mode: 'PARALLEL',
              parallelRule: parallelRuleChoice,
              minApprovals: parallelMinApprovals,
              parallelTargets: targets,
              slaHours: 48,
            },
            {
              name: 'Validation finale Direction Générale / Présidence',
              mode: 'SEQUENTIAL',
              targetRole: 'PRESIDENT',
              slaHours: 24,
            },
          ];
        } else {
          // Séquentiel : prise en compte de la liste ordonnée d'étapes définies à l'avance
          if (sequentialStepsList.length > 0) {
            customStepsPayload = sequentialStepsList.map((st, idx) => {
              const u = users.find((x) => x.id === st.userId);
              const isPres = u?.role === 'PRESIDENT';
              return {
                stepOrder: idx + 1,
                name: isPres ? 'Examen & Signature du Président' : `Intervention ${idx + 1} : ${u?.full_name || 'Destinataire'}`,
                mode: 'SEQUENTIAL',
                targetRole: u?.role || 'RESPONSABLE',
                targetServiceId: st.serviceId || u?.role === 'PRESIDENT' ? orientServiceId : null,
                assignedUserId: st.userId,
                slaHours: 48,
              };
            });
          } else {
            // Étape unique par défaut si non spécifié dans la liste
            const targetU = users.find((x) => x.id === orientTargetUserId);
            const isPresidentTarget = targetU?.role === 'PRESIDENT';
            customStepsPayload = [
              {
                name: isPresidentTarget ? 'Examen & Signature du Président' : `Traitement par ${targetU?.full_name || 'le destinataire'}`,
                mode: 'SEQUENTIAL',
                targetRole: targetU?.role || 'RESPONSABLE',
                targetServiceId: orientServiceId || null,
                assignedUserId: orientTargetUserId || null,
                slaHours: 48,
              },
            ];
          }
        }
      }

      const res = await apiFetch<{ departmentEmailsTriggered: number }>(`/api/mails/${mailId}/orient`, {
        method: 'POST',
        body: JSON.stringify({
          serviceId: orientServiceId || undefined,
          assignedAgentId: orientTargetUserId || undefined,
          circuitId: orientMode === 'CIRCUIT' ? orientCircuitId : undefined,
          templateId: orientMode === 'TEMPLATE' ? orientTemplateId : undefined,
          circuitType: circuitTypeChoice,
          customSteps: customStepsPayload,
          observations: orientInstructions.trim() || decisionNote.trim() || 'Orientation effectuée par le Secrétariat.',
        }),
      });
      setFeedback(
        res.departmentEmailsTriggered > 0
          ? 'Courrier orienté et e-mail automatique envoyé au destinataire. Le dossier est maintenant transmis.'
          : 'Courrier orienté et circuit lancé avec succès. Le dossier est maintenant transmis.'
      );
      setOrientInstructions('');
      setDecisionNote('');
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    }
  };

  const handleAssignAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback('');
    setError('');
    try {
      const res = await apiFetch<{ departmentEmailsTriggered: number }>(`/api/mails/${mailId}/assign-agent`, {
        method: 'POST',
        body: JSON.stringify({
          agentId: assignAgentId,
          dueDate: assignDueDate,
          instructions: assignInstructions,
        }),
      });
      setFeedback(
        `Courrier affecté à l’agent. ${res.departmentEmailsTriggered} e-mail(s) de notification envoyé(s) automatiquement au chef du département.`
      );
      setAssignInstructions('');
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    }
  };

  const handleDecision = async (decision: string) => {
    setFeedback('');
    setError('');
    try {
      if (decision === 'REJETER') {
        if (!decisionNote || !decisionNote.trim()) {
          setError('Le motif du rejet est obligatoire. Veuillez saisir la raison du rejet ci-dessus avant de continuer.');
          return;
        }
      }

      let signatureImage: string | undefined;
      let stampImage: string | undefined;

      const userCanSign = (data?.actionLock.canSign || data?.actionLock.requiresPresidentSignature) && user?.role !== 'AGENT';

      if (decision === 'APPROUVER' && userCanSign) {
        if (sigMode === 'DRAW') {
          if (hasDrawnSig && sigCanvasRef.current) {
            signatureImage = sigCanvasRef.current.toDataURL('image/png');
          } else if (data?.actionLock.requiresPresidentSignature) {
            setError('Veuillez tracer votre signature numérique dans le cadre ou utiliser votre signature enregistrée.');
            return;
          }
        } else {
          signatureImage = data?.currentUserSignAssets?.signatureImage || '';
          if (!signatureImage && data?.actionLock.requiresPresidentSignature) {
            setError('Aucune signature enregistrée dans votre profil. Tracez votre signature ci-dessous.');
            return;
          }
        }
        if (includeStamp) {
          stampImage =
            customStampImg ||
            data?.currentUserSignAssets?.stampImage ||
            data?.currentUserSignAssets?.companyStampImage ||
            '';
        }
      }

      await apiFetch(`/api/mails/${mailId}/decision`, {
        method: 'POST',
        body: JSON.stringify({
          decision,
          motif: decisionNote,
          observations: decisionNote,
          signatureImage,
          stampImage,
        }),
      });
      setFeedback(`Décision "${decision}" enregistrée. Votre intervention est clôturée et le dossier est transmis.`);
      setDecisionNote('');
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action refusée');
    }
  };

  const handleCompleteDirect = async () => {
    setFeedback('');
    setError('');
    try {
      await apiFetch(`/api/mails/${mailId}/complete-direct`, {
        method: 'POST',
        body: JSON.stringify({ observations: decisionNote }),
      });
      setFeedback('Traitement terminé et retourné au Secrétariat. Le courrier est désormais verrouillé pour votre profil.');
      setDecisionNote('');
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action refusée');
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    setError('');
    try {
      await apiFetch(`/api/mails/${mailId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ commentType, content: commentText }),
      });
      setCommentText('');
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    }
  };

  const handleUploadDoc = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('docKind', docKind);
    try {
      await apiFetch(`/api/mails/${mailId}/documents`, { method: 'POST', body: fd });
      setFeedback('Document ajouté et versionné.');
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur upload');
    }
  };

  const handleDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await apiFetch(`/api/mails/${mailId}/dispatch`, {
        method: 'POST',
        body: JSON.stringify(dispatchForm),
      });
      setFeedback('Expédition enregistrée et preuve consignée.');
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    }
  };

  const handleArchive = async () => {
    setShowArchiveModal(true);
  };

  const confirmArchive = async () => {
    setError('');
    setShowArchiveModal(false);
    try {
      const res = await apiFetch<{ ok: boolean; templateId?: string }>(`/api/mails/${mailId}/archive`, {
        method: 'POST',
        body: JSON.stringify({
          saveAsTemplate: saveAsTemplateChoice === 'OUI',
          templateName: newTemplateName,
          templateDescription: newTemplateDescription,
        }),
      });
      setFeedback(
        res.templateId
          ? `Dossier clôturé et archivé. Le modèle de circuit "${newTemplateName}" a été enregistré avec succès.`
          : 'Dossier clôturé et archivé définitivement.'
      );
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur archivage');
    }
  };

  // ── Document Viewer helpers ──
  const loadDocBlob = async (docId: string) => {
    if (docBlobUrls[docId]) return;
    setDocLoadingId(docId);
    try {
      const headers: Record<string, string> = { 'X-Requested-With': 'XMLHttpRequest' };
      const token = getAuthToken();
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const r = await fetch(`/api/documents/${docId}/file`, { headers, credentials: 'include' });
      if (!r.ok) throw new Error('Échec de chargement du document');
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      setDocBlobUrls((prev) => ({ ...prev, [docId]: url }));
    } catch {
      setError("Impossible de charger l'aperçu du document.");
    } finally {
      setDocLoadingId(null);
    }
  };

  const toggleDocPreview = async (docId: string) => {
    if (previewDocId === docId) {
      setPreviewDocId(null);
      return;
    }
    setPreviewDocId(docId);
    await loadDocBlob(docId);
  };

  // ── Draft editor helpers ──
  const execDraftCommand = (command: string, value?: string) => {
    document.execCommand(command, false, value);
    draftEditorRef.current?.focus();
  };

  const insertSignatureInDraft = (sigUrl: string, name: string, title?: string) => {
    const signatureBlock = `
      <div style="margin-top: 30px; margin-bottom: 20px; page-break-inside: avoid; display: inline-block; min-width: 240px; text-align: left;">
        <p style="font-size: 13px; font-weight: bold; margin-bottom: 8px; color: #1e293b;">${title || 'Le Responsable'}</p>
        <img src="${sigUrl}" alt="Signature" style="max-height: 80px; max-width: 220px; object-fit: contain; display: block; margin-bottom: 6px;" />
        <p style="font-size: 12px; font-weight: 600; color: #334155; margin: 0;">${name}</p>
      </div>
    `;
    document.execCommand('insertHTML', false, signatureBlock);
    draftEditorRef.current?.focus();
    handleDraftInput();
  };

  const insertDateInDraft = () => {
    const today = new Date().toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    const dateBlock = `<p style="text-align: right; margin-bottom: 24px; font-size: 13px; color: #475569;">Fait le ${today}</p>`;
    document.execCommand('insertHTML', false, dateBlock);
    draftEditorRef.current?.focus();
    handleDraftInput();
  };

  const insertHeaderTemplate = () => {
    const headerBlock = `
      <div style="border-bottom: 2px solid #0f172a; padding-bottom: 16px; margin-bottom: 24px; font-family: Arial, sans-serif;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="vertical-align: top; width: 60%;">
              <p style="font-size: 15px; font-weight: 800; text-transform: uppercase; margin: 0; color: #0f172a;">${user?.companyId ? 'RÉPUBLIQUE DU BÉNIN' : 'ORGANISATION'}</p>
              <p style="font-size: 12px; margin: 2px 0 0 0; color: #475569; font-weight: 600;">DIRECTION GÉNÉRALE / SECRÉTARIAT</p>
              <p style="font-size: 11px; margin: 2px 0 0 0; color: #64748b;">Réf : ${mail?.reference || 'NEXORA-REP'}</p>
            </td>
            <td style="vertical-align: top; text-align: right; width: 40%;">
              <p style="font-size: 12px; margin: 0; color: #475569;">Le ${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
            </td>
          </tr>
        </table>
      </div>
      <div style="margin-bottom: 20px;">
        <p style="font-size: 13px; font-weight: bold; margin: 0 0 8px 0;"><strong>À l'attention de :</strong> ${mail?.sender_name || 'Destinataire'} / ${mail?.sender_org || ''}</p>
        <p style="font-size: 13px; font-weight: bold; margin: 0;"><strong>Objet :</strong> Réponse à votre correspondance — ${mail?.subject || ''}</p>
      </div>
      <p style="font-size: 13px; line-height: 1.6; margin-top: 16px;">Monsieur / Madame,</p>
      <p style="font-size: 13px; line-height: 1.6;">Nous accusons bonne réception de votre lettre citée en référence...</p>
    `;
    document.execCommand('insertHTML', false, headerBlock);
    draftEditorRef.current?.focus();
    handleDraftInput();
  };

  const exportDraftAsDoc = () => {
    const content = draftEditorRef.current?.innerHTML || draftHtml;
    const header = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <meta charset='utf-8'>
        <title>Projet de Réponse - ${mail?.reference}</title>
        <style>
          body { font-family: Arial, sans-serif; font-size: 11pt; line-height: 1.5; padding: 2cm; }
          table { width: 100%; border-collapse: collapse; }
        </style>
      </head>
      <body>
    `;
    const footer = '</body></html>';
    const sourceHTML = header + content + footer;
    const blob = new Blob(['\ufeff', sourceHTML], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Projet_Reponse_${mail?.reference || 'Courrier'}.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const printDraftDoc = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head>
          <title>Impression - ${mail?.reference}</title>
          <style>
            @page { size: A4; margin: 20mm; }
            body { font-family: Arial, sans-serif; font-size: 12pt; line-height: 1.6; color: #000; }
            img { max-height: 90px; }
          </style>
        </head>
        <body onload="window.print(); window.close();">
          ${draftEditorRef.current?.innerHTML || draftHtml}
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleDraftInput = () => {
    const html = draftEditorRef.current?.innerHTML || '';
    setDraftHtml(html);
    setDraftSaved(false);
    // Autosave debounce (3 seconds)
    if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current);
    draftSaveTimer.current = setTimeout(() => {
      saveDraft(html);
    }, 3000);
  };

  const saveDraft = async (html?: string) => {
    const content = html ?? draftHtml;
    if (!content && !draftHtml) return;
    setDraftSaving(true);
    try {
      const plainText = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      await apiFetch(`/api/mails/${mailId}/draft`, {
        method: 'PATCH',
        body: JSON.stringify({ draftHtml: content, draftText: plainText }),
      });
      setDraftSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur sauvegarde brouillon');
    } finally {
      setDraftSaving(false);
    }
  };

  const handleSaveDraft = async () => {
    if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current);
    await saveDraft();
    setFeedback('Brouillon sauvegardé avec succès.');
  };

  if (loading) return <div className="p-8 text-sm text-slate-500">Chargement de la fiche courrier...</div>;
  if (!data || !user) return <div className="p-6 text-sm text-red-600">{error || 'Courrier introuvable'}</div>;

  const {
    mail,
    documents,
    aiAnalyses,
    workflowSteps,
    comments,
    shipments,
    emailLogs,
    auditLogs,
    signatures = [],
    actionLock,
    currentUserSignAssets,
  } = data;

  const activeStep = workflowSteps.find((s) => s.status === 'EN_COURS');
  const assignableUsers = users.filter((u) => u.isActive !== false);
  const effectiveSavedStamp =
    customStampImg || currentUserSignAssets?.stampImage || currentUserSignAssets?.companyStampImage || '';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => onNavigate('mails')}
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Retour à la liste</span>
        </button>

        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="font-mono font-bold text-blue-700 dark:text-blue-400">{mail.reference}</span>
          <span aria-hidden="true">·</span>
          <span>{mail.direction}</span>
          <span aria-hidden="true">·</span>
          <PriorityLabel priority={mail.priority} />
          <span aria-hidden="true">·</span>
          <StatusLabel status={mail.mail_status} />
          <span aria-hidden="true">·</span>
          <StatusLabel status={mail.shipping_status} />
          <span aria-hidden="true">·</span>
          <StatusLabel status={mail.archive_status} />
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

      {/* Turn-Based Read-Only Lock Banner when user cannot act */}
      {!actionLock.canAct && (
        <div className="p-4 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <Lock className="w-5 h-5 text-slate-600 dark:text-slate-300 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                Dossier verrouillé en lecture seule pour votre compte
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">{actionLock.lockReason}</p>
            </div>
          </div>
          <span className="text-xs font-mono px-2.5 py-1 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300">
            Détenteur actuel : {actionLock.currentHolderLabel}
          </span>
        </div>
      )}

      {/* Header Metadata Card */}
      <div className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
          <div className="space-y-2 flex-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
                {mail.direction === 'ENTRANT' ? '📥 Courrier Entrant' : mail.direction === 'SORTANT' ? '📤 Courrier Sortant' : '🔄 Courrier Interne'}
              </span>
              <span className="font-mono text-xs text-slate-500">Réf : {mail.reference}</span>
            </div>
            <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">{mail.subject}</h1>
            <p className="text-sm text-slate-600 dark:text-slate-300 max-w-4xl leading-relaxed">{mail.description}</p>
          </div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-xs shrink-0 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
            <div>
              <span className="text-slate-400 block font-medium">Expéditeur</span>
              <span className="font-semibold text-slate-900 dark:text-white">{mail.sender_org || mail.sender_name || 'Interne'}</span>
            </div>
            <div>
              <span className="text-slate-400 block font-medium">Destinataire</span>
              <span className="font-semibold text-slate-900 dark:text-white">{mail.recipient_name || mail.recipient_org || 'Organisation'}</span>
            </div>
            <div>
              <span className="text-slate-400 block font-medium">Service actuel</span>
              <span className="font-semibold text-blue-700 dark:text-blue-400">{mail.service_name || 'Non affecté'}</span>
            </div>
            <div>
              <span className="text-slate-400 block font-medium">Agent affecté</span>
              <span className="font-semibold text-slate-900 dark:text-white">{mail.assigned_agent_name || 'En attente'}</span>
            </div>
            <div>
              <span className="text-slate-400 block font-medium">Réception</span>
              <span className="font-mono text-slate-700 dark:text-slate-300">{mail.received_at.slice(0, 10)}</span>
            </div>
            <div>
              <span className="text-slate-400 block font-medium">Échéance</span>
              <span className="font-mono text-slate-700 dark:text-slate-300">{mail.due_date || 'Non fixée'}</span>
            </div>
          </div>
        </div>

        {/* Visualisation directe du document courrier scanné / original */}
        {documents.some((d) => d.doc_kind === 'ORIGINAL') && (
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
            {(() => {
              const origDoc = documents.find((d) => d.doc_kind === 'ORIGINAL')!;
              const isOpened = previewDocId === origDoc.id;
              return (
                <div className="w-full flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-blue-600" />
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        Courrier original numérisé ({origDoc.filename})
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleDocPreview(origDoc.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 hover:bg-blue-100 transition-colors border border-blue-200 dark:border-blue-900"
                      >
                        {isOpened ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        <span>{isOpened ? 'Masquer le courrier numérisé' : 'Afficher le courrier numérisé'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => downloadAuthenticatedFile(`/api/documents/${origDoc.id}/file`, origDoc.filename)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Télécharger</span>
                      </button>
                    </div>
                  </div>

                  {isOpened && (
                    <div className="mt-2 rounded-xl overflow-hidden border border-slate-300 dark:border-slate-700 bg-slate-900 shadow-inner">
                      {docLoadingId === origDoc.id ? (
                        <div className="p-8 text-center text-xs text-white">Chargement du document...</div>
                      ) : docBlobUrls[origDoc.id] ? (
                        origDoc.mime_type === 'application/pdf' ? (
                          <iframe
                            src={docBlobUrls[origDoc.id]}
                            title={origDoc.filename}
                            className="w-full h-[650px] border-0"
                          />
                        ) : (
                          <div className="p-4 flex justify-center bg-slate-800">
                            <img
                              src={docBlobUrls[origDoc.id]}
                              alt={origDoc.filename}
                              className="max-h-[700px] object-contain rounded"
                            />
                          </div>
                        )
                      ) : (
                        <div className="p-8 text-center text-xs text-slate-400">
                          Cliquez pour charger la prévisualisation du document.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* Visual Workflow Progression */}
      <section className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-5">
          <div>
            <h2 className="font-display text-base font-bold">Parcours du circuit administratif</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {mail.circuit_name ? `Circuit : ${mail.circuit_name}` : 'Aucun circuit démarré'} · Statut workflow : {mail.workflow_status}
            </p>
          </div>
          {mail.direction === 'ENTRANT' && (
            <span className="text-xs font-medium text-indigo-700 dark:text-indigo-400">
              Règle active : Retour obligatoire au Secrétariat avant clôture
            </span>
          )}
        </div>

        {workflowSteps.length === 0 ? (
          <p className="text-sm text-slate-500">Ce courrier n’a pas encore été engagé dans un workflow.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {workflowSteps.map((st) => (
              <div
                key={st.id}
                className={`p-3.5 rounded-lg border text-xs space-y-1.5 ${
                  st.status === 'EN_COURS'
                    ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-950/30'
                    : st.status === 'VALIDE' || st.status === 'TERMINE'
                    ? 'border-emerald-200 dark:border-emerald-900 bg-emerald-50/40 dark:bg-emerald-950/20'
                    : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30'
                }`}
              >
                <div className="flex items-center justify-between font-mono">
                  <span className="font-bold">Étape {st.step_order}</span>
                  <StatusLabel status={st.status} />
                </div>
                <p className="font-semibold text-slate-900 dark:text-white">{st.step_name}</p>
                <p className="text-slate-500">
                  {st.service_name || 'Service'} {st.assigned_user_name ? `· ${st.assigned_user_name}` : ''}
                </p>
                {st.mode === 'PARALLEL' && (
                  <div className="space-y-1 pt-1 border-t border-slate-100 dark:border-slate-800">
                    <p className="font-mono text-[11px] text-indigo-700 dark:text-indigo-400 font-bold">
                      Consultation parallèle ({JSON.parse(st.parallel_approvals_json || '[]').length} avis reçus)
                    </p>
                    {data.parallelInterventions && data.parallelInterventions.filter((i) => i.workflow_step_id === st.id).map((itv) => (
                      <div key={itv.id} className="text-[10px] flex items-center justify-between text-slate-600 dark:text-slate-400">
                        <span>{itv.user_full_name} ({itv.service_name || itv.user_actual_role})</span>
                        <span className={`font-semibold ${itv.status === 'AVIS_RENDU' || itv.status === 'VALIDE' ? 'text-emerald-600' : 'text-amber-600'}`}>
                          {itv.status === 'AVIS_RENDU' ? 'Avis rendu' : itv.status === 'VALIDE' ? 'Validé' : 'En attente'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {st.decided_by_name && (
                  <p className="text-[11px] text-slate-500 pt-1 border-t border-slate-200 dark:border-slate-700">
                    {st.decision} par {st.decided_by_name}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT COLUMN: Active Role Actions + Signatures/Stamps + AI Summary + Documents */}
        <div className="lg:col-span-7 space-y-6">
          {/* Action Console ONLY when actionLock.canAct is true */}
          {actionLock.canAct && (
            <section className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-900 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-base font-bold">Actions de traitement &amp; Décisions</h2>
                <span className="text-xs font-mono text-blue-700 dark:text-blue-400">
                  À votre niveau : {actionLock.currentHolderLabel}
                </span>
              </div>

              {/* Orientation by Secretariat */}
              {actionLock.canOrient && (
                <div className="p-4 rounded-xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/60 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                        Orientation Secrétariat &amp; Choix du Circuit
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Choisissez le mode de traitement (Séquentiel, Parallèle ou Mixte) ou appliquez un modèle enregistré.
                      </p>
                    </div>
                  </div>

                  {/* Mode Selector */}
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setOrientMode('CUSTOM')}
                      className={`px-3 py-2 rounded-lg text-xs font-bold border transition-all text-center ${
                        orientMode === 'CUSTOM'
                          ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                          : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      ⚡ Circuit sur-mesure
                    </button>
                    <button
                      type="button"
                      onClick={() => setOrientMode('CIRCUIT')}
                      className={`px-3 py-2 rounded-lg text-xs font-bold border transition-all text-center ${
                        orientMode === 'CIRCUIT'
                          ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                          : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      📁 Circuit Prédéfini
                    </button>
                    <button
                      type="button"
                      onClick={() => setOrientMode('TEMPLATE')}
                      className={`px-3 py-2 rounded-lg text-xs font-bold border transition-all text-center ${
                        orientMode === 'TEMPLATE'
                          ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                          : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      ⭐ Modèle Réutilisable
                    </button>
                  </div>

                  {/* Cas 1 : Circuit sur-mesure (Séquentiel, Parallèle, Mixte) */}
                  {orientMode === 'CUSTOM' && (
                    <div className="p-3.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3 text-xs">
                      <div className="space-y-1.5">
                        <label className="font-bold text-slate-700 dark:text-slate-300 block">
                          Type d'architecture du circuit :
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                          {[
                            { id: 'SEQUENTIEL', label: '1. Séquentiel', desc: 'Ordre linéaire successif' },
                            { id: 'PARALLELE', label: '2. Parallèle', desc: 'Simultané multi-destinataires' },
                            { id: 'MIXTE', label: '3. Mixte', desc: 'Séquentiel + Parallèle combinés' },
                          ].map((t) => (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => setCircuitTypeChoice(t.id as any)}
                              className={`p-2 rounded-lg border text-left transition-all ${
                                circuitTypeChoice === t.id
                                  ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300'
                                  : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
                              }`}
                            >
                              <p className="font-bold">{t.label}</p>
                              <p className="text-[10px] text-slate-500">{t.desc}</p>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Service de rattachement & Destinataire direct */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="font-semibold block mb-1">Service instructeur :</label>
                          <select
                            value={orientServiceId}
                            onChange={(e) => setOrientServiceId(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                          >
                            <option value="">Sélectionner le service...</option>
                            {services.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="font-semibold block mb-1">Destinataire / Intervenant initial :</label>
                          <select
                            value={orientTargetUserId}
                            onChange={(e) => setOrientTargetUserId(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold"
                          >
                            <option value="">Sélectionner un destinataire...</option>
                            {['PRESIDENT', 'RESPONSABLE', 'AGENT', 'ADMIN'].map((roleKey) => {
                              const groupUsers = users.filter((u) => u.role === roleKey);
                              if (groupUsers.length === 0) return null;
                              const groupLabel =
                                roleKey === 'PRESIDENT'
                                  ? 'Présidence'
                                  : roleKey === 'RESPONSABLE'
                                  ? 'Responsables de Direction'
                                  : roleKey === 'AGENT'
                                  ? 'Agents'
                                  : 'Administrateurs';
                              return (
                                <optgroup key={roleKey} label={groupLabel}>
                                  {groupUsers.map((u) => (
                                    <option key={u.id} value={u.id}>
                                      {u.full_name} ({u.role})
                                    </option>
                                  ))}
                                </optgroup>
                              );
                            })}
                          </select>
                        </div>
                      </div>

                      {/* Configuration Circuit Séquentiel Multi-Étapes */}
                      {circuitTypeChoice === 'SEQUENTIEL' && (
                        <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-bold text-xs text-slate-800 dark:text-slate-200">
                                Étapes ordonnées du circuit séquentiel ({sequentialStepsList.length} définie(s)) :
                              </p>
                              <p className="text-[11px] text-slate-500">
                                Définissez les intervenants qui agiront successivement. Seul le 1er sera notifié au lancement.
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                const newId = 'step_' + Date.now();
                                setSequentialStepsList([
                                  ...sequentialStepsList,
                                  { id: newId, userId: '', role: '', serviceId: orientServiceId || '', instructions: '' },
                                ]);
                              }}
                              className="px-2.5 py-1 rounded bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 font-bold text-xs hover:bg-blue-100 flex items-center gap-1"
                            >
                              + Ajouter une étape
                            </button>
                          </div>

                          {sequentialStepsList.length > 0 ? (
                            <div className="space-y-2 max-h-56 overflow-y-auto p-1">
                              {sequentialStepsList.map((st, sIdx) => {
                                const targetUserObj = users.find((u) => u.id === st.userId);
                                return (
                                  <div
                                    key={st.id}
                                    className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 flex items-center gap-3 text-xs"
                                  >
                                    <span className="w-6 h-6 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center shrink-0 text-[11px]">
                                      {sIdx + 1}
                                    </span>
                                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                                      <select
                                        value={st.userId}
                                        onChange={(e) => {
                                          const uid = e.target.value;
                                          const u = users.find((x) => x.id === uid);
                                          const updated = [...sequentialStepsList];
                                          updated[sIdx].userId = uid;
                                          updated[sIdx].role = u?.role || '';
                                          setSequentialStepsList(updated);
                                        }}
                                        className="w-full px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-medium"
                                      >
                                        <option value="">Sélectionner l'intervenant {sIdx + 1}...</option>
                                        {['PRESIDENT', 'RESPONSABLE', 'AGENT', 'ADMIN'].map((roleKey) => {
                                          const groupUsers = users.filter((u) => u.role === roleKey);
                                          if (groupUsers.length === 0) return null;
                                          const groupLabel =
                                            roleKey === 'PRESIDENT'
                                              ? 'Présidence'
                                              : roleKey === 'RESPONSABLE'
                                              ? 'Responsables de Direction'
                                              : roleKey === 'AGENT'
                                              ? 'Agents'
                                              : 'Administrateurs';
                                          return (
                                            <optgroup key={roleKey} label={groupLabel}>
                                              {groupUsers.map((u) => (
                                                <option key={u.id} value={u.id}>
                                                  {u.full_name} ({u.role})
                                                </option>
                                              ))}
                                            </optgroup>
                                          );
                                        })}
                                      </select>
                                      <input
                                        type="text"
                                        placeholder="Rôle ou consigne pour cette étape..."
                                        value={st.instructions}
                                        onChange={(e) => {
                                          const updated = [...sequentialStepsList];
                                          updated[sIdx].instructions = e.target.value;
                                          setSequentialStepsList(updated);
                                        }}
                                        className="w-full px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                                      />
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSequentialStepsList(sequentialStepsList.filter((_, idx) => idx !== sIdx));
                                      }}
                                      className="text-red-500 hover:text-red-700 font-bold p-1 shrink-0"
                                      title="Supprimer cette étape"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="p-3 rounded-lg border border-dashed border-slate-200 dark:border-slate-800 text-slate-500 text-[11px] flex items-center justify-between">
                              <span>Aucune étape supplémentaire ajoutée. Le destinataire initial recevra le courrier directement.</span>
                              <button
                                type="button"
                                onClick={() => {
                                  // Pré-remplir la 1ère étape avec le destinataire initial si renseigné
                                  const steps = [];
                                  if (orientTargetUserId) {
                                    steps.push({
                                      id: 'step_1',
                                      userId: orientTargetUserId,
                                      role: users.find((u) => u.id === orientTargetUserId)?.role || '',
                                      serviceId: orientServiceId || '',
                                      instructions: 'Étape initiale',
                                    });
                                  }
                                  steps.push({
                                    id: 'step_2',
                                    userId: '',
                                    role: '',
                                    serviceId: orientServiceId || '',
                                    instructions: '',
                                  });
                                  setSequentialStepsList(steps);
                                }}
                                className="text-blue-600 font-bold hover:underline"
                              >
                                + Construire un circuit séquentiel complet
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Options supplémentaires pour Parallèle ou Mixte */}
                      {(circuitTypeChoice === 'PARALLELE' || circuitTypeChoice === 'MIXTE') && (
                        <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                          <div>
                            <label className="font-bold block mb-1">
                              Règle de clôture du groupe parallèle :
                            </label>
                            <select
                              value={parallelRuleChoice}
                              onChange={(e) => setParallelRuleChoice(e.target.value as any)}
                              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold"
                            >
                              <option value="ALL">Option A — Tous les avis obligatoires</option>
                              <option value="MIN_COUNT">Option B — Nombre minimum d'avis</option>
                              <option value="CONSULTATIVE">Option C — Avis consultatifs (non bloquant)</option>
                            </select>
                          </div>

                          {parallelRuleChoice === 'MIN_COUNT' && (
                            <div>
                              <label className="font-semibold block mb-1">Nombre minimum d'avis requis :</label>
                              <input
                                type="number"
                                min={1}
                                max={Math.max(1, selectedParallelUserIds.length)}
                                value={parallelMinApprovals}
                                onChange={(e) => setParallelMinApprovals(Math.max(1, parseInt(e.target.value) || 1))}
                                className="w-24 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold"
                              />
                            </div>
                          )}

                          <div>
                            <label className="font-semibold block mb-1">
                              Destinataires intervenant en parallèle ({selectedParallelUserIds.length} sélectionné(s)) :
                            </label>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-36 overflow-y-auto p-2 rounded-lg border border-slate-200 dark:border-slate-800">
                              {users.map((u) => {
                                const isChecked = selectedParallelUserIds.includes(u.id);
                                return (
                                  <label
                                    key={u.id}
                                    className={`flex items-center gap-2 p-1.5 rounded cursor-pointer text-xs ${
                                      isChecked ? 'bg-blue-50 dark:bg-blue-950/40 font-bold' : 'hover:bg-slate-50'
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={(e) => {
                                        if (e.target.checked) {
                                          setSelectedParallelUserIds([...selectedParallelUserIds, u.id]);
                                        } else {
                                          setSelectedParallelUserIds(selectedParallelUserIds.filter((id) => id !== u.id));
                                        }
                                      }}
                                      className="rounded border-slate-300"
                                    />
                                    <span className="truncate">
                                      {u.full_name} ({u.role})
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Cas 2 : Circuit prédéfini classique */}
                  {orientMode === 'CIRCUIT' && (
                    <div className="p-3.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-[11px] font-semibold block mb-1">Service destinataire :</label>
                          <select
                            value={orientServiceId}
                            onChange={(e) => setOrientServiceId(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                          >
                            <option value="">Sélectionner un service...</option>
                            {services.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-[11px] font-semibold block mb-1">Circuit administratif existant :</label>
                          <select
                            value={orientCircuitId}
                            onChange={(e) => setOrientCircuitId(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold"
                          >
                            <option value="">Choisir un circuit...</option>
                            {circuits.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Cas 3 : Modèle réutilisable */}
                  {orientMode === 'TEMPLATE' && (
                    <div className="p-3.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
                      <div>
                        <label className="text-[11px] font-semibold block mb-1">Modèle réutilisable enregistré :</label>
                        <select
                          value={orientTemplateId}
                          onChange={(e) => setOrientTemplateId(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold"
                        >
                          <option value="">Sélectionner un modèle...</option>
                          {templates.map((tmpl) => (
                            <option key={tmpl.id} value={tmpl.id}>
                              ⭐ {tmpl.name} ({tmpl.circuit_type})
                            </option>
                          ))}
                        </select>
                        {templates.length === 0 && (
                          <p className="text-[11px] text-slate-500 mt-1 italic">
                            Aucun modèle réutilisable pour l'instant. Vous pourrez en enregistrer un lors de l'archivage d'un courrier.
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Instructions & Annotations du Secrétariat */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                      Instructions &amp; Annotations de transmission :
                    </label>
                    <textarea
                      rows={2}
                      value={orientInstructions}
                      onChange={(e) => setOrientInstructions(e.target.value)}
                      placeholder="Indiquez ici vos instructions, consignes ou annotations pour le destinataire..."
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleOrient}
                    className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-colors shadow-sm flex items-center justify-center gap-2"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Lancer et transmettre le courrier</span>
                  </button>
                </div>
              )}

              {/* Assign to Agent / Member -> Sends Department Head / Assignee Email! */}
              {actionLock.canAssignAgent && (
                <form onSubmit={handleAssignAgent} className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold flex items-center gap-1.5">
                      <UserCheck className="w-4 h-4 text-blue-600" />
                      <span>Affecter à un collaborateur</span>
                    </p>
                    <span className="text-[11px] text-slate-500">Notifie automatiquement par e-mail</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <select
                      required
                      value={assignAgentId}
                      onChange={(e) => setAssignAgentId(e.target.value)}
                      className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                    >
                      <option value="">Sélectionner un collaborateur...</option>
                      {['PRESIDENT', 'RESPONSABLE', 'AGENT', 'ADMIN'].map((roleKey) => {
                        const groupUsers = assignableUsers.filter((u) => u.role === roleKey);
                        if (groupUsers.length === 0) return null;
                        const groupLabel =
                          roleKey === 'PRESIDENT'
                            ? 'Présidence'
                            : roleKey === 'RESPONSABLE'
                            ? 'Responsables de Direction / Service'
                            : roleKey === 'AGENT'
                            ? 'Agents & Collaborateurs'
                            : 'Administrateurs';
                        return (
                          <optgroup key={roleKey} label={groupLabel}>
                            {groupUsers.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.full_name} {a.job_title ? `(${a.job_title})` : `[${a.role}]`}
                              </option>
                            ))}
                          </optgroup>
                        );
                      })}
                    </select>
                    <input
                      type="date"
                      value={assignDueDate}
                      onChange={(e) => setAssignDueDate(e.target.value)}
                      className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                    />
                  </div>
                  <input
                    type="text"
                    value={assignInstructions}
                    onChange={(e) => setAssignInstructions(e.target.value)}
                    placeholder="Instructions de traitement..."
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-500"
                  >
                    Affecter le dossier &amp; notifier par e-mail
                  </button>
                </form>
              )}

              {/* Direct Treatment Completion without workflow */}
              {actionLock.allowedActions.includes('COMPLETE_DIRECT_TREATMENT') && (
                <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
                  <p className="text-xs font-semibold">Traitement direct affecté à votre compte</p>
                  <textarea
                    rows={2}
                    value={decisionNote}
                    onChange={(e) => setDecisionNote(e.target.value)}
                    placeholder="Compte rendu ou observations de traitement..."
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                  />
                  <button
                    type="button"
                    onClick={handleCompleteDirect}
                    className="px-4 py-2 rounded-lg bg-slate-900 dark:bg-blue-600 text-white text-xs font-semibold"
                  >
                    Terminer le traitement &amp; Retourner au Secrétariat
                  </button>
                </div>
              )}

              {/* Workflow Step Decision Controls */}
              {activeStep && (
                <div className="space-y-4 pt-2 border-t border-slate-200 dark:border-slate-800">
                  <p className="text-xs font-semibold">
                    Étape active : <span className="text-blue-700 dark:text-blue-400">{activeStep.step_name}</span>
                  </p>
                  <textarea
                    rows={2}
                    value={decisionNote}
                    onChange={(e) => setDecisionNote(e.target.value)}
                    placeholder="Observations, motif de rejet ou instructions de correction..."
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                  />

                  {/* Digital Signature & Official Stamp Pad for President and Department Heads (Responsables), excluding Agents */}
                  {(actionLock.requiresPresidentSignature || (actionLock.canSign && user?.role !== 'AGENT')) && (
                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-indigo-200 dark:border-indigo-900 space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <PenTool className="w-4 h-4 text-indigo-700 dark:text-indigo-400" />
                          <p className="text-xs font-bold text-slate-900 dark:text-white">
                            Signature numérique &amp; Cachet officiel ({user?.role === 'PRESIDENT' ? 'Président' : 'Responsable de service'})
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => onNavigate('profile')}
                          className="text-[11px] text-blue-700 dark:text-blue-400 hover:underline font-medium"
                        >
                          Configurer dans Mon profil
                        </button>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setSigMode('SAVED')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                            sigMode === 'SAVED'
                              ? 'bg-slate-900 text-white border-slate-900 dark:bg-blue-600 dark:border-blue-600'
                              : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700'
                          }`}
                        >
                          Utiliser signature &amp; cachet du profil
                        </button>
                        <button
                          type="button"
                          onClick={() => setSigMode('DRAW')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                            sigMode === 'DRAW'
                              ? 'bg-slate-900 text-white border-slate-900 dark:bg-blue-600 dark:border-blue-600'
                              : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700'
                          }`}
                        >
                          Signer à la main ici
                        </button>
                      </div>

                      {sigMode === 'SAVED' ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                            <p className="text-[11px] text-slate-500 mb-1.5">Signature numérique enregistrée</p>
                            {currentUserSignAssets?.signatureImage ? (
                              <img
                                src={currentUserSignAssets.signatureImage}
                                alt="Signature Président"
                                className="h-16 object-contain bg-white rounded"
                              />
                            ) : (
                              <p className="text-xs text-amber-700">
                                Aucune signature enregistrée. Passez sur &laquo; Signer à la main ici &raquo; ou configurez-la dans Mon profil.
                              </p>
                            )}
                          </div>
                          <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                            <p className="text-[11px] text-slate-500 mb-1.5">Image du cachet officiel</p>
                            {effectiveSavedStamp ? (
                              <img
                                src={effectiveSavedStamp}
                                alt="Cachet officiel"
                                className="h-16 object-contain bg-white rounded"
                              />
                            ) : (
                              <p className="text-xs text-slate-500">Aucun cachet configuré.</p>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-[11px] text-slate-500">
                            <span>Tracez votre signature avec la souris ou le doigt :</span>
                            <button
                              type="button"
                              onClick={clearSigCanvas}
                              className="inline-flex items-center gap-1 text-slate-700 dark:text-slate-300 hover:underline"
                            >
                              <Eraser className="w-3 h-3" />
                              <span>Effacer</span>
                            </button>
                          </div>
                          <div className="rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-700 bg-white overflow-hidden">
                            <canvas
                              ref={sigCanvasRef}
                              width={520}
                              height={140}
                              onPointerDown={startSigDraw}
                              onPointerMove={moveSigDraw}
                              onPointerUp={endSigDraw}
                              onPointerCancel={endSigDraw}
                              className="w-full h-32 touch-none cursor-crosshair block"
                            />
                          </div>
                        </div>
                      )}

                      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                        <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
                          <input
                            type="checkbox"
                            checked={includeStamp}
                            onChange={(e) => setIncludeStamp(e.target.checked)}
                            className="rounded border-slate-300"
                          />
                          <Stamp className="w-3.5 h-3.5 text-indigo-600" />
                          <span>Apposer l’image du cachet officiel</span>
                        </label>
                        {includeStamp && (
                          <label className="inline-flex items-center gap-1 text-[11px] text-blue-700 dark:text-blue-400 cursor-pointer hover:underline">
                            <Upload className="w-3 h-3" />
                            <span>Importer un autre cachet</span>
                            <input type="file" accept="image/*" onChange={handleUploadCustomStamp} className="hidden" />
                          </label>
                        )}
                      </div>
                    </div>
                  )}

                  {actionLock.activeDelegation && (
                    <div className="p-3.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 space-y-1">
                      <p className="font-bold flex items-center gap-1.5">
                        <Stamp className="w-4 h-4 text-amber-600" />
                        Signature autorisée par délégation présidentielle
                      </p>
                      <p>
                        Délégué par : <span className="font-semibold">{actionLock.activeDelegation.delegatorName}</span> (Président) au profit de{' '}
                        <span className="font-semibold">{actionLock.activeDelegation.delegateName}</span>.
                      </p>
                      <p className="text-[11px] text-amber-700 dark:text-amber-300">
                        Validité jusqu’au {actionLock.activeDelegation.endDate}
                        {actionLock.activeDelegation.restrictions ? ` · Restrictions : ${actionLock.activeDelegation.restrictions}` : ''}
                      </p>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {actionLock.allowedActions.includes('TRANSMETTRE') && !actionLock.allowedActions.includes('APPROUVER') ? (
                      <button
                        type="button"
                        onClick={() => handleDecision('TRANSMETTRE')}
                        className="px-3.5 py-2 rounded-lg bg-slate-900 dark:bg-blue-600 text-white text-xs font-semibold"
                      >
                        Transmettre l’étape suivante
                      </button>
                    ) : (
                      <>
                        {actionLock.allowedActions.includes('DONNER_AVIS') && (
                          <button
                            type="button"
                            onClick={() => handleDecision('DONNER_AVIS')}
                            className="px-3.5 py-2 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-500"
                          >
                            Donner mon avis
                          </button>
                        )}
                        {actionLock.allowedActions.includes('APPROUVER') && (
                          <button
                            type="button"
                            onClick={() => handleDecision('APPROUVER')}
                            className="px-3.5 py-2 rounded-lg bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-600"
                          >
                            {actionLock.requiresPresidentSignature
                              ? actionLock.activeDelegation
                                ? 'Signer par délégation du Président & Approuver'
                                : 'Signer numériquement, apposer le cachet & Approuver'
                              : user?.role === 'RESPONSABLE'
                                ? 'Signer / Valider & Transmettre'
                                : 'Valider / Transmettre'}
                          </button>
                        )}
                        {actionLock.allowedActions.includes('DEMANDER_CORRECTION') && (
                          <button
                            type="button"
                            onClick={() => handleDecision('DEMANDER_CORRECTION')}
                            className="px-3.5 py-2 rounded-lg border border-amber-500 text-amber-700 dark:text-amber-400 text-xs font-semibold"
                          >
                            Demander correction
                          </button>
                        )}
                        {actionLock.allowedActions.includes('REJETER') && (
                          <button
                            type="button"
                            onClick={() => handleDecision('REJETER')}
                            className="px-3.5 py-2 rounded-lg border border-red-500 text-red-700 dark:text-red-400 text-xs font-semibold"
                          >
                            Rejeter
                          </button>
                        )}
                        {actionLock.allowedActions.includes('CLASSER_SANS_SUITE') && (
                          <button
                            type="button"
                            onClick={() => handleDecision('CLASSER_SANS_SUITE')}
                            className="px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium"
                          >
                            Classer sans suite
                          </button>
                        )}
                        {actionLock.allowedActions.includes('REPRENDRE') && (
                          <button
                            type="button"
                            onClick={() => handleDecision('REPRENDRE')}
                            className="px-3.5 py-2 rounded-lg border border-blue-500 text-blue-700 text-xs font-medium"
                          >
                            Reprendre
                          </button>
                        )}
                        {actionLock.allowedActions.includes('SUSPENDRE') && (
                          <button
                            type="button"
                            onClick={() => handleDecision('SUSPENDRE')}
                            className="px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium"
                          >
                            Suspendre
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Secretariat Final Dispatch & Archive Controls ONLY when canDispatchOrArchive */}
              {actionLock.canDispatchOrArchive && (
                <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-4">
                  <form onSubmit={handleDispatch} className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50 space-y-3">
                    <p className="text-xs font-semibold flex items-center gap-1.5">
                      <Send className="w-4 h-4 text-indigo-600" />
                      <span>Contrôle final Secrétariat &amp; Enregistrement de l’expédition</span>
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <select
                        value={dispatchForm.dispatchMode}
                        onChange={(e) => setDispatchForm({ ...dispatchForm, dispatchMode: e.target.value })}
                        className="px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                      >
                        <option value="COURSIER">Coursier / Bordereau</option>
                        <option value="POSTE">Poste recommandée</option>
                        <option value="EMAIL">E-mail officiel</option>
                        <option value="REMISE_MAIN_PROPRE">Remise en main propre</option>
                      </select>
                      <input
                        type="text"
                        placeholder="N° preuve / suivi..."
                        value={dispatchForm.trackingRef}
                        onChange={(e) => setDispatchForm({ ...dispatchForm, trackingRef: e.target.value })}
                        className="px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono"
                      />
                      <input
                        type="text"
                        placeholder="Destinataire / Notes..."
                        value={dispatchForm.notes}
                        onChange={(e) => setDispatchForm({ ...dispatchForm, notes: e.target.value })}
                        className="px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="submit"
                        className="px-3.5 py-2 rounded-lg bg-indigo-700 text-white text-xs font-semibold hover:bg-indigo-600"
                      >
                        Enregistrer l’expédition
                      </button>
                      <button
                        type="button"
                        onClick={handleArchive}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 dark:bg-slate-700 text-white text-xs font-semibold"
                      >
                        <Archive className="w-3.5 h-3.5" />
                        <span>Clôturer &amp; Archiver</span>
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </section>
          )}

          {/* Affixed Digital Signatures & Official Stamps */}
          {signatures.length > 0 && (
            <section className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-900 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-base font-bold flex items-center gap-2">
                  <Stamp className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                  <span>Signatures numériques &amp; Cachets officiels apposés ({signatures.length})</span>
                </h2>
                <span className="text-[11px] text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                  Signature interne d’entreprise (intégration prestataire certifié eIDAS disponible)
                </span>
              </div>
              <div className="space-y-4">
                {signatures.map((sig) => (
                  <div
                    key={sig.id}
                    className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-3">
                        {sig.signer_avatar_url && (
                          <img
                            src={sig.signer_avatar_url}
                            alt={sig.signer_name}
                            className="w-10 h-10 rounded-full object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                          />
                        )}
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-bold text-slate-900 dark:text-white">
                              {sig.signer_name} — {sig.signer_title}
                            </p>
                            {sig.is_delegated === 1 ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
                                SIGNATURE PAR DÉLÉGATION DU PRÉSIDENT
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
                                SIGNATURE DIRECTE DU PRÉSIDENT
                              </span>
                            )}
                          </div>
                          {sig.is_delegated === 1 && (
                            <p className="text-[11px] font-medium text-amber-700 dark:text-amber-400 mt-0.5">
                              Pour ordre et au nom de : {sig.represented_name} ({sig.represented_role}) · Réf. délégation : {sig.delegation_id}
                            </p>
                          )}
                          <p className="font-mono text-[11px] text-slate-500 mt-0.5">
                            Signé le {sig.signed_at.slice(0, 16)} · Empreinte d’intégrité : {sig.signature_hash.slice(0, 28)}...
                          </p>
                        </div>
                      </div>
                      <span className="font-mono text-[11px] text-emerald-700 dark:text-emerald-400 font-semibold">
                        SIGNÉ &amp; VISÉ
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-6 p-3 rounded-lg bg-white border border-slate-200">
                      <img
                        src={sig.signature_image}
                        alt={`Signature de ${sig.signer_name}`}
                        className="h-20 object-contain"
                      />
                      {sig.stamp_image && (
                        <img
                          src={sig.stamp_image}
                          alt="Cachet officiel apposé"
                          className="h-24 w-24 object-contain"
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* AI Summaries & OCR Trace */}
          {aiAnalyses.length > 0 && (
            <section className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-base font-bold">Résumé &amp; Extraction IA</h2>
                <span className="text-xs font-mono text-slate-500">
                  {aiAnalyses[0].is_simulated === 1 ? 'Analyse de démonstration simulée' : 'Analyse IA certifiée'}
                </span>
              </div>
              <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">{aiAnalyses[0].short_summary}</p>
              {aiAnalyses[0].detailed_summary && (
                <p className="text-xs text-slate-500 dark:text-slate-400 whitespace-pre-line pt-2 border-t border-slate-100 dark:border-slate-800">
                  {aiAnalyses[0].detailed_summary}
                </p>
              )}
              {aiAnalyses[0].ocr_text && (
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                  <details className="text-xs text-slate-600 dark:text-slate-300">
                    <summary className="cursor-pointer font-bold text-blue-700 dark:text-blue-400 hover:underline">
                      📄 Afficher le texte intégral extrait par OCR du courrier
                    </summary>
                    <div className="mt-2 p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 max-h-60 overflow-y-auto font-mono text-[11px] whitespace-pre-wrap leading-relaxed">
                      {aiAnalyses[0].ocr_text}
                    </div>
                  </details>
                </div>
              )}
              {aiAnalyses[0].validated_by_name && (
                <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
                  Vérifié et validé humainement par {aiAnalyses[0].validated_by_name}
                </p>
              )}
            </section>
          )}

          {/* Documents & Versions â€” with Inline Preview */}
          <section className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-base font-bold">Documents associés ({documents.length})</h2>
              {actionLock.canAct && actionLock.canUploadDocument && (
                <div className="flex items-center gap-2">
                  <select
                    value={docKind}
                    onChange={(e) => setDocKind(e.target.value)}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                  >
                    <option value="PROJET_REPONSE">Projet de réponse</option>
                    <option value="REPONSE_DEFINITIVE">Réponse définitive</option>
                    <option value="PIECE_JOINTE">Pièce jointe</option>
                    <option value="PREUVE_EXPEDITION">Preuve d&#39;expédition</option>
                    <option value="JUSTIFICATIF">Justificatif</option>
                  </select>
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Joindre</span>
                    <input type="file" accept=".pdf,image/*" onChange={handleUploadDoc} className="hidden" />
                  </label>
                </div>
              )}
            </div>

            {documents.length === 0 ? (
              <p className="text-xs text-slate-500">Aucun document joint pour ce dossier.</p>
            ) : (
              <div className="space-y-3">
                {documents.map((doc) => (
                  <div key={doc.id} className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                    <div className="py-2.5 px-3 flex items-center justify-between gap-4 text-xs bg-slate-50 dark:bg-slate-800/60">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                        <div className="min-w-0">
                          <p className="font-medium text-slate-900 dark:text-white truncate">{doc.filename}</p>
                          <p className="text-slate-500">
                            {doc.doc_kind} · v{doc.version} · {Math.max(1, Math.round(doc.size_bytes / 1024))} Ko
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => toggleDocPreview(doc.id)}
                          className={`inline-flex items-center gap-1 font-medium hover:underline ${
                            previewDocId === doc.id
                              ? 'text-amber-700 dark:text-amber-400'
                              : 'text-indigo-700 dark:text-indigo-400'
                          }`}
                        >
                          {previewDocId === doc.id ? (
                            <>
                              <EyeOff className="w-3.5 h-3.5" />
                              <span>Fermer</span>
                            </>
                          ) : (
                            <>
                              <Eye className="w-3.5 h-3.5" />
                              <span>Visualiser</span>
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            downloadAuthenticatedFile(`/api/documents/${doc.id}/file`, doc.filename).catch((err) =>
                              setError(err instanceof Error ? err.message : 'Erreur téléchargement')
                            );
                          }}
                          className="inline-flex items-center gap-1 text-blue-700 dark:text-blue-400 font-medium hover:underline"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Télécharger</span>
                        </button>
                      </div>
                    </div>
                    {previewDocId === doc.id && (
                      <div className="border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 p-2">
                        {docLoadingId === doc.id ? (
                          <div className="flex items-center justify-center py-12 text-sm text-slate-500">
                            Chargement de l&#39;aperçu…
                          </div>
                        ) : docBlobUrls[doc.id] ? (
                          <div className="relative max-h-[600px] overflow-auto rounded border border-slate-100 dark:border-slate-800">
                            {doc.mime_type?.startsWith('image/') || doc.filename.endsWith('.svg') ? (
                              <img
                                src={docBlobUrls[doc.id]}
                                alt={doc.filename}
                                className="w-full h-auto object-contain"
                              />
                            ) : doc.mime_type === 'application/pdf' ? (
                              <iframe
                                src={docBlobUrls[doc.id]}
                                title={doc.filename}
                                className="w-full min-h-[500px] border-0"
                              />
                            ) : (
                              <div className="p-4 text-xs text-slate-500 text-center">
                                Format non supporté pour l&#39;aperçu en ligne ({doc.mime_type}).
                                Veuillez télécharger le fichier.
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center justify-center py-8 text-sm text-red-500">
                            Échec de chargement de l&#39;aperçu
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Draft Response Editor */}
          {/* Projet de Réponse / Document de travail — Vrai Éditeur Word Pro avec Insertion de Signature */}
          {(mail.direction === 'ENTRANT' || (mail as unknown as { requires_response?: number }).requires_response === 1) && (
            <section
              className={`rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 transition-all ${
                isEditorFullscreen
                  ? 'fixed inset-4 z-50 shadow-2xl flex flex-col p-6 overflow-hidden'
                  : 'p-6 space-y-4'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/50 text-blue-600 flex items-center justify-center font-bold">
                    <FileEdit className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="font-display text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <span>Éditeur Word — Projet de Réponse &amp; Document Officiel</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 font-bold uppercase tracking-wider">
                        Style Word
                      </span>
                    </h2>
                    <p className="text-[11px] text-slate-500">
                      Rédigez, soulignez, structurez la lettre de réponse et insérez votre signature numérique.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {draftSaved && (
                    <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-1 rounded">
                      <CheckCircle2 className="w-3 h-3" /> Enregistré
                    </span>
                  )}
                  {draftSaving && (
                    <span className="text-[11px] font-mono text-blue-600 dark:text-blue-400 animate-pulse bg-blue-50 px-2 py-1 rounded">
                      Sauvegarde en cours…
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={exportDraftAsDoc}
                    title="Télécharger au format Word (.doc)"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-700"
                  >
                    <FileDown className="w-3.5 h-3.5 text-blue-600" />
                    <span>Exporter Word</span>
                  </button>

                  <button
                    type="button"
                    onClick={printDraftDoc}
                    title="Imprimer ou enregistrer en PDF"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-700"
                  >
                    <Printer className="w-3.5 h-3.5 text-slate-600" />
                    <span>Imprimer</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsEditorFullscreen(!isEditorFullscreen)}
                    title={isEditorFullscreen ? 'Réduire' : 'Plein écran'}
                    className="p-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-700"
                  >
                    {isEditorFullscreen ? <Minimize2 className="w-4 h-4 text-blue-600" /> : <Maximize2 className="w-4 h-4 text-slate-600" />}
                  </button>
                </div>
              </div>

              {actionLock.canAct && (
                <div className="space-y-2">
                  {/* Word Toolbar Row 1: Formatting & Styles */}
                  <div className="flex flex-wrap items-center gap-1 p-2 rounded-xl bg-slate-100/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs">
                    {/* Undo / Redo */}
                    <button type="button" onClick={() => execDraftCommand('undo')} title="Annuler" className="p-1.5 rounded hover:bg-white dark:hover:bg-slate-700">
                      <Undo className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" onClick={() => execDraftCommand('redo')} title="Rétablir" className="p-1.5 rounded hover:bg-white dark:hover:bg-slate-700">
                      <Redo className="w-3.5 h-3.5" />
                    </button>

                    <div className="w-px h-5 bg-slate-300 dark:bg-slate-600 mx-1" />

                    {/* Font family */}
                    <select
                      value={editorFontFamily}
                      onChange={(e) => {
                        setEditorFontFamily(e.target.value);
                        execDraftCommand('fontName', e.target.value);
                      }}
                      className="px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs font-medium"
                    >
                      <option value="Arial, sans-serif">Arial</option>
                      <option value="'Times New Roman', serif">Times New Roman</option>
                      <option value="'Plus Jakarta Sans', sans-serif">Jakarta Sans</option>
                      <option value="'JetBrains Mono', monospace">Courrier / Mono</option>
                    </select>

                    {/* Font size */}
                    <select
                      value={editorFontSize}
                      onChange={(e) => {
                        setEditorFontSize(e.target.value);
                        execDraftCommand('fontSize', e.target.value);
                      }}
                      className="px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs font-medium"
                    >
                      <option value="1">10 pt (Petit)</option>
                      <option value="2">11 pt</option>
                      <option value="3">12 pt (Standard)</option>
                      <option value="4">14 pt (Sous-titre)</option>
                      <option value="5">18 pt (Titre)</option>
                      <option value="6">24 pt (Grand)</option>
                    </select>

                    <div className="w-px h-5 bg-slate-300 dark:bg-slate-600 mx-1" />

                    {/* Style buttons */}
                    <button type="button" onClick={() => execDraftCommand('bold')} title="Gras (Ctrl+B)" className="p-1.5 rounded hover:bg-white dark:hover:bg-slate-700 font-bold">
                      <Bold className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" onClick={() => execDraftCommand('italic')} title="Italique (Ctrl+I)" className="p-1.5 rounded hover:bg-white dark:hover:bg-slate-700">
                      <Italic className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" onClick={() => execDraftCommand('underline')} title="Souligné (Ctrl+U)" className="p-1.5 rounded hover:bg-white dark:hover:bg-slate-700 underline font-bold bg-white/60 dark:bg-slate-700/60">
                      <Underline className="w-3.5 h-3.5 text-blue-700 dark:text-blue-400" />
                    </button>
                    <button type="button" onClick={() => execDraftCommand('strikeThrough')} title="Barré" className="p-1.5 rounded hover:bg-white dark:hover:bg-slate-700 line-through text-xs font-bold">
                      S
                    </button>

                    <div className="w-px h-5 bg-slate-300 dark:bg-slate-600 mx-1" />

                    {/* Alignments */}
                    <button type="button" onClick={() => execDraftCommand('justifyLeft')} title="Aligner à gauche" className="p-1.5 rounded hover:bg-white dark:hover:bg-slate-700">
                      <AlignLeft className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" onClick={() => execDraftCommand('justifyCenter')} title="Centrer" className="p-1.5 rounded hover:bg-white dark:hover:bg-slate-700">
                      <AlignCenter className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" onClick={() => execDraftCommand('justifyRight')} title="Aligner à droite" className="p-1.5 rounded hover:bg-white dark:hover:bg-slate-700">
                      <AlignRight className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" onClick={() => execDraftCommand('justifyFull')} title="Justifier" className="p-1.5 rounded hover:bg-white dark:hover:bg-slate-700">
                      <AlignJustify className="w-3.5 h-3.5" />
                    </button>

                    <div className="w-px h-5 bg-slate-300 dark:bg-slate-600 mx-1" />

                    {/* Lists */}
                    <button type="button" onClick={() => execDraftCommand('insertUnorderedList')} title="Liste à puces" className="p-1.5 rounded hover:bg-white dark:hover:bg-slate-700">
                      <List className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" onClick={() => execDraftCommand('insertOrderedList')} title="Liste numérotée" className="p-1.5 rounded hover:bg-white dark:hover:bg-slate-700">
                      <ListOrdered className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Word Toolbar Row 2: Insérer des blocs administratifs & Signatures */}
                  <div className="flex flex-wrap items-center gap-2 p-2 rounded-xl bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 text-xs">
                    <span className="font-extrabold uppercase tracking-wider text-[10px] text-blue-800 dark:text-blue-300">
                      Insérer dans la lettre :
                    </span>

                    <button
                      type="button"
                      onClick={insertHeaderTemplate}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-white dark:bg-slate-800 border border-blue-300 dark:border-blue-700 font-bold text-slate-800 dark:text-slate-200 hover:bg-blue-100/50"
                    >
                      <Sparkles className="w-3 h-3 text-blue-600" />
                      <span>En-tête officiel</span>
                    </button>

                    <button
                      type="button"
                      onClick={insertDateInDraft}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-white dark:bg-slate-800 border border-blue-300 dark:border-blue-700 font-bold text-slate-800 dark:text-slate-200 hover:bg-blue-100/50"
                    >
                      <Calendar className="w-3 h-3 text-slate-600" />
                      <span>Date du jour</span>
                    </button>

                    {/* Insertion de Signature du profil */}
                    {data?.currentUserSignAssets?.signatureImage && (
                      <button
                        type="button"
                        onClick={() =>
                          insertSignatureInDraft(
                            data.currentUserSignAssets!.signatureImage,
                            user?.fullName || 'Le Responsable',
                            user?.role === 'PRESIDENT' ? 'Le Président Directeur Général' : 'Le Responsable de Service'
                          )
                        }
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-sm"
                      >
                        <PenTool className="w-3 h-3" />
                        <span>Insérer ma signature numérique</span>
                      </button>
                    )}

                    {/* Insertion du cachet d'entreprise */}
                    {(data?.currentUserSignAssets?.stampImage || data?.currentUserSignAssets?.companyStampImage) && (
                      <button
                        type="button"
                        onClick={() => {
                          const stampUrl = data.currentUserSignAssets?.stampImage || data.currentUserSignAssets?.companyStampImage;
                          if (!stampUrl) return;
                          const stampHtml = `<img src="${stampUrl}" alt="Cachet officiel" style="max-height: 90px; max-width: 140px; display: inline-block; vertical-align: middle; margin-left: 15px;" />`;
                          document.execCommand('insertHTML', false, stampHtml);
                          handleDraftInput();
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-white dark:bg-slate-800 border border-indigo-300 dark:border-indigo-700 font-bold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50"
                      >
                        <Stamp className="w-3 h-3 text-indigo-600" />
                        <span>Insérer le cachet officiel</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Document Page Canvas (simulant une vraie feuille A4 Word) */}
              <div
                className={`w-full overflow-y-auto bg-slate-100 dark:bg-slate-950 p-4 sm:p-6 rounded-xl flex justify-center ${
                  isEditorFullscreen ? 'flex-1' : 'min-h-[420px] max-h-[640px]'
                }`}
              >
                <div
                  ref={draftEditorRef}
                  contentEditable={actionLock.canAct}
                  suppressContentEditableWarning
                  onInput={handleDraftInput}
                  style={{ fontFamily: editorFontFamily }}
                  className={`w-full max-w-[800px] min-h-[500px] p-8 sm:p-12 bg-white dark:bg-slate-900 shadow-md border border-slate-300 dark:border-slate-700 rounded-sm text-sm text-slate-900 dark:text-slate-100 leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
                    !actionLock.canAct ? 'opacity-85 cursor-not-allowed' : ''
                  }`}
                  dangerouslySetInnerHTML={{ __html: draftHtml }}
                />
              </div>

              {/* Editor Footer: Save & Status */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-3">
                  {actionLock.canAct ? (
                    <button
                      type="button"
                      onClick={handleSaveDraft}
                      disabled={draftSaving}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-500 transition-colors shadow-sm disabled:opacity-50"
                    >
                      <Save className="w-4 h-4" />
                      <span>{draftSaving ? 'Sauvegarde…' : 'Sauvegarder le projet de réponse'}</span>
                    </button>
                  ) : (
                    <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">
                      🔒 Lecture seule : Ce dossier est actuellement en cours de traitement chez un autre intervenant.
                    </p>
                  )}
                </div>

                {(mail as unknown as { draft_response_updated_by?: string }).draft_response_updated_by && (
                  <p className="text-[11px] text-slate-500 text-right">
                    Dernière modification par{' '}
                    <span className="font-bold">{(mail as unknown as { draft_response_updated_by?: string }).draft_response_updated_by}</span>
                    {' · '}
                    {((mail as unknown as { draft_response_updated_at?: string }).draft_response_updated_at || '').slice(0, 16)}
                  </p>
                )}
              </div>
            </section>
          )}
        </div>

        {/* RIGHT COLUMN: Department Emails Dispatched, Comments & Audit Trail */}
        <div className="lg:col-span-5 space-y-6">
          {/* Department Head Email Dispatches */}
          <section className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center gap-2">
              <MailCheck className="w-4 h-4 text-emerald-600" />
              <h2 className="font-display text-base font-bold">E-mails de notification envoyés ({emailLogs.length})</h2>
            </div>
            {emailLogs.length === 0 ? (
              <p className="text-xs text-slate-500">
                Aucun e-mail de notification automatique n’a encore été déclenché pour ce courrier.
              </p>
            ) : (
              <div className="space-y-2.5">
                {emailLogs.map((e) => (
                  <div key={e.id} className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 text-xs space-y-1">
                    <p className="font-semibold text-slate-900 dark:text-white">{e.subject}</p>
                    <p className="text-slate-600 dark:text-slate-300">
                      Destinataire {e.department_name ? `(${e.department_name})` : ''} : {e.recipient_name} &lt;{e.recipient_email}&gt;
                    </p>
                    <p className={`font-mono text-[11px] ${e.delivery_status === 'SENT_SMTP' ? 'text-emerald-700 dark:text-emerald-400' : e.delivery_status === 'FAILED' ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`}>
                      {e.delivery_status === 'SENT_SMTP'
                        ? 'Envoyé avec succès via SMTP'
                        : e.delivery_status === 'FAILED'
                        ? `Échec d'envoi (${e.error_message || 'Erreur SMTP'})`
                        : 'Enregistré dans la file d’attente'} · {e.created_at.slice(0, 16)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Shipments */}
          {shipments.length > 0 && (
            <section className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
              <h2 className="font-display text-base font-bold">Preuves d’expédition</h2>
              {shipments.map((sh) => (
                <div key={sh.id} className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 text-xs space-y-1">
                  <p className="font-semibold">
                    {sh.dispatch_mode} · Réf. {sh.tracking_ref}
                  </p>
                  <p className="text-slate-500">
                    Par {sh.dispatched_by_name} le {sh.dispatched_at.slice(0, 16)}
                  </p>
                  {sh.notes && <p className="text-slate-600 dark:text-slate-300">{sh.notes}</p>}
                </div>
              ))}
            </section>
          )}

          {/* Comments */}
          <section className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
            <h2 className="font-display text-base font-bold">Observations &amp; Échanges ({comments.length})</h2>
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {comments.length === 0 ? (
                <p className="text-xs text-slate-500">Aucune observation enregistrée.</p>
              ) : (
                comments.map((c) => (
                  <div key={c.id} className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 text-xs">
                    <div className="flex items-center justify-between text-slate-500 mb-1">
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {c.user_name} ({c.user_role})
                      </span>
                      <span className="font-mono">{c.created_at.slice(0, 16)}</span>
                    </div>
                    <p className="text-slate-700 dark:text-slate-200">{c.content}</p>
                  </div>
                ))
              )}
            </div>
            {actionLock.canAct ? (
              <form onSubmit={handleAddComment} className="space-y-2">
                <div className="flex gap-2">
                  <select
                    value={commentType}
                    onChange={(e) => setCommentType(e.target.value)}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                  >
                    <option value="OBSERVATION">Observation</option>
                    <option value="DIFFICULTY">Signaler une difficulté</option>
                    <option value="AVIS">Avis technique</option>
                  </select>
                  <input
                    type="text"
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder="Ajouter une observation..."
                    className="flex-1 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-blue-600 text-white text-xs font-semibold"
                  >
                    <MessageSquarePlus className="w-4 h-4" />
                  </button>
                </div>
              </form>
            ) : (
              <p className="text-[11px] text-slate-500">
                Ajout de commentaire désactivé : ce dossier est en lecture seule tant qu’il n’est pas à votre niveau.
              </p>
            )}
          </section>

          {/* Immutable Audit History */}
          <section className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
            <h2 className="font-display text-base font-bold">Journal de traçabilité (Audit immuable)</h2>
            <div className="space-y-2.5 max-h-72 overflow-y-auto">
              {auditLogs.map((a) => (
                <div key={a.id} className="text-xs border-b border-slate-100 dark:border-slate-800 pb-2">
                  <div className="flex justify-between font-mono text-[11px] text-slate-400">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">{a.action}</span>
                    <span>{a.created_at.slice(0, 16)}</span>
                  </div>
                  <p className="text-slate-600 dark:text-slate-300 mt-0.5">
                    {a.user_name} {a.context ? `— ${a.context}` : ''}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      {/* MODAL ARCHIVAGE AVEC PROPOSITION DE MODÈLE RÉUTILISABLE */}
      {showArchiveModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center gap-2.5 text-blue-600 dark:text-blue-400">
              <Archive className="w-5 h-5" />
              <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                Archivage &amp; Clôture du dossier
              </h3>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300">
              Le courrier <strong>{mail.reference}</strong> va être clôturé et archivé définitivement.
            </p>

            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3">
              <p className="text-xs font-semibold text-slate-900 dark:text-white">
                Souhaitez-vous enregistrer le circuit de traitement de ce courrier comme modèle réutilisable ?
              </p>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-xs cursor-pointer font-medium text-slate-800 dark:text-slate-200">
                  <input
                    type="radio"
                    name="saveAsTemplate"
                    value="OUI"
                    checked={saveAsTemplateChoice === 'OUI'}
                    onChange={() => setSaveAsTemplateChoice('OUI')}
                  />
                  <span>OUI (Créer un modèle)</span>
                </label>
                <label className="flex items-center gap-2 text-xs cursor-pointer font-medium text-slate-800 dark:text-slate-200">
                  <input
                    type="radio"
                    name="saveAsTemplate"
                    value="NON"
                    checked={saveAsTemplateChoice === 'NON'}
                    onChange={() => setSaveAsTemplateChoice('NON')}
                  />
                  <span>NON (Archiver uniquement)</span>
                </label>
              </div>

              {saveAsTemplateChoice === 'OUI' && (
                <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-700">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Nom du modèle *
                    </label>
                    <input
                      type="text"
                      required
                      value={newTemplateName}
                      onChange={(e) => setNewTemplateName(e.target.value)}
                      placeholder="Ex: Circuit de traitement des demandes de partenariat"
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Description du modèle
                    </label>
                    <input
                      type="text"
                      value={newTemplateDescription}
                      onChange={(e) => setNewTemplateDescription(e.target.value)}
                      placeholder="Usage recommandé, instructions..."
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                    />
                  </div>
                  <p className="text-[10px] text-slate-500">
                    ℹ️ Seule la structure (ordre, rôles, services, conditions) sera conservée. Les avis et validations passés ne sont jamais recopiés.
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowArchiveModal(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={confirmArchive}
                disabled={saveAsTemplateChoice === 'OUI' && !newTemplateName.trim()}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-500 disabled:opacity-50"
              >
                Confirmer l'archivage
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
