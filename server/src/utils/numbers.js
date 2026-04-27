import pool from '../db.js';

export async function nextPatientNumber() {
  const year = new Date().getFullYear();
  const prefix = `P-${year}-`;
  const [rows] = await pool.query(
    `SELECT patient_number FROM patients WHERE patient_number LIKE ? ORDER BY patient_number DESC LIMIT 1`,
    [`${prefix}%`]
  );
  let seq = 1;
  if (rows.length) {
    const last = rows[0].patient_number;
    const part = last.slice(prefix.length);
    const n = parseInt(part, 10);
    if (!Number.isNaN(n)) seq = n + 1;
  }
  return `${prefix}${String(seq).padStart(5, '0')}`;
}

export async function nextBillNumber() {
  const year = new Date().getFullYear();
  const prefix = `BILL-${year}-`;
  const [rows] = await pool.query(
    `SELECT bill_number FROM bills WHERE bill_number LIKE ? ORDER BY bill_number DESC LIMIT 1`,
    [`${prefix}%`]
  );
  let seq = 1;
  if (rows.length) {
    const last = rows[0].bill_number;
    const part = last.slice(prefix.length);
    const n = parseInt(part, 10);
    if (!Number.isNaN(n)) seq = n + 1;
  }
  return `${prefix}${String(seq).padStart(5, '0')}`;
}
