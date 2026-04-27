/**
 * HMIS G3 service catalog — keep in sync with `hmis/shared/servicesCatalog.js` (client source of truth).
 */

export const HMIS_STAKEHOLDERS = [
  { id: 'patients', label: 'Patients', summary: 'Registration, appointment booking, and medical history viewing.' },
  { id: 'medical_staff', label: 'Medical staff (doctors, nurses)', summary: 'Consultation recording, prescriptions, and lab test ordering.' },
  { id: 'administrative_staff', label: 'Administrative staff', summary: 'Scheduling, registration, insurance, and security policies.' },
  { id: 'pharmacists', label: 'Pharmacists', summary: 'Medicine inventory, stock updates, and prescription fulfillment.' },
  { id: 'lab_technicians', label: 'Lab technicians', summary: 'Processing test orders and entering results.' },
  { id: 'hospital_management', label: 'Hospital management', summary: 'Analytics dashboards and operational anomaly alerts.' },
  { id: 'financial_officers', label: 'Financial officers', summary: 'Billing lifecycle, invoices, reconciliation, and outstanding dues.' },
];

export const HMIS_SERVICE_CATEGORIES = [
  {
    id: 'authentication_security',
    name: 'Authentication & Security',
    services: [
      { code: 'AS-1', name: 'User Login System', description: 'Secure JWT-based authentication.', path: '/login' },
      { code: 'AS-2', name: 'User Logout', description: 'Safe termination of user sessions.', path: '/' },
      { code: 'AS-3', name: 'Role-Based Access Control (RBAC)', description: 'Granular permission management by staff role.', path: '/admin' },
      { code: 'AS-4', name: 'Password Management', description: 'Password change for signed-in users (recovery via IT in demo).', path: '/' },
      { code: 'AS-5', name: 'Session Management', description: 'JWT session lifetime and expiry surfaced to the client.', path: '/' },
      { code: 'AS-6', name: 'Activity Logging', description: 'Auditing of user actions in system logs.', path: '/admin' },
    ],
  },
  {
    id: 'patient_management',
    name: 'Patient Management',
    services: [
      { code: 'PM-1', name: 'Patient Registration', description: 'Creation of unique patient records with MRN.', path: '/patients' },
      { code: 'PM-2', name: 'Patient Profile Management', description: 'Update and view patient demographics and coverage.', path: '/patients' },
      { code: 'PM-3', name: 'Patient Search System', description: 'Search by name, MRN, or phone number.', path: '/patients' },
      { code: 'PM-4', name: 'Patient History Viewer', description: 'Consolidated consultations, labs, and prescriptions.', path: '/patients' },
      { code: 'PM-5', name: 'Emergency Contact Management', description: 'Secure storage of next-of-kin and emergency contacts.', path: '/patients' },
      { code: 'PM-6', name: 'Insurance Management', description: 'Subscriber and policy data stored on the patient record.', path: '/patients' },
    ],
  },
  {
    id: 'appointment_scheduling',
    name: 'Appointment & Scheduling',
    services: [
      { code: 'AP-1', name: 'Appointment Booking', description: 'Schedule patient visits with providers.', path: '/appointments' },
      { code: 'AP-2', name: 'Doctor Availability Check', description: 'Day-level slot preview to avoid conflicts.', path: '/appointments' },
      { code: 'AP-3', name: 'Appointment Rescheduling', description: 'Modify date and time of existing appointments.', path: '/appointments' },
      { code: 'AP-4', name: 'Appointment Cancellation', description: 'Cancellation with reason tracking.', path: '/appointments' },
      { code: 'AP-5', name: 'Appointment Status Tracking', description: 'Lifecycle monitoring (scheduled, completed, cancelled, no-show).', path: '/appointments' },
    ],
  },
  {
    id: 'clinical_workflow',
    name: 'Clinical Workflow',
    services: [
      { code: 'CW-1', name: 'Consultation Recording', description: 'Doctor notes, diagnosis, emergency and triage flags.', path: '/clinical' },
      { code: 'CW-2', name: 'Prescription Management', description: 'Create, track, and dispense outpatient prescriptions.', path: '/clinical' },
      { code: 'CW-3', name: 'Lab Test Ordering', description: 'Requisitions linked to encounters.', path: '/clinical' },
      { code: 'CW-4', name: 'Lab Result Management', description: 'Result entry and completion of lab orders.', path: '/clinical' },
      { code: 'CW-5', name: 'Follow-up Scheduling', description: 'Book return visits tied to a prior appointment.', path: '/appointments' },
    ],
  },
  {
    id: 'billing_financial',
    name: 'Billing & Financial',
    services: [
      { code: 'BF-1', name: 'Invoice Generation', description: 'Automated bills with line items and tax.', path: '/billing' },
      { code: 'BF-2', name: 'Payment Processing', description: 'Record full or partial settlement and paid timestamp.', path: '/billing' },
      { code: 'BF-3', name: 'Outstanding Dues Tracking', description: 'Open balances on pending and draft invoices.', path: '/billing' },
      { code: 'BF-4', name: 'Billing Reports', description: 'Financial summaries and rollups for leadership.', path: '/billing' },
      { code: 'BF-5', name: 'Payment History Viewer', description: 'Paid invoice history by patient.', path: '/billing' },
    ],
  },
  {
    id: 'pharmacy_inventory',
    name: 'Pharmacy & Inventory',
    services: [
      { code: 'PI-1', name: 'Medicine Inventory Management', description: 'Centralized catalog and on-hand quantities.', path: '/pharmacy' },
      { code: 'PI-2', name: 'Stock Update System', description: 'Transactional stock adjustments with reasons.', path: '/pharmacy' },
      { code: 'PI-3', name: 'Low Stock Alerts', description: 'Threshold-driven alerts via system alerts engine.', path: '/pharmacy' },
      { code: 'PI-4', name: 'Expiry Tracking', description: 'Expiry dates on inventory SKUs and near-expiry list.', path: '/pharmacy' },
      { code: 'PI-5', name: 'Prescription Fulfillment', description: 'Dispense medicines linked to prescriptions (clinical + pharmacy views).', path: '/clinical' },
    ],
  },
  {
    id: 'emergency_care',
    name: 'Emergency & Care',
    services: [
      { code: 'EC-1', name: 'ICU Bed Management', description: 'Bed board with occupancy and cleaning states.', path: '/facility' },
      { code: 'EC-2', name: 'Emergency Admission', description: 'Rapid encounter creation for emergency presentations.', path: '/facility' },
      { code: 'EC-3', name: 'Triage Assignment', description: 'Triage level captured on the consultation record.', path: '/facility' },
    ],
  },
  {
    id: 'analytics_notifications',
    name: 'Analytics & Notifications',
    services: [
      { code: 'AN-1', name: 'Analytics Dashboard', description: 'Operational and access metrics for hospital management.', path: '/reports' },
      { code: 'AN-2', name: 'Notification System', description: 'In-app, email, and SMS notification records (demo channels).', path: '/reports' },
      { code: 'AN-3', name: 'System Alerts', description: 'Critical conditions such as low stock and ICU capacity.', path: '/reports' },
    ],
  },
];

export const HMIS_TOTAL_SERVICES = HMIS_SERVICE_CATEGORIES.reduce((n, c) => n + c.services.length, 0);
