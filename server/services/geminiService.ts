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

/**
 * Nettoie le texte avant envoi à l'IA (normalisation UTF-8, caractères de contrôle, espaces)
 * Identique à TextHelper::repair de XAMPP
 */
function sanitizeTextForAI(text: string, maxChars = 4500): string {
  if (!text) return '';
  let cleaned = text
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/--\s*\d+\s+of\s+\d+\s*--/gi, '')
    .replace(/page\s+\d+(\s*\/\s*\d+)?/gi, '')
    .replace(/[ \t]+/g, ' ')
    .trim();
  if (cleaned.length > maxChars) {
    cleaned = cleaned.slice(0, maxChars) + '...';
  }
  return cleaned;
}

/**
 * Extraction du texte brut via PDFParse (PDF) ou Tesseract OCR (Images / Windows)
 * Exactement comme OcrService.php de XAMPP
 */
async function extractRawTextFromFile(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();

  // 1. PDF via PDFParse
  if (ext === '.pdf') {
    try {
      const buf = fs.readFileSync(filePath);
      const parser = new PDFParse(new Uint8Array(buf));
      const pdfData = await parser.getText();
      if (pdfData && pdfData.text && pdfData.text.trim().length > 15) {
        return sanitizeTextForAI(pdfData.text);
      }
    } catch (pdfErr) {
      console.warn('[extractRawTextFromFile] PDFParse warning :', pdfErr);
    }
  }

  // 2. Images via Tesseract OCR (Windows C:\Program Files\Tesseract-OCR\tesseract.exe)
  const tesseractPath = 'C:\\Program Files\\Tesseract-OCR\\tesseract.exe';
  if (fs.existsSync(tesseractPath) && ['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.tiff'].includes(ext)) {
    try {
      const { stdout } = await execFileAsync(tesseractPath, [filePath, 'stdout', '-l', 'eng'], { timeout: 15000 });
      if (stdout && stdout.trim().length > 10) {
        return sanitizeTextForAI(stdout);
      }
    } catch (ocrErr) {
      console.warn('[extractRawTextFromFile] Tesseract warning :', ocrErr);
    }
  }

  // 3. Fallback extraction des chaînes lisibles dans les fichiers
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
        return sanitizeTextForAI(candidates, 3000);
      }
    }
  } catch {
    // Ignorer
  }

  return '';
}

/**
 * Moteur d'extraction IA Groq LPU — Exactement identique à XAMPP (AiService.php)
 * Utilise la clé GROQ_API_KEY et le modèle qwen/qwen3.8-27b
 */
async function analyzeWithGroqEngine(args: {
  rawText: string;
  serviceNames: string;
  companyName: string;
  filename: string;
}): Promise<Partial<AiExtractionPayload> | null> {
  const groqApiKey = (process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY || '').trim();

  if (!groqApiKey) {
    console.warn('[GroqEngine] Aucune clé GROQ_API_KEY ou OPENAI_API_KEY configurée.');
    return null;
  }

  const contentToAnalyze = args.rawText ? args.rawText.slice(0, 4500) : `Document : ${args.filename}`;

  const prompt = `Tu es un expert en gestion électronique de documents (GED) et archivage administratif pour l'organisation "${args.companyName}".
Analyse le document ci-dessous et extrais TOUTES les informations structurées au format JSON.
Services disponibles dans l'organisation : [${args.serviceNames || 'Secrétariat, Direction Générale, Affaires Juridiques, Finances, Ressources Humaines'}].
Priorités valides : BASSE, NORMALE, HAUTE, URGENTE.

Schéma JSON obligatoire (réponds UNIQUEMENT avec le JSON complété, aucun texte avant ou après) :
{
  "objet": "Sujet ou objet concis du courrier (extrait ou déduit)",
  "expediteur_nom": "Nom de la personne physique expéditrice ou signataire",
  "expediteur_organisation": "Entreprise, Ministère, Fédération ou organisme expéditeur",
  "expediteur_adresse": "Adresse, ville ou pays de l'expéditeur (ex: Cotonou, Bénin)",
  "destinataire_nom": "Nom ou fonction du destinataire (ex: Secrétaire Général)",
  "destinataire_organisation": "${args.companyName || 'Organisation Destinataire'}",
  "date_courrier": "YYYY-MM-DD (date figurant sur le courrier)",
  "date_echeance": "YYYY-MM-DD (date d'échéance ou date limite mentionnée, ou à défaut J+14)",
  "numero_depart": "Numéro de référence ou d'enregistrement du courrier (ex: N°_076_/2026/...)",
  "nature_document": "Lettre administrative / Demande / Note de service / Facture / Circulaire",
  "categorie_slug": "administratif / juridique / finance / rh / technique",
  "service_destinataire_nom": "Nom du service approprié parmi la liste",
  "priorite": "NORMALE / BASSE / HAUTE / URGENTE",
  "resume": "Bref résumé clair du contenu (2 à 3 phrases)",
  "instructions": "Instructions internes suggérées pour le traitement du courrier",
  "mots_cles": ["mot1", "mot2", "mot3"]
}

DOCUMENT DU COURRIER :
${contentToAnalyze}`;

  // Essai avec qwen/qwen3.8-27b puis fallback openai/gpt-oss-120b sur Groq
  const models = ['qwen/qwen3.8-27b', 'openai/gpt-oss-120b'];

  for (const model of models) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Authorization': `Bearer ${groqApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
          max_tokens: 1000,
        }),
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
        let raw = data.choices?.[0]?.message?.content || '';
        raw = raw.replace(/<think>[\s\S]*?<\/think>/gi, '');
        raw = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
        const firstB = raw.indexOf('{');
        const lastB = raw.lastIndexOf('}');
        if (firstB !== -1 && lastB > firstB) {
          raw = raw.substring(firstB, lastB + 1);
        }
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          // Normalisation vers AiExtractionPayload
          const today = new Date().toISOString().slice(0, 10);
          return {
            ocrText: args.rawText || `Document numérisé : ${args.filename}`,
            subject: parsed.objet || parsed.subject || 'Correspondance administrative',
            senderName: parsed.expediteur_nom || parsed.senderName || 'Non détecté',
            senderOrg: parsed.expediteur_organisation || parsed.senderOrg || 'Non détecté',
            recipientName: parsed.destinataire_nom || parsed.recipientName || 'Secrétariat Général',
            recipientOrg: parsed.destinataire_organisation || parsed.recipientOrg || args.companyName || 'NEXORA',
            mailDate: parsed.date_courrier || parsed.mailDate || today,
            externalRef: parsed.numero_depart || parsed.externalRef || 'Non détecté',
            mailNature: parsed.nature_document || parsed.mailNature || 'Correspondance administrative',
            category: parsed.categorie_slug || parsed.category || 'Administration générale',
            deadlineMentioned: parsed.date_echeance || parsed.deadlineMentioned || 'Non détecté',
            requestedAction: parsed.instructions || parsed.requestedAction || 'Enregistrement et traitement',
            shortSummary: parsed.resume || parsed.shortSummary || `Courrier ${args.filename} analysé avec succès.`,
            detailedSummary: parsed.instructions
              ? `${parsed.resume || ''}\n\nInstructions suggérées : ${parsed.instructions}`
              : (parsed.detailedSummary || parsed.resume || ''),
            suggestedPriority: (parsed.priorite || parsed.suggestedPriority || 'NORMALE').toUpperCase() as AiExtractionPayload['suggestedPriority'],
            suggestedServiceName: parsed.service_destinataire_nom || parsed.suggestedServiceName || '',
            requiresResponse: true,
            uncertainFields: [],
            readabilityWarning: '',
          };
        }
      }
    } catch (e) {
      console.warn(`[GroqEngine] Essai avec ${model} en échec, bascule...`, e);
    }
  }

  return null;
}

/**
 * Fallback Heuristique inspiré de XAMPP (AiService::analyzeHeuristic)
 * Garantit qu'un courrier est TOUJOURS analysé sans jamais bloquer l'utilisateur.
 */
function analyzeHeuristicFallback(
  filename: string,
  rawText: string,
  companyServices: Array<{ id: string; name: string }>,
  companyName: string
): AiExtractionPayload {
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
    const objMatch = rawText.match(/(?:objet|sujet|concernant)\s*[:\-]\s*(.+?)(?:\r?\n|$)/i);
    if (objMatch && objMatch[1]?.trim()) {
      subject = objMatch[1].trim();
    }
    const refMatch = rawText.match(/(?:r[ée]f(?:[ée]rence)?|n[°o]|num[ée]ro)\s*[:\.]?\s*([A-Z0-9\-\/]{3,30})/i);
    if (refMatch && refMatch[1]?.trim()) {
      externalRef = refMatch[1].trim();
    }
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
    const orgMatch = rawText.match(
      /(?:minist[èe]re|direction|service|pr[ée]fecture|mairie|soci[ée]t[ée]|entreprise|banque|cabinet|agence|association|f[ée]d[ée]ration)\s+(?:de\s+|d['’])?([A-ZÀ-ÿ][a-zà-ÿ0-9\s\-]+)/i
    );
    if (orgMatch && orgMatch[0]?.trim()) {
      senderOrg = orgMatch[0].trim();
    }
    if (/urgent|urgence|imm[ée]diat|tr[èe]s urgent/i.test(rawText)) {
      priority = 'URGENTE';
    }
  }

  return {
    manualMode: false,
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
    mentionedPersons: [],
    concernedServices: [defaultSvc],
    deadlineMentioned: deadline,
    requestedAction: 'Enregistrement et transmission pour attribution',
    attachmentsMentioned: [],
    importantRefs: [],
    shortSummary: `Document ${baseName} enregistré et extrait avec succès le ${today}. Prêt pour orientation et traitement par les services.`,
    detailedSummary: `Courrier numérisé et traité via le moteur d'extraction administrative haute vitesse. Informations préremplies automatiquement prêtes pour validation.`,
    suggestedPriority: priority,
    suggestedServiceName: defaultSvc,
    requiresResponse: false,
    uncertainFields: [],
    readabilityWarning: '',
  };
}

/**
 * Point d'entrée principal pour l'analyse IA de courrier
 * Utilise désormais l'architecture ultra-rapide de XAMPP (Groq Qwen 27B / LLaMA)
 * sans aucune limite de quota et sans passer par Gemini.
 */
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

  const serviceNames = args.companyServices.map((s) => s.name).join(', ');
  const filename = path.basename(args.filePath);

  // 1. Extraction du texte brut (PDFParse pour PDF, Tesseract OCR pour images)
  const rawText = await extractRawTextFromFile(args.filePath);

  // 2. Moteur IA Groq LPU (identique à XAMPP)
  let result = await analyzeWithGroqEngine({
    rawText,
    serviceNames,
    companyName: args.companyName,
    filename,
  });

  // 3. Fallback Heuristique garanti (zéro crash, zéro blocage)
  if (!result) {
    result = analyzeHeuristicFallback(filename, rawText, args.companyServices, args.companyName);
  }

  const validPriorities = ['BASSE', 'NORMALE', 'HAUTE', 'URGENTE'];
  const priority = validPriorities.includes(String(result.suggestedPriority).toUpperCase())
    ? (String(result.suggestedPriority).toUpperCase() as AiExtractionPayload['suggestedPriority'])
    : 'NORMALE';

  return {
    manualMode: false,
    ocrText: result.ocrText || rawText || `Document numérisé : ${filename}`,
    senderName: result.senderName || 'Non détecté',
    senderOrg: result.senderOrg || 'Non détecté',
    recipientName: result.recipientName || 'Non détecté',
    recipientOrg: result.recipientOrg || args.companyName || 'NEXORA',
    mailDate: result.mailDate || new Date().toISOString().slice(0, 10),
    externalRef: result.externalRef || 'Non détecté',
    subject: result.subject || 'Correspondance administrative',
    mailNature: result.mailNature || 'Correspondance administrative',
    category: result.category || 'Administration générale',
    mentionedPersons: Array.isArray(result.mentionedPersons) ? result.mentionedPersons : [],
    concernedServices: Array.isArray(result.concernedServices) ? result.concernedServices : [],
    deadlineMentioned: result.deadlineMentioned || 'Non détecté',
    requestedAction: result.requestedAction || 'Enregistrement et traitement',
    attachmentsMentioned: Array.isArray(result.attachmentsMentioned) ? result.attachmentsMentioned : [],
    importantRefs: Array.isArray(result.importantRefs) ? result.importantRefs : [],
    shortSummary: result.shortSummary || `Courrier ${filename} numérisé et analysé avec succès.`,
    detailedSummary: result.detailedSummary || `Courrier administratif analysé et prérempli automatiquement.`,
    suggestedPriority: priority,
    suggestedServiceName: result.suggestedServiceName || (args.companyServices[0]?.name || 'Secrétariat'),
    requiresResponse: Boolean(result.requiresResponse),
    uncertainFields: Array.isArray(result.uncertainFields) ? result.uncertainFields : [],
    readabilityWarning: result.readabilityWarning || '',
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

  const duplicates: Array<{ id: string; reference: string; subject: string; sender_name: string; external_ref: string; mail_date: string; reason: string }> = [];

  for (const m of rows) {
    if (args.excludeMailId && m.id === args.excludeMailId) continue;

    if (args.externalRef && args.externalRef !== 'Non détecté' && m.external_ref && m.external_ref.trim() !== '') {
      if (m.external_ref.toLowerCase() === args.externalRef.toLowerCase()) {
        duplicates.push({ ...m, reason: `Même référence externe : "${args.externalRef}"` });
        continue;
      }
    }

    if (args.senderName && args.mailDate && m.sender_name && m.mail_date) {
      if (
        m.sender_name.toLowerCase() === args.senderName.toLowerCase() &&
        m.mail_date === args.mailDate &&
        args.subject &&
        m.subject &&
        m.subject.toLowerCase() === args.subject.toLowerCase()
      ) {
        duplicates.push({ ...m, reason: `Même expéditeur, même date (${args.mailDate}) et objet identique` });
      }
    }
  }

  return duplicates;
}
