import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Clock,
  CornerDownLeft,
  FileCheck2,
  PauseCircle,
  Send,
  XCircle,
} from 'lucide-react';

const STATUS_MAP: Record<string, { label: string; colorClass: string; Icon: typeof Clock }> = {
  RECU: { label: 'Reçu', colorClass: 'text-slate-700 dark:text-slate-300', Icon: Clock },
  ENREGISTRE: { label: 'Enregistré', colorClass: 'text-blue-700 dark:text-blue-400', Icon: FileCheck2 },
  EN_CIRCUIT: { label: 'En circuit', colorClass: 'text-blue-700 dark:text-blue-400', Icon: Clock },
  EN_COURS: { label: 'En cours', colorClass: 'text-blue-700 dark:text-blue-400', Icon: Clock },
  EN_ATTENTE: { label: 'En attente', colorClass: 'text-slate-600 dark:text-slate-400', Icon: Clock },
  EN_ATTENTE_CORRECTION: { label: 'À corriger', colorClass: 'text-amber-700 dark:text-amber-400', Icon: AlertTriangle },
  CORRECTION_DEMANDEE: { label: 'Correction demandée', colorClass: 'text-amber-700 dark:text-amber-400', Icon: AlertTriangle },
  A_CORRIGER: { label: 'À corriger', colorClass: 'text-amber-700 dark:text-amber-400', Icon: AlertTriangle },
  SUSPENDU: { label: 'Suspendu', colorClass: 'text-amber-700 dark:text-amber-400', Icon: PauseCircle },
  VALIDE: { label: 'Validé', colorClass: 'text-emerald-700 dark:text-emerald-400', Icon: CheckCircle2 },
  VALIDEE: { label: 'Validée', colorClass: 'text-emerald-700 dark:text-emerald-400', Icon: CheckCircle2 },
  REJETE: { label: 'Rejeté', colorClass: 'text-red-700 dark:text-red-400', Icon: XCircle },
  REJETEE: { label: 'Rejetée', colorClass: 'text-red-700 dark:text-red-400', Icon: XCircle },
  RETOUR_SECRETARIAT: { label: 'Retour Secrétariat', colorClass: 'text-indigo-700 dark:text-indigo-400', Icon: CornerDownLeft },
  CLOTURE: { label: 'Clôturé', colorClass: 'text-emerald-700 dark:text-emerald-400', Icon: CheckCircle2 },
  TERMINE: { label: 'Terminé', colorClass: 'text-emerald-700 dark:text-emerald-400', Icon: CheckCircle2 },
  TERMINEE: { label: 'Terminée', colorClass: 'text-emerald-700 dark:text-emerald-400', Icon: CheckCircle2 },
  ARCHIVE: { label: 'Archivé', colorClass: 'text-slate-600 dark:text-slate-400', Icon: Archive },
  CLASSE_SANS_SUITE: { label: 'Classé sans suite', colorClass: 'text-slate-600 dark:text-slate-400', Icon: Archive },
  A_EXPEDIER: { label: 'À expédier', colorClass: 'text-amber-700 dark:text-amber-400', Icon: Send },
  EXPEDIE: { label: 'Expédié', colorClass: 'text-emerald-700 dark:text-emerald-400', Icon: Send },
  NON_APPLICABLE: { label: 'N/A', colorClass: 'text-slate-500 dark:text-slate-500', Icon: Clock },
  NON_ARCHIVE: { label: 'Actif', colorClass: 'text-slate-600 dark:text-slate-400', Icon: Clock },
  A_TRAITER: { label: 'À traiter', colorClass: 'text-blue-700 dark:text-blue-400', Icon: Clock },
  TRANSMISE: { label: 'Transmise', colorClass: 'text-indigo-700 dark:text-indigo-400', Icon: Send },
};

export function StatusLabel({ status }: { status: string }) {
  const entry = STATUS_MAP[status] || {
    label: status,
    colorClass: 'text-slate-700 dark:text-slate-300',
    Icon: Clock,
  };
  const Icon = entry.Icon;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap shrink-0 ${entry.colorClass}`}>
      <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{entry.label}</span>
    </span>
  );
}

export function PriorityLabel({ priority }: { priority: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    URGENTE: { label: 'Urgente', cls: 'text-red-700 dark:text-red-400 font-semibold' },
    HAUTE: { label: 'Haute', cls: 'text-amber-700 dark:text-amber-400 font-semibold' },
    NORMALE: { label: 'Normale', cls: 'text-slate-700 dark:text-slate-300 font-medium' },
    BASSE: { label: 'Basse', cls: 'text-slate-500 dark:text-slate-400 font-normal' },
  };
  const item = map[priority] || map.NORMALE;
  return <span className={`text-xs whitespace-nowrap shrink-0 ${item.cls}`}>{item.label}</span>;
}
