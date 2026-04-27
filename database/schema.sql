-- HMIS — Hospital Management Information System
-- Single consolidated schema. MySQL 8.x.
-- All previously-separate migrations (G3 PDF alignment, surgery_requests, billing-to-encounters,
-- last_login_at, appointment scheduling columns) are folded in here.

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS insurance_claims;
DROP TABLE IF EXISTS telemedicine_sessions;
DROP TABLE IF EXISTS system_alerts;
DROP TABLE IF EXISTS inventory_transactions;
DROP TABLE IF EXISTS inventory_items;
DROP TABLE IF EXISTS payroll_records;
DROP TABLE IF EXISTS bill_items;
DROP TABLE IF EXISTS bills;
DROP TABLE IF EXISTS prescriptions;
DROP TABLE IF EXISTS lab_orders;
DROP TABLE IF EXISTS surgery_requests;
DROP TABLE IF EXISTS consultations;
DROP TABLE IF EXISTS appointments;
DROP TABLE IF EXISTS icu_beds;
DROP TABLE IF EXISTS emergency_team;
DROP TABLE IF EXISTS patients;
DROP TABLE IF EXISTS users;

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- USERS / AUTH
-- ============================================================
CREATE TABLE users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin', 'doctor', 'receptionist', 'pharmacist', 'lab') NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  phone VARCHAR(40),
  department VARCHAR(120),
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  last_login_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_users_role (role),
  INDEX idx_users_email (email)
) ENGINE=InnoDB;

-- ============================================================
-- PATIENTS
-- ============================================================
CREATE TABLE patients (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  patient_number VARCHAR(20) NOT NULL UNIQUE,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  date_of_birth DATE NOT NULL,
  gender ENUM('male', 'female', 'other', 'unknown') NOT NULL DEFAULT 'unknown',
  phone VARCHAR(40),
  email VARCHAR(255),
  address TEXT,
  blood_group VARCHAR(10),
  emergency_contact_name VARCHAR(200),
  emergency_contact_phone VARCHAR(40),
  insurance_provider VARCHAR(200),
  insurance_policy_number VARCHAR(120),
  insurance_group_number VARCHAR(120),
  registered_by INT UNSIGNED,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (registered_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_patients_name (last_name, first_name),
  INDEX idx_patients_number (patient_number)
) ENGINE=InnoDB;

-- ============================================================
-- APPOINTMENTS
-- ============================================================
CREATE TABLE appointments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  patient_id INT UNSIGNED NOT NULL,
  doctor_id INT UNSIGNED NOT NULL,
  scheduled_at DATETIME NOT NULL,
  duration_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 30,
  status ENUM('scheduled', 'completed', 'cancelled', 'no_show') NOT NULL DEFAULT 'scheduled',
  reason TEXT,
  cancellation_reason TEXT,
  visit_type ENUM('routine', 'follow_up', 'emergency') NOT NULL DEFAULT 'routine',
  rescheduled_from_id INT UNSIGNED,
  created_by INT UNSIGNED,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  FOREIGN KEY (doctor_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (rescheduled_from_id) REFERENCES appointments(id) ON DELETE SET NULL,
  INDEX idx_appt_time (scheduled_at),
  INDEX idx_appt_doctor (doctor_id, scheduled_at)
) ENGINE=InnoDB;

-- ============================================================
-- CONSULTATIONS
-- ============================================================
CREATE TABLE consultations (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  patient_id INT UNSIGNED NOT NULL,
  doctor_id INT UNSIGNED NOT NULL,
  appointment_id INT UNSIGNED,
  chief_complaint VARCHAR(500),
  diagnosis TEXT,
  clinical_notes TEXT,
  is_emergency TINYINT(1) NOT NULL DEFAULT 0,
  triage_level VARCHAR(32),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  FOREIGN KEY (doctor_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL,
  INDEX idx_cons_patient (patient_id),
  INDEX idx_cons_doctor (doctor_id)
) ENGINE=InnoDB;

-- ============================================================
-- SURGERY REQUESTS — folded in from migration_2026_surgery_requests
-- ============================================================
CREATE TABLE surgery_requests (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  consultation_id INT UNSIGNED NOT NULL,
  patient_id INT UNSIGNED NOT NULL,
  doctor_id INT UNSIGNED NOT NULL,
  status ENUM('requested', 'icu_booked', 'cancelled', 'completed') NOT NULL DEFAULT 'requested',
  surgery_scheduled_at DATETIME NOT NULL,
  surgery_notes TEXT,
  icu_required TINYINT(1) NOT NULL DEFAULT 1,
  icu_bed_id INT UNSIGNED NULL,
  requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  booked_at TIMESTAMP NULL DEFAULT NULL,
  booked_by INT UNSIGNED NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (consultation_id) REFERENCES consultations(id) ON DELETE CASCADE,
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  FOREIGN KEY (doctor_id) REFERENCES users(id) ON DELETE RESTRICT,
  -- icu_bed_id FK added later (icu_beds defined below)
  FOREIGN KEY (booked_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_sr_doctor_time (doctor_id, surgery_scheduled_at),
  INDEX idx_sr_status_time (status, surgery_scheduled_at),
  INDEX idx_sr_patient (patient_id)
) ENGINE=InnoDB;

-- ============================================================
-- LAB
-- ============================================================
CREATE TABLE lab_orders (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  patient_id INT UNSIGNED NOT NULL,
  ordered_by INT UNSIGNED NOT NULL,
  consultation_id INT UNSIGNED,
  test_name VARCHAR(255) NOT NULL,
  status ENUM('ordered', 'in_progress', 'completed', 'cancelled') NOT NULL DEFAULT 'ordered',
  priority ENUM('routine', 'urgent', 'stat') NOT NULL DEFAULT 'routine',
  result_notes TEXT,
  ordered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  FOREIGN KEY (ordered_by) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (consultation_id) REFERENCES consultations(id) ON DELETE SET NULL,
  INDEX idx_lab_patient (patient_id),
  INDEX idx_lab_status (status)
) ENGINE=InnoDB;

-- ============================================================
-- PRESCRIPTIONS
-- ============================================================
CREATE TABLE prescriptions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  consultation_id INT UNSIGNED NOT NULL,
  patient_id INT UNSIGNED NOT NULL,
  prescribed_by INT UNSIGNED NOT NULL,
  medication_name VARCHAR(255) NOT NULL,
  dosage VARCHAR(120),
  quantity INT UNSIGNED NOT NULL DEFAULT 1,
  instructions TEXT,
  status ENUM('pending', 'dispensed', 'cancelled') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (consultation_id) REFERENCES consultations(id) ON DELETE CASCADE,
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  FOREIGN KEY (prescribed_by) REFERENCES users(id) ON DELETE RESTRICT,
  INDEX idx_rx_patient (patient_id),
  INDEX idx_rx_status (status)
) ENGINE=InnoDB;

-- ============================================================
-- BILLING
-- ============================================================
CREATE TABLE bills (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  patient_id INT UNSIGNED NOT NULL,
  bill_number VARCHAR(30) NOT NULL UNIQUE,
  total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  tax_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  status ENUM('draft', 'pending', 'paid', 'void') NOT NULL DEFAULT 'pending',
  notes TEXT,
  created_by INT UNSIGNED,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  paid_at DATETIME,
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_bills_patient (patient_id),
  INDEX idx_bills_status (status)
) ENGINE=InnoDB;

-- bill_items now includes consultation_id + appointment_id (was a separate migration in original repo)
CREATE TABLE bill_items (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  bill_id INT UNSIGNED NOT NULL,
  description VARCHAR(255) NOT NULL,
  quantity INT UNSIGNED NOT NULL DEFAULT 1,
  unit_price DECIMAL(12,2) NOT NULL,
  consultation_id INT UNSIGNED NULL,
  appointment_id INT UNSIGNED NULL,
  FOREIGN KEY (bill_id) REFERENCES bills(id) ON DELETE CASCADE,
  FOREIGN KEY (consultation_id) REFERENCES consultations(id) ON DELETE SET NULL,
  FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL,
  INDEX idx_bi_bill (bill_id),
  INDEX idx_bi_consultation (consultation_id),
  INDEX idx_bi_appointment (appointment_id)
) ENGINE=InnoDB;

CREATE TABLE payroll_records (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  staff_id INT UNSIGNED NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  gross_amount DECIMAL(12,2) NOT NULL,
  deductions DECIMAL(12,2) NOT NULL DEFAULT 0,
  net_amount DECIMAL(12,2) NOT NULL,
  paid_at DATE,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (staff_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_payroll_staff (staff_id, period_start)
) ENGINE=InnoDB;

-- ============================================================
-- INVENTORY
-- ============================================================
CREATE TABLE inventory_items (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  sku VARCHAR(50) UNIQUE,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100),
  quantity INT NOT NULL DEFAULT 0,
  unit VARCHAR(20) NOT NULL DEFAULT 'unit',
  reorder_threshold INT NOT NULL DEFAULT 10,
  location VARCHAR(120),
  expiry_date DATE,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_inv_quantity (quantity),
  INDEX idx_inv_threshold (reorder_threshold),
  INDEX idx_inv_expiry (expiry_date)
) ENGINE=InnoDB;

CREATE TABLE inventory_transactions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  item_id INT UNSIGNED NOT NULL,
  delta INT NOT NULL,
  reason VARCHAR(255),
  performed_by INT UNSIGNED,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (item_id) REFERENCES inventory_items(id) ON DELETE CASCADE,
  FOREIGN KEY (performed_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_it_item (item_id)
) ENGINE=InnoDB;

-- ============================================================
-- FACILITY (ICU + emergency team)
-- ============================================================
CREATE TABLE icu_beds (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  bed_code VARCHAR(20) NOT NULL UNIQUE,
  status ENUM('available', 'occupied', 'reserved') NOT NULL DEFAULT 'available',
  patient_id INT UNSIGNED,
  notes VARCHAR(500),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE SET NULL,
  INDEX idx_icu_status (status)
) ENGINE=InnoDB;

-- Now that icu_beds exists, link surgery_requests.icu_bed_id to it.
ALTER TABLE surgery_requests
  ADD CONSTRAINT fk_sr_icu_bed FOREIGN KEY (icu_bed_id) REFERENCES icu_beds(id) ON DELETE SET NULL;

CREATE TABLE emergency_team (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  role_title VARCHAR(120) NOT NULL,
  phone VARCHAR(40),
  is_on_call TINYINT(1) NOT NULL DEFAULT 0,
  shift_notes VARCHAR(500),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ============================================================
-- INSURANCE / TELEMED / ALERTS / NOTIFICATIONS / AUDIT
-- ============================================================
CREATE TABLE insurance_claims (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  patient_id INT UNSIGNED NOT NULL,
  bill_id INT UNSIGNED,
  external_reference VARCHAR(100),
  provider_name VARCHAR(200),
  claim_amount DECIMAL(12,2) NOT NULL,
  status ENUM('submitted', 'pending', 'approved', 'denied') NOT NULL DEFAULT 'submitted',
  raw_response JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  FOREIGN KEY (bill_id) REFERENCES bills(id) ON DELETE SET NULL,
  INDEX idx_claims_status (status)
) ENGINE=InnoDB;

CREATE TABLE telemedicine_sessions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  patient_id INT UNSIGNED NOT NULL,
  doctor_id INT UNSIGNED NOT NULL,
  scheduled_at DATETIME NOT NULL,
  meeting_url VARCHAR(500),
  status ENUM('scheduled', 'completed', 'cancelled') NOT NULL DEFAULT 'scheduled',
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  FOREIGN KEY (doctor_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_tm_time (scheduled_at)
) ENGINE=InnoDB;

CREATE TABLE system_alerts (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  severity ENUM('info', 'warning', 'critical') NOT NULL DEFAULT 'warning',
  category VARCHAR(80) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  acknowledged TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_alerts_sev (severity, acknowledged)
) ENGINE=InnoDB;

CREATE TABLE notifications (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED,
  channel ENUM('in_app', 'email', 'sms') NOT NULL DEFAULT 'in_app',
  subject VARCHAR(255),
  body TEXT NOT NULL,
  sent_at TIMESTAMP NULL,
  read_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_notif_user (user_id, read_at)
) ENGINE=InnoDB;

CREATE TABLE audit_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED,
  action VARCHAR(80) NOT NULL,
  resource VARCHAR(120),
  resource_id VARCHAR(64),
  ip_address VARCHAR(45),
  details JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_audit_user (user_id),
  INDEX idx_audit_time (created_at)
) ENGINE=InnoDB;
