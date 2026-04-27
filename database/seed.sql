-- Demo login for all seeded users: password = "password" (bcrypt, generated with bcryptjs)

INSERT INTO users (email, password_hash, role, first_name, last_name, phone, department) VALUES
('admin@hmis.local', '$2a$10$B3d5bUFnEvUu5CBTDtQ0Xe49B/TuHZ4BYLPH7az31Qq2MOT.QqVf.', 'admin', 'System', 'Admin', '555-0001', 'Administration'),
('doc1@hmis.local', '$2a$10$B3d5bUFnEvUu5CBTDtQ0Xe49B/TuHZ4BYLPH7az31Qq2MOT.QqVf.', 'doctor', 'Sarah', 'Chen', '555-0101', 'Cardiology'),
('doc2@hmis.local', '$2a$10$B3d5bUFnEvUu5CBTDtQ0Xe49B/TuHZ4BYLPH7az31Qq2MOT.QqVf.', 'doctor', 'James', 'Miller', '555-0102', 'Emergency'),
('recv@hmis.local', '$2a$10$B3d5bUFnEvUu5CBTDtQ0Xe49B/TuHZ4BYLPH7az31Qq2MOT.QqVf.', 'receptionist', 'Emily', 'Davis', '555-0201', 'Front Desk'),
('pharm@hmis.local', '$2a$10$B3d5bUFnEvUu5CBTDtQ0Xe49B/TuHZ4BYLPH7az31Qq2MOT.QqVf.', 'pharmacist', 'Alex', 'Rivera', '555-0301', 'Pharmacy'),
('lab@hmis.local', '$2a$10$B3d5bUFnEvUu5CBTDtQ0Xe49B/TuHZ4BYLPH7az31Qq2MOT.QqVf.', 'lab', 'Jordan', 'Lee', '555-0401', 'Laboratory');

SET @admin := (SELECT id FROM users WHERE email = 'admin@hmis.local' LIMIT 1);
SET @doc1 := (SELECT id FROM users WHERE email = 'doc1@hmis.local' LIMIT 1);
SET @doc2 := (SELECT id FROM users WHERE email = 'doc2@hmis.local' LIMIT 1);
SET @recv := (SELECT id FROM users WHERE email = 'recv@hmis.local' LIMIT 1);

INSERT INTO patients (patient_number, first_name, last_name, date_of_birth, gender, phone, address, emergency_contact_name, emergency_contact_phone, insurance_provider, insurance_policy_number, insurance_group_number, registered_by) VALUES
('P-2026-00001', 'John', 'Smith', '1985-03-15', 'male', '555-1001', '100 Main St', 'Jane Smith', '555-2001', 'Metro Health Plan', 'MHP-77821', 'GRP-001', @recv),
('P-2026-00002', 'Maria', 'Garcia', '1992-07-22', 'female', '555-1002', '22 Oak Ave', 'Carlos Garcia', '555-2002', 'National Care PPO', 'NCP-99210', 'GRP-882', @recv),
('P-2026-00003', 'Robert', 'Lee', '1978-11-30', 'male', '555-1003', '5 River Rd', 'Susan Lee', '555-2003', NULL, NULL, NULL, @recv);

SET @p1 := (SELECT id FROM patients WHERE patient_number = 'P-2026-00001');
SET @p2 := (SELECT id FROM patients WHERE patient_number = 'P-2026-00002');
SET @p3 := (SELECT id FROM patients WHERE patient_number = 'P-2026-00003');

INSERT INTO appointments (patient_id, doctor_id, scheduled_at, status, reason, created_by) VALUES
(@p1, @doc1, DATE_ADD(NOW(), INTERVAL 1 DAY), 'scheduled', 'Annual checkup', @recv),
(@p2, @doc2, NOW(), 'completed', 'Chest pain evaluation', @recv);

SET @a2 := (SELECT id FROM appointments WHERE patient_id = @p2 ORDER BY id DESC LIMIT 1);

INSERT INTO consultations (patient_id, doctor_id, appointment_id, chief_complaint, diagnosis, clinical_notes) VALUES
(@p2, @doc2, @a2, 'Chest tightness', 'Musculoskeletal chest pain', 'Rest; follow-up if symptoms worsen.');

SET @c1 := LAST_INSERT_ID();

INSERT INTO lab_orders (patient_id, ordered_by, consultation_id, test_name, status, result_notes) VALUES
(@p2, @doc2, @c1, 'Troponin I', 'completed', 'Within normal limits');

INSERT INTO prescriptions (consultation_id, patient_id, prescribed_by, medication_name, dosage, quantity, status) VALUES
(@c1, @p2, @doc2, 'Ibuprofen', '400mg TID', 30, 'dispensed');

INSERT INTO bills (patient_id, bill_number, total_amount, tax_amount, status, created_by) VALUES
(@p2, 'BILL-2026-00001', 450.00, 36.00, 'paid', @recv);

INSERT INTO inventory_items (sku, name, category, quantity, unit, reorder_threshold, location, expiry_date) VALUES
('MED-ASPIRIN', 'Aspirin 81mg', 'Pharmacy', 500, 'tablets', 100, 'Store A', DATE_ADD(CURDATE(), INTERVAL 400 DAY)),
('SUP-GLOV', 'Exam gloves (box)', 'Supplies', 8, 'boxes', 20, 'Central', DATE_ADD(CURDATE(), INTERVAL 180 DAY)),
('LAB-TUBE', 'Blood collection tubes', 'Lab', 200, 'units', 50, 'Lab', DATE_ADD(CURDATE(), INTERVAL 90 DAY));

INSERT INTO icu_beds (bed_code, status, patient_id, notes) VALUES
('ICU-01', 'occupied', @p3, 'Post-surgical'),
('ICU-02', 'available', NULL, NULL),
('ICU-03', 'occupied', NULL, 'Unavailable');

INSERT INTO emergency_team (name, role_title, phone, is_on_call) VALUES
('Dr. Patel', 'Trauma lead', '555-4001', 1),
('Nurse Kim', 'Charge nurse', '555-4002', 1),
('Dr. Ortiz', 'Anesthesiology', '555-4003', 0);

INSERT INTO payroll_records (staff_id, period_start, period_end, gross_amount, deductions, net_amount, paid_at) VALUES
(@doc1, '2026-03-01', '2026-03-31', 12000.00, 2400.00, 9600.00, '2026-04-05'),
(@recv, '2026-03-01', '2026-03-31', 4200.00, 800.00, 3400.00, '2026-04-05');

INSERT INTO system_alerts (severity, category, title, message) VALUES
('warning', 'inventory', 'Low stock: Exam gloves', 'Quantity below reorder threshold.'),
('info', 'beds', 'ICU occupancy', 'One bed unavailable; monitor capacity.');

INSERT INTO notifications (user_id, channel, subject, body, sent_at) VALUES
(@recv, 'in_app', 'Appointment reminder', 'Patient John Smith has an appointment tomorrow.', NULL);

INSERT INTO insurance_claims (patient_id, claim_amount, provider_name, status, external_reference) VALUES
(@p2, 450.00, 'Demo Insurance Co.', 'pending', 'EXT-CLAIM-001');

INSERT INTO telemedicine_sessions (patient_id, doctor_id, scheduled_at, meeting_url, status) VALUES
(@p1, @doc1, DATE_ADD(NOW(), INTERVAL 2 DAY), 'https://meet.example.com/room-hmis-demo', 'scheduled');
