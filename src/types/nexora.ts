export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'PRESIDENT' | 'RESPONSABLE' | 'AGENT';

export type MailDirection = 'ENTRANT' | 'SORTANT' | 'INTERNE';
export type MailPriority = 'BASSE' | 'NORMALE' | 'HAUTE' | 'URGENTE';

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

export interface SignatureDelegationItem {
  id: string;
  companyId: string;
  delegatorUserId: string;
  delegatorName: string;
  delegatorRole: string;
  delegateUserId: string;
  delegateName: string;
  delegateRole: string;
  delegateJobTitle: string;
  startDate: string;
  endDate: string;
  allowedDirections: ('ENTRANT' | 'SORTANT' | 'INTERNE')[];
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

export interface CompanyInfo {
  id: string;
  legal_name: string;
  trade_name: string;
  sector: string;
  legal_form: string;
  country: string;
  city: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  tax_id: string;
  ref_prefix_in: string;
  ref_prefix_out: string;
  ref_prefix_int: string;
  retention_days: number;
  plan_id: string;
  plan_name: string;
  status: 'trial' | 'active' | 'suspended';
  trial_ends_at: string;
  trial_days_remaining: number;
  is_demo: number;
  max_users: number;
  max_storage_mb: number;
  max_mails_month: number;
  stamp_image?: string;
  logo_url?: string;
  primary_color?: string;
  rccm?: string;
  tagline?: string;
  billing_cycle?: 'MONTHLY' | 'ANNUAL';
  subscription_expires_at?: string;
}

export interface ServiceItem {
  id: string;
  company_id: string;
  name: string;
  description: string;
  manager_user_id: string | null;
  manager_name?: string | null;
  manager_email?: string | null;
  is_secretariat: number;
  reception_rules: string;
  parent_id?: string | null;
  parent_name?: string | null;
  type?: 'DEPARTEMENT' | 'SERVICE' | 'UNITE';
  member_count?: number;
  active_mail_count?: number;
}

export type CircuitType = 'SEQUENTIEL' | 'PARALLELE' | 'MIXTE';

export interface ParallelTargetItem {
  userId: string;
  userName?: string;
  role?: UserRole;
  serviceId?: string | null;
  serviceName?: string;
  isRequired?: boolean;
}

export interface CircuitStepConfig {
  stepOrder: number;
  name: string;
  stepType: string;
  mode: 'SEQUENTIAL' | 'PARALLEL';
  parallelRule?: 'ALL' | 'ANY_ONE' | 'MIN_COUNT' | 'CONSULTATIVE' | 'DESIGNATED_USER';
  minApprovals?: number;
  targetRole?: UserRole;
  targetServiceId?: string | null;
  assignedUserId?: string | null;
  assignedUserIds?: string[];
  parallelTargets?: ParallelTargetItem[];
  requiresPresident?: boolean;
  slaHours: number;
}

export interface CircuitTemplateItem {
  id: string;
  company_id: string;
  name: string;
  description: string;
  circuit_type: CircuitType;
  category: string;
  mail_direction: MailDirection;
  steps: CircuitStepConfig[];
  is_active: number;
  created_by?: string;
  created_by_name?: string;
  created_at: string;
  updated_at: string;
}

export interface ParallelInterventionRecord {
  id: string;
  workflow_step_id: string;
  workflow_instance_id: string;
  mail_id: string;
  user_id: string;
  user_name: string;
  user_role: string;
  service_id: string | null;
  service_name: string | null;
  is_required: number;
  status: 'EN_ATTENTE' | 'AVIS_RENDU' | 'VALIDE' | 'REJETE';
  decision: string;
  opinion_text: string;
  notified_at: string;
  viewed_at: string | null;
  completed_at: string | null;
}

export interface CircuitItem {
  id: string;
  name: string;
  description: string;
  category: string;
  mail_direction: MailDirection;
  current_version: number;
  is_active: number;
  steps: CircuitStepConfig[];
}

export interface MailItem {
  id: string;
  company_id: string;
  reference: string;
  direction: MailDirection;
  category: string;
  subject: string;
  description: string;
  sender_name: string;
  sender_org: string;
  recipient_name: string;
  recipient_org: string;
  external_ref: string;
  mail_date: string;
  received_at: string;
  due_date: string;
  priority: MailPriority;
  is_confidential: number;
  is_demo: number;
  requires_response: number;
  current_service_id: string | null;
  service_name?: string | null;
  assigned_agent_id: string | null;
  assigned_agent_name?: string | null;
  assigned_agent_email?: string | null;
  circuit_id: string | null;
  circuit_name?: string | null;
  mail_status: string;
  workflow_status: string;
  shipping_status: string;
  archive_status: string;
  draft_response_html?: string;
  draft_response_text?: string;
  draft_response_updated_by?: string;
  draft_response_updated_at?: string;
  ai_short_summary?: string | null;
  ai_is_simulated?: number | null;
  created_at: string;
  updated_at: string;
}

export interface AiExtractionPayload {
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
  suggestedPriority: MailPriority;
  suggestedServiceName: string;
  requiresResponse: boolean;
  uncertainFields: string[];
  readabilityWarning: string;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  audience: string;
  price_monthly_fcfa: number;
  max_users: number;
  max_storage_mb: number;
  max_mails_month: number;
  ai_enabled: number;
  features: string[];
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
  activeDelegation?: {
    id: string;
    delegatorName: string;
    delegateName: string;
    endDate: string;
    restrictions: string;
  } | null;
}

export interface MailSignatureItem {
  id: string;
  mail_id: string;
  signer_user_id: string;
  signer_name: string;
  signer_role: string;
  signer_title: string;
  signer_avatar_url?: string;
  signature_image: string;
  stamp_image: string;
  signature_hash: string;
  signed_at: string;
  is_delegated?: number;
  delegation_id?: string | null;
  represented_user_id?: string | null;
  represented_name?: string | null;
  represented_role?: string | null;
}

export type PaymentMethodCode =
  | 'CARD'
  | 'MTN_MOMO'
  | 'MOOV_MONEY'
  | 'WAVE'
  | 'ORANGE_MONEY'
  | 'CELTIIS_CASH';

export interface WestAfricaPaymentMethod {
  code: PaymentMethodCode;
  label: string;
  category: 'CARTE' | 'MOBILE_MONEY';
  countries: string[];
  ussdHint: string;
}

export interface WestAfricaCountry {
  code: string;
  name: string;
  dial: string;
}

export interface PaymentTransactionItem {
  id: string;
  plan_id: string;
  plan_name?: string;
  billing_cycle: 'MONTHLY' | 'ANNUAL';
  amount_fcfa: number;
  currency: string;
  payment_method: PaymentMethodCode;
  provider: string;
  country_code: string;
  payer_account_mask: string;
  external_tx_ref: string;
  checkout_url: string;
  receipt_number: string;
  status: string;
  mode: string;
  paid_at: string | null;
  created_at: string;
}
