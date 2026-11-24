export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'PRESIDENT' | 'RESPONSABLE' | 'AGENT';

export type MailDirection = 'ENTRANT' | 'SORTANT' | 'INTERNE';
export type MailPriority = 'BASSE' | 'NORMALE' | 'HAUTE' | 'URGENTE';

export type MailStatus =
  | 'RECU'
  | 'ENREGISTRE'
  | 'EN_CIRCUIT'
  | 'EN_ATTENTE_CORRECTION'
  | 'SUSPENDU'
  | 'VALIDE'
  | 'REJETE'
  | 'RETOUR_SECRETARIAT'
  | 'CLOTURE'
  | 'ARCHIVE'
  | 'CLASSE_SANS_SUITE';

export type WorkflowStatus =
  | 'NON_DEMARRE'
  | 'EN_COURS'
  | 'EN_ATTENTE'
  | 'TERMINE'
  | 'SUSPENDU'
  | 'ANNULE';

export type StepStatus =
  | 'EN_ATTENTE'
  | 'EN_COURS'
  | 'VALIDE'
  | 'REJETE'
  | 'CORRECTION_DEMANDEE'
  | 'TERMINE'
  | 'SUSPENDU';

export type TaskStatus =
  | 'A_TRAITER'
  | 'EN_COURS'
  | 'EN_ATTENTE'
  | 'TRANSMISE'
  | 'A_CORRIGER'
  | 'VALIDEE'
  | 'REJETEE'
  | 'TERMINEE'
  | 'ANNULEE';

export type ShippingStatus = 'NON_APPLICABLE' | 'A_EXPEDIER' | 'EXPEDIE';
export type ArchiveStatus = 'NON_ARCHIVE' | 'ARCHIVE';

export type WorkflowStepType =
  | 'SECRETARIAT_RECEPTION'
  | 'ORIENTATION'
  | 'RESPONSABLE_ASSIGN'
  | 'AGENT_TREATMENT'
  | 'RESPONSABLE_REVIEW'
  | 'PRESIDENT_VALIDATION'
  | 'PARALLEL_REVIEW'
  | 'SECRETARIAT_RETURN'
  | 'SECRETARIAT_DISPATCH_ARCHIVE';

export interface CircuitStepConfig {
  stepOrder: number;
  name: string;
  stepType: WorkflowStepType;
  mode: 'SEQUENTIAL' | 'PARALLEL';
  parallelRule?: 'ALL' | 'ANY_ONE' | 'MIN_COUNT' | 'DESIGNATED_USER';
  minApprovals?: number;
  targetRole?: UserRole;
  targetServiceId?: string | null;
  assignedUserIds?: string[];
  requiresPresident?: boolean;
  slaHours: number;
}

export interface UserPermissions {
  secretariat_receive?: boolean;
  secretariat_register?: boolean;
  secretariat_ai_analyze?: boolean;
  secretariat_orient?: boolean;
  secretariat_final_control?: boolean;
  secretariat_dispatch?: boolean;
  secretariat_archive?: boolean;
  can_view_confidential?: boolean;
  can_view_all_services?: boolean;
  can_manage_users?: boolean;
  can_manage_circuits?: boolean;
  can_export_reports?: boolean;
}

export type DelegationStatus = 'ACTIVE' | 'SUSPENDUE' | 'REVOQUEE' | 'EXPIREE';

export interface SignatureDelegation {
  id: string;
  companyId: string;
  delegatorUserId: string;
  delegatorName: string;
  delegatorRole: string;
  delegateUserId: string;
  delegateName: string;
  delegateRole: string;
  delegateJobTitle: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  allowedDirections: MailDirection[];
  allowedCategories: string[];
  restrictions: string;
  status: DelegationStatus;
  confirmedByPresident: boolean;
  confirmedAt: string | null;
  revokedAt?: string | null;
  revocationReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MailActionLockInfo {
  canAct: boolean;
  lockReason: string;
  currentHolderLabel: string;
  allowedActions: string[];
  canOrient: boolean;
  canAssignAgent: boolean;
  canUploadDocument: boolean;
  canDispatchOrArchive: boolean;
  requiresPresidentSignature: boolean;
  canSign?: boolean;
  activeDelegation?: {
    id: string;
    delegatorName: string;
    delegateName: string;
    endDate: string;
    restrictions: string;
  } | null;
}

export type CircuitKind = 'SEQUENTIEL' | 'PARALLELE' | 'MIXTE';

export interface ParallelInterventionTarget {
  userId: string;
  userName?: string;
  role?: UserRole;
  serviceId?: string | null;
  serviceName?: string;
  isRequired?: boolean; // true: obligatoire (bloquant selon règle), false: consultatif
}

export interface CustomCircuitStep {
  stepOrder: number;
  name: string;
  stepType?: string;
  mode: 'SEQUENTIAL' | 'PARALLEL';
  parallelRule?: 'ALL' | 'MIN_COUNT' | 'CONSULTATIVE' | 'ANY_ONE';
  minApprovals?: number;
  targetRole?: UserRole;
  targetServiceId?: string | null;
  assignedUserId?: string | null;
  assignedUserIds?: string[];
  parallelTargets?: ParallelInterventionTarget[];
  requiresPresident?: boolean;
  slaHours?: number;
}

export interface CircuitTemplateItem {
  id: string;
  company_id: string;
  name: string;
  description: string;
  circuit_type: CircuitKind;
  category: string;
  mail_direction: MailDirection;
  steps_json: string;
  steps?: CustomCircuitStep[];
  is_active: number;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface AuthUser {
  id: string;
  companyId: string | null;
  fullName: string;
  jobTitle: string;
  email: string;
  avatarUrl: string;
  role: UserRole;
  permissions: UserPermissions;
  isSecretariat: boolean;
  serviceIds: string[];
}
