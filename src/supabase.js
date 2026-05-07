import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ===== AUTH =====
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function resetPassword(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + import.meta.env.BASE_URL,
  });
  if (error) throw error;
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

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

export async function createPatient(name, notes = '', location = '') {
  const { data, error } = await supabase
    .from('patients')
    .insert({ name, notes, location })
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
  const { error } = await supabase.from('patients').delete().eq('id', id);
  if (error) throw error;
}

export async function getPatientStats(patientId) {
  const { data, error } = await supabase
    .from('exam_records')
    .select('exam_date')
    .eq('patient_id', patientId);
  if (error) throw error;
  const dates = [...new Set(data.map(r => r.exam_date))];
  const lastDate = dates.sort().at(-1) || null;
  return { totalRecords: data.length, totalDays: dates.length, lastDate };
}

// ===== EXAM TYPES =====
export async function getExamTypes() {
  const { data, error } = await supabase
    .from('exam_types')
    .select('*')
    .order('sort_order')
    .order('name');
  if (error) throw error;
  return data;
}

export async function createExamType({ name, abbreviation, unit, reference_min, reference_max }) {
  const { count } = await supabase.from('exam_types').select('*', { count: 'exact', head: true });
  const sort_order = (count || 0) + 1;
  const { data, error } = await supabase
    .from('exam_types')
    .insert({ name, abbreviation, unit, reference_min, reference_max, sort_order })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateExamType(id, updates) {
  const { data, error } = await supabase
    .from('exam_types')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteExamType(id) {
  const { error } = await supabase.from('exam_types').delete().eq('id', id);
  if (error) throw error;
}

// ===== EXAM RECORDS =====
export async function getExamRecords(patientId, startDate = null, endDate = null) {
  let query = supabase
    .from('exam_records')
    .select('*, exam_types(*)')
    .eq('patient_id', patientId)
    .order('exam_date', { ascending: false })
    .order('created_at', { ascending: false });

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
  const { data, error } = await supabase
    .from('exam_records')
    .upsert(records, { onConflict: 'patient_id,exam_type_id,exam_date' })
    .select();
  if (error) throw error;
  return data;
}

export async function deleteExamRecord(id) {
  const { error } = await supabase.from('exam_records').delete().eq('id', id);
  if (error) throw error;
}

export async function deleteExamRecordsByDate(patientId, date, examTypeId = null) {
  let query = supabase
    .from('exam_records')
    .delete()
    .eq('patient_id', patientId)
    .eq('exam_date', date);
  if (examTypeId) query = query.eq('exam_type_id', examTypeId);
  const { error } = await query;
  if (error) throw error;
}

export async function getPatientRecordDates(patientId) {
  const { data, error } = await supabase
    .from('exam_records')
    .select('exam_date')
    .eq('patient_id', patientId)
    .order('exam_date', { ascending: false });
  if (error) throw error;
  return [...new Set(data.map(r => r.exam_date))];
}
