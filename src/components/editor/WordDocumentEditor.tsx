import React, { useEffect, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import FontFamily from '@tiptap/extension-font-family';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import Highlight from '@tiptap/extension-highlight';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Calendar,
  FileDown,
  FileEdit,
  Highlighter,
  Italic,
  List,
  ListOrdered,
  Maximize2,
  Minimize2,
  Minus,
  PenTool,
  Printer,
  Redo,
  Save,
  Search,
  Sparkles,
  Stamp,
  Table as TableIcon,
  Underline as UnderlineIcon,
  Undo,
  Wand2,
} from 'lucide-react';
import { apiFetch } from '../../api/client.ts';

interface WordDocumentEditorProps {
  mailId: string;
  mailReference: string;
  mailSubject: string;
  mailSender: string;
  mailRecipient: string;
  companyName?: string;
  companyTagline?: string;
  companyAddress?: string;
  companyPhone?: string;
  companyLogoUrl?: string;
  initialHtml: string;
  canAct: boolean;
  userFullName: string;
  userTitle: string;
  savedSignatureUrl?: string;
  savedStampUrl?: string;
  onChangeHtml: (html: string, text: string) => void;
  onSaveManual: (createVersion?: boolean) => Promise<void>;
  onOpenHandSign: () => void;
  saving: boolean;
  saved: boolean;
  lastUpdatedBy?: string;
  lastUpdatedAt?: string;
}

export function WordDocumentEditor({
  mailId,
  mailReference,
  mailSubject,
  mailSender,
  mailRecipient,
  companyName,
  companyTagline,
  companyAddress,
  companyPhone,
  companyLogoUrl,
  initialHtml,
  canAct,
  userFullName,
  userTitle,
  savedSignatureUrl,
  savedStampUrl,
  onChangeHtml,
  onSaveManual,
  onOpenHandSign,
  saving,
  saved,
  lastUpdatedBy,
  lastUpdatedAt,
}: WordDocumentEditorProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fontFamily, setFontFamily] = useState('Arial, sans-serif');
  const [aiLoading, setAiLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [pageCount, setPageCount] = useState(1);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextStyle,
      Color,
      FontFamily,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: initialHtml || '',
    editable: canAct,
    onUpdate: ({ editor: ed }) => {
      const html = ed.getHTML();
      const text = ed.getText();
      onChangeHtml(html, text);
      // Estimate A4 pages (~1800 chars or ~35 lines per page)
      const estPages = Math.max(1, Math.ceil((text.length + 1) / 1800));
      setPageCount(estPages);
    },
  });

  useEffect(() => {
    if (editor && initialHtml !== undefined && editor.getHTML() !== initialHtml) {
      // Only sync if editor is empty or initial load changed externally
      if (!editor.getText().trim() && initialHtml.trim()) {
        editor.commands.setContent(initialHtml);
      }
    }
  }, [initialHtml, editor]);

  useEffect(() => {
    if (editor) {
      editor.setEditable(canAct);
    }
  }, [canAct, editor]);

  const insertHtmlBlock = (html: string) => {
    if (!editor) return;
    editor.chain().focus().insertContent(html).run();
  };

  const insertOfficialHeader = () => {
    const today = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    const logoHtml = companyLogoUrl
      ? `<img src="${companyLogoUrl}" alt="Logo" style="max-height:56px;max-width:120px;object-fit:contain;margin-bottom:6px;" />`
      : '';
    const html = `
      <table style="width:100%;border-collapse:collapse;border-bottom:2px solid #0f172a;margin-bottom:18px;">
        <tr>
          <td style="width:60%;vertical-align:top;padding-bottom:10px;">
            ${logoHtml}
            <p style="margin:0;font-weight:bold;font-size:15px;text-transform:uppercase;">${companyName || 'ORGANISATION'}</p>
            ${companyTagline ? `<p style="margin:2px 0 0 0;font-size:11px;color:#475569;">${companyTagline}</p>` : ''}
            <p style="margin:2px 0 0 0;font-size:11px;color:#64748b;">${companyAddress || ''} ${companyPhone ? '· ' + companyPhone : ''}</p>
            <p style="margin:4px 0 0 0;font-size:11px;font-weight:bold;">Réf : ${mailReference}</p>
          </td>
          <td style="width:40%;vertical-align:top;text-align:right;padding-bottom:10px;">
            <p style="margin:0;font-size:12px;">Le ${today}</p>
            <p style="margin:12px 0 0 0;font-size:12px;"><strong>À l'attention de :</strong><br/>${mailSender || mailRecipient || 'Destinataire'}</p>
          </td>
        </tr>
      </table>
      <p><strong>Objet :</strong> Réponse à votre correspondance — ${mailSubject}</p>
      <p><br/></p>
      <p>Monsieur / Madame,</p>
      <p>Nous accusons bonne réception de votre courrier cité en référence...</p>
    `;
    insertHtmlBlock(html);
  };

  const insertDateBlock = () => {
    const today = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    insertHtmlBlock(`<p style="text-align:right;">Fait le ${today}</p>`);
  };

  const insertSavedSignature = () => {
    if (!savedSignatureUrl) return;
    const html = `
      <p><br/></p>
      <p><strong>${userTitle}</strong></p>
      <p><img src="${savedSignatureUrl}" alt="Signature" style="max-height:80px;max-width:220px;" /></p>
      <p><strong>${userFullName}</strong></p>
    `;
    insertHtmlBlock(html);
  };

  const insertStamp = () => {
    if (!savedStampUrl) return;
    insertHtmlBlock(`<p><img src="${savedStampUrl}" alt="Cachet officiel" style="max-height:90px;max-width:140px;" /></p>`);
  };

  const handleAiAssist = async (action: 'GENERATE' | 'IMPROVE' | 'FIX_SPELLING' | 'FORMAL_TONE' | 'SUMMARIZE') => {
    if (!editor || aiLoading) return;
    setAiLoading(true);
    try {
      const res = await apiFetch<{ html: string }>(`/api/mails/${mailId}/ai-draft`, {
        method: 'POST',
        body: JSON.stringify({ action, currentText: editor.getText() }),
      });
      if (res.html) {
        if (action === 'GENERATE' && !editor.getText().trim()) {
          editor.commands.setContent(res.html);
        } else {
          editor.chain().focus().insertContent(res.html).run();
        }
      }
    } catch {
      // Ignore silent AI error
    } finally {
      setAiLoading(false);
    }
  };

  const exportAsDoc = () => {
    const content = editor?.getHTML() || initialHtml || '';
    const fullHtml = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>${mailReference}</title><style>body{font-family:${fontFamily};padding:2cm;line-height:1.6;}table{border-collapse:collapse;width:100%;}td,th{border:1px solid #cbd5e1;padding:6px;}</style></head><body>${content}</body></html>`;
    const blob = new Blob(['\ufeff', fullHtml], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Reponse_${mailReference.replace(/[^a-zA-Z0-9_-]/g, '_')}.doc`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const printOrPdf = () => {
    const content = editor?.getHTML() || initialHtml || '';
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`
      <html>
        <head>
          <title>Document Officiel — ${mailReference}</title>
          <style>
            @page { size: A4; margin: 20mm; }
            body { font-family: ${fontFamily}; font-size: 13px; line-height: 1.6; color: #0f172a; margin: 0; }
            table { border-collapse: collapse; width: 100%; }
            td, th { border: 1px solid #cbd5e1; padding: 6px; }
            img { max-width: 100%; }
          </style>
        </head>
        <body>
          ${content}
          <script>window.onload = function(){ window.print(); }</script>
        </body>
      </html>
    `);
    w.document.close();
  };

  return (
    <section
      className={`${
        isFullscreen
          ? 'fixed inset-0 z-50 bg-slate-100 dark:bg-slate-950 p-4 sm:p-6 overflow-y-auto flex flex-col'
          : 'p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800'
      } space-y-4`}
    >
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-sm">
            <FileEdit className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                Éditeur Word — Projet de Réponse &amp; Document Officiel
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300">
                TipTap A4 · {pageCount} page{pageCount > 1 ? 's' : ''}
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              Rédigez, soulignez, structurez la lettre et apposez votre signature (numérique ou manuscrite à la main).
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {saved && (
            <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 rounded-full">
              ✓ Sauvegardé
            </span>
          )}
          <button
            type="button"
            onClick={() => setShowSearch((v) => !v)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800"
            title="Rechercher dans le document"
          >
            <Search className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={exportAsDoc}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <FileDown className="w-3.5 h-3.5 text-blue-600" />
            <span>Word (.doc)</span>
          </button>
          <button
            type="button"
            onClick={printOrPdf}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <Printer className="w-3.5 h-3.5 text-slate-600" />
            <span>PDF / Imprimer</span>
          </button>
          <button
            type="button"
            onClick={() => setIsFullscreen((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            <span>{isFullscreen ? 'Réduire' : 'Plein écran'}</span>
          </button>
        </div>
      </div>

      {showSearch && (
        <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs">
          <Search className="w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher un mot dans le document..."
            className="flex-1 bg-transparent focus:outline-none"
          />
          {searchQuery && (
            <span className="text-[11px] text-slate-500">
              {editor?.getText().toLowerCase().split(searchQuery.toLowerCase()).length! - 1} occurrence(s)
            </span>
          )}
        </div>
      )}

      {/* Word Formatting Toolbars */}
      {canAct && editor && (
        <div className="space-y-2">
          {/* Toolbar 1: Formatting */}
          <div className="flex flex-wrap items-center gap-1 p-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs">
            <button type="button" onClick={() => editor.chain().focus().undo().run()} className="p-1.5 rounded hover:bg-white dark:hover:bg-slate-700" title="Annuler">
              <Undo className="w-3.5 h-3.5" />
            </button>
            <button type="button" onClick={() => editor.chain().focus().redo().run()} className="p-1.5 rounded hover:bg-white dark:hover:bg-slate-700" title="Rétablir">
              <Redo className="w-3.5 h-3.5" />
            </button>
            <div className="w-px h-5 bg-slate-300 dark:bg-slate-600 mx-1" />

            <select
              value={fontFamily}
              onChange={(e) => {
                setFontFamily(e.target.value);
                editor.chain().focus().setFontFamily(e.target.value).run();
              }}
              className="px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-medium"
            >
              <option value="Arial, sans-serif">Arial</option>
              <option value="'Times New Roman', serif">Times New Roman</option>
              <option value="Georgia, serif">Georgia</option>
              <option value="Calibri, sans-serif">Calibri</option>
              <option value="'Courier New', monospace">Courier New</option>
            </select>

            <div className="w-px h-5 bg-slate-300 dark:bg-slate-600 mx-1" />

            <button
              type="button"
              onClick={() => editor.chain().focus().toggleBold().run()}
              className={`p-1.5 rounded ${editor.isActive('bold') ? 'bg-blue-600 text-white' : 'hover:bg-white dark:hover:bg-slate-700'}`}
              title="Gras"
            >
              <Bold className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleItalic().run()}
              className={`p-1.5 rounded ${editor.isActive('italic') ? 'bg-blue-600 text-white' : 'hover:bg-white dark:hover:bg-slate-700'}`}
              title="Italique"
            >
              <Italic className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleUnderline().run()}
              className={`p-1.5 rounded ${editor.isActive('underline') ? 'bg-blue-600 text-white' : 'hover:bg-white dark:hover:bg-slate-700'}`}
              title="Souligné"
            >
              <UnderlineIcon className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleHighlight().run()}
              className={`p-1.5 rounded ${editor.isActive('highlight') ? 'bg-amber-400 text-slate-900' : 'hover:bg-white dark:hover:bg-slate-700'}`}
              title="Surligner"
            >
              <Highlighter className="w-3.5 h-3.5" />
            </button>

            <div className="w-px h-5 bg-slate-300 dark:bg-slate-600 mx-1" />

            <button type="button" onClick={() => editor.chain().focus().setTextAlign('left').run()} className="p-1.5 rounded hover:bg-white dark:hover:bg-slate-700" title="Aligner à gauche">
              <AlignLeft className="w-3.5 h-3.5" />
            </button>
            <button type="button" onClick={() => editor.chain().focus().setTextAlign('center').run()} className="p-1.5 rounded hover:bg-white dark:hover:bg-slate-700" title="Centrer">
              <AlignCenter className="w-3.5 h-3.5" />
            </button>
            <button type="button" onClick={() => editor.chain().focus().setTextAlign('right').run()} className="p-1.5 rounded hover:bg-white dark:hover:bg-slate-700" title="Aligner à droite">
              <AlignRight className="w-3.5 h-3.5" />
            </button>
            <button type="button" onClick={() => editor.chain().focus().setTextAlign('justify').run()} className="p-1.5 rounded hover:bg-white dark:hover:bg-slate-700" title="Justifier">
              <AlignJustify className="w-3.5 h-3.5" />
            </button>

            <div className="w-px h-5 bg-slate-300 dark:bg-slate-600 mx-1" />

            <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()} className="p-1.5 rounded hover:bg-white dark:hover:bg-slate-700" title="Liste à puces">
              <List className="w-3.5 h-3.5" />
            </button>
            <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()} className="p-1.5 rounded hover:bg-white dark:hover:bg-slate-700" title="Liste numérotée">
              <ListOrdered className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
              className="p-1.5 rounded hover:bg-white dark:hover:bg-slate-700"
              title="Insérer un tableau"
            >
              <TableIcon className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().setHorizontalRule().run()}
              className="p-1.5 rounded hover:bg-white dark:hover:bg-slate-700"
              title="Insérer une ligne"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Toolbar 2: Administrative Blocks & Signatures */}
          <div className="flex flex-wrap items-center gap-2 p-2 rounded-xl bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 text-xs">
            <span className="font-extrabold uppercase tracking-wider text-[10px] text-blue-800 dark:text-blue-300">
              Insérer :
            </span>
            <button
              type="button"
              onClick={insertOfficialHeader}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-white dark:bg-slate-800 border border-blue-300 dark:border-blue-700 font-bold hover:bg-blue-50"
            >
              <Sparkles className="w-3 h-3 text-blue-600" />
              <span>En-tête officiel</span>
            </button>
            <button
              type="button"
              onClick={insertDateBlock}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-white dark:bg-slate-800 border border-blue-300 dark:border-blue-700 font-bold hover:bg-blue-50"
            >
              <Calendar className="w-3 h-3 text-slate-600" />
              <span>Date du jour</span>
            </button>
            {savedSignatureUrl && (
              <button
                type="button"
                onClick={insertSavedSignature}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-sm"
              >
                <PenTool className="w-3 h-3" />
                <span>Insérer ma signature numérique</span>
              </button>
            )}
            <button
              type="button"
              onClick={onOpenHandSign}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-slate-900 hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-500 text-white font-bold shadow-sm"
            >
              <PenTool className="w-3 h-3" />
              <span>Signer à la main &amp; Insérer</span>
            </button>
            {savedStampUrl && (
              <button
                type="button"
                onClick={insertStamp}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-white dark:bg-slate-800 border border-indigo-300 dark:border-indigo-700 font-bold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50"
              >
                <Stamp className="w-3 h-3 text-indigo-600" />
                <span>Cachet officiel</span>
              </button>
            )}
          </div>

          {/* Toolbar 3: Optional AI Writing Assistant */}
          <div className="flex flex-wrap items-center gap-2 p-2 rounded-xl bg-purple-50/60 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-900/50 text-xs">
            <span className="inline-flex items-center gap-1 font-extrabold uppercase tracking-wider text-[10px] text-purple-800 dark:text-purple-300">
              <Wand2 className="w-3 h-3" />
              <span>Assistance IA (facultative) :</span>
            </span>
            <button
              type="button"
              disabled={aiLoading}
              onClick={() => handleAiAssist('GENERATE')}
              className="px-2.5 py-1 rounded bg-white dark:bg-slate-800 border border-purple-300 dark:border-purple-700 font-semibold hover:bg-purple-50 disabled:opacity-50"
            >
              {aiLoading ? 'Génération...' : 'Proposer un brouillon'}
            </button>
            <button
              type="button"
              disabled={aiLoading}
              onClick={() => handleAiAssist('IMPROVE')}
              className="px-2.5 py-1 rounded bg-white dark:bg-slate-800 border border-purple-300 dark:border-purple-700 font-semibold hover:bg-purple-50 disabled:opacity-50"
            >
              Améliorer la formulation
            </button>
            <button
              type="button"
              disabled={aiLoading}
              onClick={() => handleAiAssist('FIX_SPELLING')}
              className="px-2.5 py-1 rounded bg-white dark:bg-slate-800 border border-purple-300 dark:border-purple-700 font-semibold hover:bg-purple-50 disabled:opacity-50"
            >
              Corriger les fautes
            </button>
            <button
              type="button"
              disabled={aiLoading}
              onClick={() => handleAiAssist('FORMAL_TONE')}
              className="px-2.5 py-1 rounded bg-white dark:bg-slate-800 border border-purple-300 dark:border-purple-700 font-semibold hover:bg-purple-50 disabled:opacity-50"
            >
              Ton institutionnel
            </button>
          </div>
        </div>
      )}

      {/* A4 Document Canvas */}
      <div
        className={`w-full overflow-y-auto bg-slate-100 dark:bg-slate-950 p-4 sm:p-6 rounded-xl flex justify-center ${
          isFullscreen ? 'flex-1' : 'min-h-[420px] max-h-[680px]'
        }`}
      >
        <div
          style={{ fontFamily, overflowWrap: 'anywhere', wordBreak: 'break-word' }}
          className={`w-full max-w-[800px] min-h-[540px] p-8 sm:p-12 bg-white dark:bg-slate-900 shadow-md border border-slate-300 dark:border-slate-700 rounded-sm text-sm text-slate-900 dark:text-slate-100 leading-relaxed prose prose-sm dark:prose-invert max-w-none focus:outline-none ${
            !canAct ? 'opacity-85 cursor-not-allowed' : ''
          }`}
        >
          <EditorContent editor={editor} />
        </div>
      </div>

      {/* Footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
        <div className="flex flex-wrap items-center gap-2">
          {canAct ? (
            <>
              <button
                type="button"
                onClick={() => onSaveManual(false)}
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-500 transition-colors shadow-sm disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>{saving ? 'Sauvegarde…' : 'Sauvegarder le brouillon'}</span>
              </button>
              <button
                type="button"
                onClick={() => onSaveManual(true)}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 text-xs font-bold hover:bg-blue-50 dark:hover:bg-blue-950/40 disabled:opacity-50"
              >
                <span>Enregistrer une version</span>
              </button>
            </>
          ) : (
            <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">
              🔒 Lecture seule : Ce dossier est actuellement en cours de traitement chez un autre intervenant.
            </p>
          )}
        </div>

        {lastUpdatedBy && (
          <p className="text-[11px] text-slate-500 text-right">
            Dernière modification par <span className="font-bold">{lastUpdatedBy}</span> · {(lastUpdatedAt || '').slice(0, 16)}
          </p>
        )}
      </div>
    </section>
  );
}
