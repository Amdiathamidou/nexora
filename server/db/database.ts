import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.resolve(process.cwd(), 'data');
export const UPLOADS_DIR = path.resolve(DATA_DIR, 'uploads');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'nexora.db');
export const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initSchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS subscription_plans (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      audience TEXT NOT NULL,
      price_monthly_fcfa INTEGER NOT NULL,
      max_users INTEGER NOT NULL,
      max_storage_mb INTEGER NOT NULL,
      max_mails_month INTEGER NOT NULL,
      ai_enabled INTEGER NOT NULL DEFAULT 1,
      features_json TEXT NOT NULL DEFAULT '[]',
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS companies (
      id TEXT PRIMARY KEY,
      legal_name TEXT NOT NULL,
      trade_name TEXT NOT NULL,
      sector TEXT NOT NULL,
      legal_form TEXT NOT NULL,
      country TEXT NOT NULL,
      city TEXT NOT NULL,
      address TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT NOT NULL,
      website TEXT DEFAULT '',
      tax_id TEXT DEFAULT '',
      logo_url TEXT DEFAULT '',
      ref_prefix_in TEXT NOT NULL DEFAULT 'ARR',
      ref_prefix_out TEXT NOT NULL DEFAULT 'DEP',
      ref_prefix_int TEXT NOT NULL DEFAULT 'INT',
      retention_days INTEGER NOT NULL DEFAULT 3650,
      plan_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'trial',
      trial_ends_at TEXT NOT NULL,
      is_demo INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (plan_id) REFERENCES subscription_plans(id)
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      company_id TEXT,
      full_name TEXT NOT NULL,
      job_title TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      phone TEXT DEFAULT '',
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      avatar_url TEXT DEFAULT '',
      permissions_json TEXT NOT NULL DEFAULT '{}',
      reset_token TEXT DEFAULT NULL,
      reset_token_expires_at TEXT DEFAULT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS services (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      manager_user_id TEXT,
      is_secretariat INTEGER NOT NULL DEFAULT 0,
      reception_rules TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY (manager_user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS user_services (
      user_id TEXT NOT NULL,
      service_id TEXT NOT NULL,
      company_id TEXT NOT NULL,
      PRIMARY KEY (user_id, service_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS circuits (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      category TEXT NOT NULL,
      mail_direction TEXT NOT NULL,
      current_version INTEGER NOT NULL DEFAULT 1,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS circuit_versions (
      id TEXT PRIMARY KEY,
      circuit_id TEXT NOT NULL,
      company_id TEXT NOT NULL,
      version_number INTEGER NOT NULL,
      steps_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (circuit_id) REFERENCES circuits(id) ON DELETE CASCADE,
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS mails (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      reference TEXT NOT NULL,
      direction TEXT NOT NULL,
      category TEXT NOT NULL,
      subject TEXT NOT NULL,
      description TEXT DEFAULT '',
      sender_name TEXT DEFAULT '',
      sender_org TEXT DEFAULT '',
      recipient_name TEXT DEFAULT '',
      recipient_org TEXT DEFAULT '',
      external_ref TEXT DEFAULT '',
      mail_date TEXT DEFAULT '',
      received_at TEXT NOT NULL DEFAULT (datetime('now')),
      due_date TEXT DEFAULT '',
      priority TEXT NOT NULL DEFAULT 'NORMALE',
      is_confidential INTEGER NOT NULL DEFAULT 0,
      is_demo INTEGER NOT NULL DEFAULT 0,
      requires_response INTEGER NOT NULL DEFAULT 0,
      current_service_id TEXT,
      assigned_agent_id TEXT,
      circuit_id TEXT,
      circuit_version_id TEXT,
      mail_status TEXT NOT NULL DEFAULT 'RECU',
      workflow_status TEXT NOT NULL DEFAULT 'NON_DEMARRE',
      shipping_status TEXT NOT NULL DEFAULT 'NON_APPLICABLE',
      archive_status TEXT NOT NULL DEFAULT 'NON_ARCHIVE',
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(company_id, reference),
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY (current_service_id) REFERENCES services(id) ON DELETE SET NULL,
      FOREIGN KEY (assigned_agent_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (circuit_id) REFERENCES circuits(id) ON DELETE SET NULL,
      FOREIGN KEY (circuit_version_id) REFERENCES circuit_versions(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS mail_documents (
      id TEXT PRIMARY KEY,
      mail_id TEXT NOT NULL,
      company_id TEXT NOT NULL,
      doc_kind TEXT NOT NULL DEFAULT 'ORIGINAL',
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL DEFAULT 0,
      storage_path TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      uploaded_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (mail_id) REFERENCES mails(id) ON DELETE CASCADE,
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ai_analyses (
      id TEXT PRIMARY KEY,
      mail_id TEXT,
      document_id TEXT,
      company_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'COMPLETED',
      is_simulated INTEGER NOT NULL DEFAULT 0,
      ocr_text TEXT DEFAULT '',
      extracted_json TEXT NOT NULL DEFAULT '{}',
      short_summary TEXT DEFAULT '',
      detailed_summary TEXT DEFAULT '',
      suggested_category TEXT DEFAULT '',
      suggested_priority TEXT DEFAULT '',
      suggested_service_id TEXT DEFAULT '',
      suggested_circuit_id TEXT DEFAULT '',
      uncertain_fields_json TEXT NOT NULL DEFAULT '[]',
      human_corrections_json TEXT NOT NULL DEFAULT '{}',
      validated_by TEXT,
      validated_at TEXT,
      analyzed_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (mail_id) REFERENCES mails(id) ON DELETE CASCADE,
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS workflow_instances (
      id TEXT PRIMARY KEY,
      mail_id TEXT NOT NULL UNIQUE,
      company_id TEXT NOT NULL,
      circuit_id TEXT NOT NULL,
      circuit_version_id TEXT NOT NULL,
      steps_snapshot_json TEXT NOT NULL,
      current_step_index INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'EN_COURS',
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      FOREIGN KEY (mail_id) REFERENCES mails(id) ON DELETE CASCADE,
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS workflow_step_executions (
      id TEXT PRIMARY KEY,
      workflow_instance_id TEXT NOT NULL,
      mail_id TEXT NOT NULL,
      company_id TEXT NOT NULL,
      step_order INTEGER NOT NULL,
      step_name TEXT NOT NULL,
      step_type TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'SEQUENTIAL',
      status TEXT NOT NULL DEFAULT 'EN_ATTENTE',
      assigned_service_id TEXT,
      assigned_user_id TEXT,
      parallel_approvals_json TEXT NOT NULL DEFAULT '[]',
      decision TEXT DEFAULT '',
      decision_motif TEXT DEFAULT '',
      observations TEXT DEFAULT '',
      decided_by TEXT,
      decided_at TEXT,
      due_at TEXT,
      FOREIGN KEY (workflow_instance_id) REFERENCES workflow_instances(id) ON DELETE CASCADE,
      FOREIGN KEY (mail_id) REFERENCES mails(id) ON DELETE CASCADE,
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      mail_id TEXT NOT NULL,
      company_id TEXT NOT NULL,
      workflow_step_id TEXT,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      assigned_user_id TEXT,
      assigned_service_id TEXT,
      priority TEXT NOT NULL DEFAULT 'NORMALE',
      status TEXT NOT NULL DEFAULT 'A_TRAITER',
      due_date TEXT DEFAULT '',
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (mail_id) REFERENCES mails(id) ON DELETE CASCADE,
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY (assigned_user_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (assigned_service_id) REFERENCES services(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS mail_comments (
      id TEXT PRIMARY KEY,
      mail_id TEXT NOT NULL,
      company_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      comment_type TEXT NOT NULL DEFAULT 'OBSERVATION',
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (mail_id) REFERENCES mails(id) ON DELETE CASCADE,
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS shipments (
      id TEXT PRIMARY KEY,
      mail_id TEXT NOT NULL,
      company_id TEXT NOT NULL,
      dispatch_mode TEXT NOT NULL,
      tracking_ref TEXT DEFAULT '',
      recipient_details TEXT DEFAULT '',
      dispatched_by TEXT NOT NULL,
      dispatched_at TEXT NOT NULL DEFAULT (datetime('now')),
      proof_document_id TEXT,
      notes TEXT DEFAULT '',
      FOREIGN KEY (mail_id) REFERENCES mails(id) ON DELETE CASCADE,
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      mail_id TEXT,
      task_id TEXT,
      event_type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS email_logs (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      mail_id TEXT,
      recipient_user_id TEXT,
      recipient_email TEXT NOT NULL,
      recipient_name TEXT NOT NULL,
      department_name TEXT DEFAULT '',
      trigger_event TEXT NOT NULL,
      subject TEXT NOT NULL,
      body_text TEXT NOT NULL,
      delivery_status TEXT NOT NULL DEFAULT 'QUEUED_NO_SMTP',
      error_message TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      company_id TEXT,
      user_id TEXT,
      user_name TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      old_value_json TEXT DEFAULT '',
      new_value_json TEXT DEFAULT '',
      context TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS contact_leads (
      id TEXT PRIMARY KEY,
      company_name TEXT NOT NULL,
      contact_name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT DEFAULT '',
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'NOUVEAU',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS payment_transactions (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      plan_id TEXT NOT NULL,
      billing_cycle TEXT NOT NULL DEFAULT 'MONTHLY',
      amount_fcfa INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'XOF',
      payment_method TEXT NOT NULL,
      provider TEXT NOT NULL,
      country_code TEXT NOT NULL DEFAULT 'BJ',
      payer_account_mask TEXT DEFAULT '',
      external_tx_ref TEXT DEFAULT '',
      checkout_url TEXT DEFAULT '',
      receipt_number TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'PENDING',
      mode TEXT NOT NULL DEFAULT 'SANDBOX_UEMOA',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      initiated_by TEXT,
      paid_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY (plan_id) REFERENCES subscription_plans(id)
    );

    CREATE TABLE IF NOT EXISTS signature_delegations (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      delegator_user_id TEXT NOT NULL,
      delegate_user_id TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      allowed_directions_json TEXT NOT NULL DEFAULT '["ENTRANT","SORTANT","INTERNE"]',
      allowed_categories_json TEXT NOT NULL DEFAULT '[]',
      restrictions TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      confirmed_by_president INTEGER NOT NULL DEFAULT 1,
      confirmed_at TEXT NOT NULL DEFAULT (datetime('now')),
      revoked_at TEXT,
      revocation_reason TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY (delegator_user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (delegate_user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS mail_signatures (
      id TEXT PRIMARY KEY,
      mail_id TEXT NOT NULL,
      company_id TEXT NOT NULL,
      workflow_step_id TEXT,
      signer_user_id TEXT NOT NULL,
      signer_name TEXT NOT NULL,
      signer_role TEXT NOT NULL,
      signer_title TEXT NOT NULL,
      signature_image TEXT NOT NULL,
      stamp_image TEXT DEFAULT '',
      signature_hash TEXT NOT NULL,
      signed_at TEXT NOT NULL DEFAULT (datetime('now')),
      is_delegated INTEGER NOT NULL DEFAULT 0,
      delegation_id TEXT,
      represented_user_id TEXT,
      represented_name TEXT,
      represented_role TEXT,
      FOREIGN KEY (mail_id) REFERENCES mails(id) ON DELETE CASCADE,
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY (delegation_id) REFERENCES signature_delegations(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_mails_company_ref ON mails(company_id, reference);
    CREATE INDEX IF NOT EXISTS idx_mails_company_status ON mails(company_id, mail_status);
    CREATE INDEX IF NOT EXISTS idx_tasks_company_user ON tasks(company_id, assigned_user_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
    CREATE INDEX IF NOT EXISTS idx_audit_company ON audit_logs(company_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_email_logs_company ON email_logs(company_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_payments_company ON payment_transactions(company_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_signatures_mail ON mail_signatures(mail_id, company_id);
  `);

  // Safe migrations for existing SQLite databases
  const safeAddCol = (table: string, colDef: string) => {
    try {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${colDef}`);
    } catch {
      // Column already exists
    }
  };

  safeAddCol('users', "signature_image TEXT DEFAULT ''");
  safeAddCol('users', "stamp_image TEXT DEFAULT ''");
  safeAddCol('companies', "stamp_image TEXT DEFAULT ''");
  safeAddCol('companies', "billing_cycle TEXT DEFAULT 'MONTHLY'");
  safeAddCol('companies', "subscription_expires_at TEXT DEFAULT ''");
  safeAddCol('mail_signatures', "is_delegated INTEGER NOT NULL DEFAULT 0");
  safeAddCol('mail_signatures', "delegation_id TEXT DEFAULT NULL");
  safeAddCol('mail_signatures', "represented_user_id TEXT DEFAULT NULL");
  safeAddCol('mail_signatures', "represented_name TEXT DEFAULT NULL");
  safeAddCol('mail_signatures', "represented_role TEXT DEFAULT NULL");
  safeAddCol('mails', "draft_response_html TEXT DEFAULT ''");
  safeAddCol('mails', "draft_response_text TEXT DEFAULT ''");
  safeAddCol('mails', "draft_response_updated_by TEXT DEFAULT NULL");
  safeAddCol('mails', "draft_response_updated_at TEXT DEFAULT NULL");
}
