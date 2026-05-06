import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://xwuyhaxqcgakwakmskkm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3dXloYXhxY2dha3dha21za2ttIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwMDU3NzQsImV4cCI6MjA5MzU4MTc3NH0.VrudtazFsdvxN6sVOT9j05zCrHy6KqjkOnMLOFqrlAc';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ===== PATIENTS =====
export async function getPatients() {
  const { data, error } = await supabase
    .from('patients')
    .select('*')
    .order('name');
  if (error) throw error;
  return data;
}

export async function getPatient(id) {
  const { data, error } = await supabase
    .from('patients')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

export async function createPatient(name, notes = '') {
  const { data, error } = await supabase
    .from('patients')
    .insert({ name, notes })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updatePatient(id, updates) {
  const { data, error } = await supabase
    .from('patients')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deletePatient(id) {
  const { error } = await supabase
    .from('patients')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// ===== EXAM TYPES =====
export async function getExamTypes() {
  const { data, error } = await supabase
    .from('exam_types')
    .select('*')
    .order('sort_order');
  if (error) throw error;
  return data;
}

export async function createExamType({ name, abbreviation, unit, reference_min, reference_max }) {
  const { data: maxOrder } = await supabase
    .from('exam_types')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1);
  const sort_order = (maxOrder?.[0]?.sort_order || 0) + 1;

  const { data, error } = await supabase
    .from('exam_types')
    .insert({ name, abbreviation, unit, reference_min, reference_max, sort_order })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteExamType(id) {
  const { error } = await supabase
    .from('exam_types')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// ===== EXAM RECORDS =====
export async function getExamRecords(patientId, startDate, endDate) {
  let query = supabase
    .from('exam_records')
    .select('*, exam_types(*)')
    .eq('patient_id', patientId)
    .order('exam_date', { ascending: false });

  if (startDate) query = query.gte('exam_date', startDate);
  if (endDate) query = query.lte('exam_date', endDate);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function getExamRecordsByDate(patientId, date) {
  const { data, error } = await supabase
    .from('exam_records')
    .select('*, exam_types(*)')
    .eq('patient_id', patientId)
    .eq('exam_date', date);
  if (error) throw error;
  return data;
}

export async function upsertExamRecords(records) {
  // records: [{ patient_id, exam_type_id, exam_date, value }]
  const { data, error } = await supabase
    .from('exam_records')
    .upsert(records, { onConflict: 'patient_id,exam_type_id,exam_date' })
    .select();
  if (error) throw error;
  return data;
}

export async function deleteExamRecord(id) {
  const { error } = await supabase
    .from('exam_records')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

export async function deleteExamRecordsByDate(patientId, date, examTypeId) {
  const { error } = await supabase
    .from('exam_records')
    .delete()
    .eq('patient_id', patientId)
    .eq('exam_date', date)
    .eq('exam_type_id', examTypeId);
  if (error) throw error;
}

export async function getPatientRecordDates(patientId) {
  const { data, error } = await supabase
    .from('exam_records')
    .select('exam_date')
    .eq('patient_id', patientId)
    .order('exam_date', { ascending: false });
  if (error) throw error;
  const unique = [...new Set(data.map(d => d.exam_date))];
  return unique;
}

export async function getPatientStats(patientId) {
  const { data, error } = await supabase
    .from('exam_records')
    .select('exam_date')
    .eq('patient_id', patientId);
  if (error) throw error;
  const dates = [...new Set(data.map(d => d.exam_date))];
  return {
    totalRecords: data.length,
    totalDays: dates.length,
    lastDate: dates.sort().reverse()[0] || null
  };
}
