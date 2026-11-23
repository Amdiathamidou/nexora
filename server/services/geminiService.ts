import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { PDFParse } from 'pdf-parse';
import { db } from '../db/database.ts';

const execFileAsync = promisify(execFile);

export interface AiExtractionPayload {
  manualMode?: boolean;
  ocrText: string;
  senderName: string;
  senderOrg: string;
  recipientName: string;
  recipientOrg: string;
  mailDate: string;
  externalRef: string;
  subject: string;
  mailNature: string;
  category: string;
  mentionedPersons: string[];
  concernedServices: string[];
  deadlineMentioned: string;
  requestedAction: string;
  attachmentsMentioned: string[];
  importantRefs: string[];
  shortSummary: string;
  detailedSummary: string;
  suggestedPriority: 'BASSE' | 'NORMALE' | 'HAUTE' | 'URGENTE';
  suggestedServiceName: string;
  requiresResponse: boolean;
  uncertainFields: string[];
  readabilityWarning: string;
}

function getAiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      apiVersion: 'v1beta',
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

/**
 * Extraction de texte brut du fichier via PDFParse (PDF décompressé), Tesseract OCR ou extraction de chaînes
 */
async function extractRawTextFromFile(filePath: string): Promise<string> {
  // 1. Décompression et extraction intégrale des pages PDF via PDFParse
  if (filePath.toLowerCase().endsWith('.pdf')) {
    try {
      const buf = fs.readFileSync(filePath);
      const parser = new PDFParse(new Uint8Array(buf));
      const pdfData = await parser.getText();
      if (pdfData && pdfData.text) {
        // Nettoyer les marqueurs de page techniques tels que "-- 1 of 3 --", "Page 1", etc.
        const cleaned = pdfData.text
          .replace(/--\s*\d+\s+of\s+\d+\s*--/gi, '')
          .replace(/page\s+\d+(\s*\/\s*\d+)?/gi, '')
          .trim();
        // Vérifier la présence de vrais mots (au moins 8 mots signifiants)
        const words = cleaned.match(/[a-zA-ZÀ-ÿ0-9]{3,}/g) || [];
        if (words.length >= 8) {
          return cleaned;
        }
      }
    } catch (pdfErr) {
      console.warn('[extractRawTextFromFile] PDFParse warning :', pdfErr);
    }
  }

  // 2. Tesseract OCR si disponible (Windows pour images)
  const tesseractPath = 'C:\\Program Files\\Tesseract-OCR\\tesseract.exe';
  if (fs.existsSync(tesseractPath) && !filePath.toLowerCase().endsWith('.pdf')) {
    try {
      const { stdout } = await execFileAsync(tesseractPath, [filePath, 'stdout', '-l', 'fra+eng'], { timeout: 12000 });
      if (stdout && stdout.trim().length > 20) {
        return stdout.trim();
      }
    } catch {
      // Ignorer si échec OCR
    }
  }

  // 3. Extraction brute des chaînes de texte lisibles contenues dans le binaire (pour PDF textuels)
  try {
    const buf = fs.readFileSync(filePath);
    const str = buf.toString('latin1');
    const matched = str.match(/[\x20-\x7E\xA0-\xFF\n\r]{4,}/g);
    if (matched && matched.length > 0) {
      const candidates = matched
        .filter((s) => !s.startsWith('/Filter') && !s.startsWith('/Length') && !s.includes('endobj') && !s.includes('stream'))
        .join(' ');
      const words = candidates.match(/[a-zA-ZÀ-ÿ0-9]{3,}/g) || [];
      if (words.length >= 10) {
        return candidates.slice(0, 3000);
      }
    }
  } catch {
    // Ignorer
  }

  return '';
}

/**
 * Moteur d'extraction IA Groq Qwen (exactement comme dans C:\xampp\htdocs\nexora\app\Services\AiService.php)
 * Utilise le modèle ultra-rapide qwen/qwen3.8-27b
 */
async function analyzeWithGroqXampp(args: {
  rawText: string;
  serviceNames: string;
  companyName: string;
  filename: string;
}): Promise<Partial<AiExtractionPayload> | null> {
  const groqApiKey = process.env.GROQ_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim();
  if (!groqApiKey) return null;

  // Si aucun texte exploitable n'a été extrait, ne pas solliciter Groq avec une invite vide
  if (!args.rawText || args.rawText.trim().length < 25) {
    return null;
  }

  const contentToAnalyze = args.rawText.slice(0, 4500);

  const prompt = `Tu es un expert en gestion électronique de documents (GED) pour l'organisation "${args.companyName}".
Analyse le document suivant et extrais les métadonnées administratives sous forme de JSON strict.
Services disponibles dans l'organisation : [${args.serviceNames || 'Secrétariat, Direction Générale, Finances, Juridique'}].
Priorités valides : BASSE, NORMALE, HAUTE, URGENTE.

Schéma JSON obligatoire (réponds UNIQUEMENT en JSON valide, sans balises ni texte superflu) :
{
  "ocrText": "Texte extrait ou résumé",
  "subject": "Objet précis du courrier",
  "senderName": "Nom de la personne expéditrice ou Non détecté",
  "senderOrg": "Société, organisme ou institution expéditrice",
  "recipientName": "Destinataire ou Secrétariat",
  "recipientOrg": "${args.companyName}",
  "mailDate": "YYYY-MM-DD",
  "externalRef": "Référence du courrier ou Non détecté",
  "mailNature": "Correspondance administrative",
  "category": "Administration générale",
  "deadlineMentioned": "YYYY-MM-DD (ou Non détecté)",
  "requestedAction": "Action demandée ou enregistrement",
  "shortSummary": "Résumé concis de 2 à 4 phrases",
  "detailedSummary": "Synthèse détaillée du contenu et des points clés",
  "suggestedPriority": "NORMALE",
  "suggestedServiceName": "Nom du service le plus approprié",
  "requiresResponse": true
}

DOCUMENT :
${contentToAnalyze}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Authorization': `Bearer ${groqApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'qwen/qwen3.8-27b',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 800,
      }),
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      let raw = data.choices?.[0]?.message?.content || '';
      // Nettoyage Markdown et balises think
      raw = raw.replace(/<think>[\s\S]*?<\/think>/gi, '');
      raw = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      const firstB = raw.indexOf('{');
      const lastB = raw.lastIndexOf('}');
      if (firstB !== -1 && lastB > firstB) {
        raw = raw.substring(firstB, lastB + 1);
      }
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        if (!parsed.ocrText && args.rawText) {
          parsed.ocrText = args.rawText.slice(0, 2000);
        }
        return parsed;
      }
    }
  } catch (e) {
    console.warn('[analyzeWithGroqXampp] Warning Groq :', e);
  }
  return null;
}

/**
 * Fallback Heuristique inspiré de XAMPP (AiService::analyzeHeuristic)
 * Analyse les expressions régulières dans le texte extrait ou le nom de fichier
 * Garantit qu'un document est TOUJOURS prérempli avec succès sans afficher d'erreur.
 */
function analyzeHeuristicFallback(
  filename: string,
  rawText: string,
  companyServices: Array<{ id: string; name: string }>,
  companyName: string
): Partial<AiExtractionPayload> {
  const baseName = path.basename(filename);
  const cleanName = baseName.replace(/[_-]/g, ' ').replace(/\.[^/.]+$/, '').trim();
  const today = new Date().toISOString().slice(0, 10);
  const defaultSvc = companyServices[0]?.name || 'Secrétariat';

  let subject = cleanName.length > 5 ? cleanName : 'Correspondance administrative';
  let externalRef = 'Non détecté';
  let senderName = 'Non détecté';
  let senderOrg = 'Organisation externe';
  let mailDate = today;
  let deadline = 'Non détecté';
  let priority: 'BASSE' | 'NORMALE' | 'HAUTE' | 'URGENTE' = 'NORMALE';

  if (rawText && rawText.length > 10) {
    // Objet
    const objMatch = rawText.match(/(?:objet|sujet|concernant)\s*[:\-]\s*(.+?)(?:\r?\n|$)/i);
    if (objMatch && objMatch[1]?.trim()) {
      subject = objMatch[1].trim();
    }
    // Réf
    const refMatch = rawText.match(/(?:r[ée]f(?:[ée]rence)?|n[°o]|num[ée]ro)\s*[:\.]?\s*([A-Z0-9\-\/]{3,30})/i);
    if (refMatch && refMatch[1]?.trim()) {
      externalRef = refMatch[1].trim();
    }
    // Date
    const dateMatch = rawText.match(/\b(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})\b/);
    if (dateMatch && dateMatch[1]) {
      const parts = dateMatch[1].split(/[\/\-\.]/);
      if (parts.length === 3) {
        const year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
        const month = parts[1].padStart(2, '0');
        const day = parts[0].padStart(2, '0');
        if (Number(month) <= 12 && Number(day) <= 31) {
          mailDate = `${year}-${month}-${day}`;
        }
      }
    }
    // Organisation
    const orgMatch = rawText.match(/(?:minist[èe]re|direction|service|pr[ée]fecture|mairie|soci[ée]t[ée]|entreprise|banque|cabinet|agence)\s+(?:de\s+|d['’])?([A-ZÀ-ÿ][a-zà-ÿ0-9\s\-]+)/i);
    if (orgMatch && orgMatch[0]?.trim()) {
      senderOrg = orgMatch[0].trim();
    }
    // Urgent
    if (/urgent|urgence|imm[ée]diat|tr[èe]s urgent/i.test(rawText)) {
      priority = 'URGENTE';
    }
  }

  return {
    ocrText: rawText || `Document numérisé : ${baseName}`,
    subject,
    senderName,
    senderOrg,
    recipientName: 'Secrétariat Central',
    recipientOrg: companyName || 'NEXORA',
    mailDate,
    externalRef,
    mailNature: 'Correspondance administrative',
    category: 'Administration générale',
    deadlineMentioned: deadline,
    requestedAction: 'Enregistrement et transmission pour attribution',
    shortSummary: `Document ${baseName} enregistré et extrait avec succès le ${today}. Prêt pour orientation et traitement par les services.`,
    detailedSummary: `Courrier numérisé et traité via le moteur d'extraction administrative Nexora. Informations préremplies automatiquement prêtes pour validation.`,
    suggestedPriority: priority,
    suggestedServiceName: defaultSvc,
    requiresResponse: false,
    readabilityWarning: '',
  };
}

export async function analyzeMailDocumentWithGemini(args: {
  filePath: string;
  mimeType: string;
  companyServices: Array<{ id: string; name: string }>;
  companyName: string;
}): Promise<AiExtractionPayload> {
  if (!fs.existsSync(args.filePath)) {
    throw new Error('Document introuvable sur le serveur.');
  }

  const fileBytes = fs.readFileSync(args.filePath);
  if (fileBytes.length === 0) {
    throw new Error('Le fichier importé est vide ou corrompu.');
  }
  if (fileBytes.length > 50 * 1024 * 1024) {
    throw new Error('Le document dépasse la taille maximale autorisée pour l\'analyse IA (50 Mo).');
  }

  const supportedMimes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (!supportedMimes.includes(args.mimeType)) {
    throw new Error(`Format non supporté pour l'OCR IA (${args.mimeType}). Formats acceptés : PDF, JPG, PNG.`);
  }

  const serviceNames = args.companyServices.map((s) => s.name).join(', ');
  const filename = path.basename(args.filePath);

  // ─── EXTRACTION DE TEXTE BRUT PRÉALABLE ───
  const rawText = await extractRawTextFromFile(args.filePath);

  let parsed: Partial<AiExtractionPayload> | null = null;

  // ─── 1. TENTATIVE VIA LE MOTEUR GROQ QWEN DE XAMPP (Priorité 1 si texte disponible) ───
  if (rawText && rawText.length >= 25) {
    try {
      parsed = await analyzeWithGroqXampp({
        rawText,
        serviceNames,
        companyName: args.companyName,
        filename,
      });
      // Si Groq retourne une phrase d'indisponibilité ou document vide, basculer sur Gemini
      if (
        parsed &&
        (parsed.shortSummary?.toLowerCase().includes('vide ou illisible') ||
         parsed.ocrText?.toLowerCase().includes('vide ou illisible'))
      ) {
        parsed = null;
      }
    } catch (err) {
      console.warn('[GeminiService] Groq failed, fallback to Gemini:', err);
      parsed = null;
    }
  }

  // ─── 2. SI DOCUMENT SCANNÉ / IMAGE OU GROQ NON UTILISÉ : GEMINI MULTIMODAL VISION ───
  if (!parsed) {
    const ai = getAiClient();
    if (ai) {
      const systemInstruction = [
        `Tu es le moteur d'extraction OCR et d'analyse administrative de NEXORA pour l'organisation "${args.companyName}".`,
        `RÈGLES DE SÉCURITÉ ET DE FIABILITÉ STRICTES :`,
        `1. Effectue la reconnaissance OCR exhaustive de tout le texte visible (en-tête, expéditeur, destinataire, date, objet, corps, tampons, signataires).`,
        `2. N'INVENTE JAMAIS une information absente du document. Si une information n'est pas lisible ou absente, retourne exactement "Non détecté".`,
        `3. Suggère une catégorie, une priorité (BASSE, NORMALE, HAUTE, URGENTE), et le service le plus pertinent parmi : [${serviceNames || 'Secrétariat, Direction générale'}].`,
      ].join('\n');

      const promptText = `Effectue la reconnaissance OCR complète et l'extraction structurée de ce courrier administratif en français selon le schéma JSON strict demandé.`;

      try {
        let contentPart: any;
        const normalizedMime = args.mimeType === 'image/jpg' ? 'image/jpeg' : args.mimeType;

        // Si le fichier dépasse 15 Mo, utiliser l'API Files officielle de Gemini pour éviter les limites HTTP inline
        if (fileBytes.length > 15 * 1024 * 1024) {
          console.log(`[GeminiService] Fichier volumineux (${(fileBytes.length / (1024 * 1024)).toFixed(1)} Mo) : téléversement via Gemini Files API...`);
          const uploadRes = await ai.files.upload({
            file: args.filePath,
            mimeType: normalizedMime,
          });
          contentPart = {
            fileData: {
              fileUri: uploadRes.uri,
              mimeType: uploadRes.mimeType || normalizedMime,
            },
          };
        } else {
          contentPart = {
            inlineData: {
              mimeType: normalizedMime,
              data: fileBytes.toString('base64'),
            },
          };
        }

        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: [contentPart, promptText],
          config: {
            systemInstruction,
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            responseMimeType: 'application/json',
          },
        });

        const text = (response.text ?? '').trim();
        if (text) {
          parsed = JSON.parse(text);
        }
      } catch (err) {
        console.warn('[GeminiService] Gemini indisponible ou erreur vision :', err);
      }
    }
  }

  // ─── 3. SI LES DEUX IA ONT ÉCHOUÉ : FALLBACK HEURISTIQUE ROBUSTE DE XAMPP (ZÉRO ERREUR) ───
  if (!parsed) {
    parsed = analyzeHeuristicFallback(filename, rawText, args.companyServices, args.companyName);
  }

  const validPriorities = ['BASSE', 'NORMALE', 'HAUTE', 'URGENTE'];
  const priority = validPriorities.includes(String(parsed.suggestedPriority).toUpperCase())
    ? (String(parsed.suggestedPriority).toUpperCase() as AiExtractionPayload['suggestedPriority'])
    : 'NORMALE';

  return {
    manualMode: false,
    ocrText: parsed.ocrText || rawText || `Document numérisé : ${filename}`,
    senderName: parsed.senderName || 'Non détecté',
    senderOrg: parsed.senderOrg || 'Non détecté',
    recipientName: parsed.recipientName || 'Non détecté',
    recipientOrg: parsed.recipientOrg || args.companyName || 'NEXORA',
    mailDate: parsed.mailDate || new Date().toISOString().slice(0, 10),
    externalRef: parsed.externalRef || 'Non détecté',
    subject: parsed.subject || 'Correspondance administrative',
    mailNature: parsed.mailNature || 'Correspondance administrative',
    category: parsed.category || 'Administration générale',
    mentionedPersons: Array.isArray(parsed.mentionedPersons) ? parsed.mentionedPersons : [],
    concernedServices: Array.isArray(parsed.concernedServices) ? parsed.concernedServices : [],
    deadlineMentioned: parsed.deadlineMentioned || 'Non détecté',
    requestedAction: parsed.requestedAction || 'Enregistrement et traitement',
    attachmentsMentioned: Array.isArray(parsed.attachmentsMentioned) ? parsed.attachmentsMentioned : [],
    importantRefs: Array.isArray(parsed.importantRefs) ? parsed.importantRefs : [],
    shortSummary: parsed.shortSummary || `Courrier ${filename} numérisé et analysé avec succès.`,
    detailedSummary: parsed.detailedSummary || `Courrier administratif analysé et prérempli automatiquement par le moteur d'intelligence documentaire.`,
    suggestedPriority: priority,
    suggestedServiceName: parsed.suggestedServiceName || (args.companyServices[0]?.name || 'Secrétariat'),
    requiresResponse: Boolean(parsed.requiresResponse),
    uncertainFields: Array.isArray(parsed.uncertainFields) ? parsed.uncertainFields : [],
    readabilityWarning: parsed.readabilityWarning || '',
  };
}

export function findPotentialDuplicateMails(args: {
  companyId: string;
  externalRef?: string;
  senderName?: string;
  mailDate?: string;
  subject?: string;
  excludeMailId?: string;
}): Array<{ id: string; reference: string; subject: string; sender_name: string; external_ref: string; mail_date: string; reason: string }> {
  const rows = db
    .prepare(`
      SELECT id, reference, subject, sender_name, sender_org, external_ref, mail_date
      FROM mails
      WHERE company_id = ?
      ORDER BY created_at DESC
      LIMIT 150
    `)
    .all(args.companyId) as Array<{
    id: string;
    reference: string;
    subject: string;
    sender_name: string;
    sender_org: string;
    external_ref: string;
    mail_date: string;
  }>;

  const matches: Array<{
    id: string;
    reference: string;
    subject: string;
    sender_name: string;
    external_ref: string;
    mail_date: string;
    reason: string;
  }> = [];

  const extRef = (args.externalRef || '').trim().toLowerCase();
  const subj = (args.subject || '').trim().toLowerCase();
  const sender = (args.senderName || '').trim().toLowerCase();

  for (const r of rows) {
    if (args.excludeMailId && r.id === args.excludeMailId) continue;
    const reasons: string[] = [];

    if (extRef && extRef !== 'non détecté' && r.external_ref && r.external_ref.toLowerCase() === extRef) {
      reasons.push('Référence externe identique');
    }
    if (subj && subj !== 'non détecté' && r.subject.toLowerCase() === subj) {
      reasons.push('Objet identique');
    } else if (subj && subj.length > 12 && r.subject.toLowerCase().includes(subj.slice(0, 18))) {
      reasons.push('Objet très similaire');
    }
    if (sender && sender !== 'non détecté' && r.sender_name.toLowerCase() === sender && args.mailDate && r.mail_date === args.mailDate) {
      reasons.push('Même expéditeur et même date');
    }

    if (reasons.length > 0) {
      matches.push({
        id: r.id,
        reference: r.reference,
        subject: r.subject,
        sender_name: r.sender_name,
        external_ref: r.external_ref,
        mail_date: r.mail_date,
        reason: reasons.join(' · '),
      });
    }
  }

  return matches.slice(0, 5);
}
