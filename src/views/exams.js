import { getPatients, getExamTypes, getExamRecordsByDate, upsertExamRecords, deleteExamRecordsByDate, createExamType } from '../supabase.js';
import { showToast } from '../components/toast.js';
import { openModal } from '../components/modal.js';

export async function renderExams(container) {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Registrar <span>Exames</span></h1>
        <p class="page-subtitle">Preencha os valores dos exames do dia</p>
      </div>
      <div style="display:flex;gap:8px">
        <button id="add-exam-type-btn" class="btn btn-secondary">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Novo Tipo de Exame
        </button>
        <button id="save-exams-btn" class="btn btn-primary" disabled>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
          Salvar Todos
        </button>
      </div>
    </div>
    <div class="filter-bar">
      <div class="form-group" style="min-width:250px">
        <label class="form-label">Paciente</label>
        <select id="exam-patient-select" class="form-input form-select">
          <option value="">Selecione um paciente...</option>
        </select>
      </div>
      <div class="form-group" style="min-width:180px">
        <label class="form-label">Data</label>
        <input type="date" id="exam-date-input" class="form-input" />
      </div>
    </div>
    <div id="exam-fields-container">
      <div class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        <h3>Selecione um paciente</h3>
        <p>Escolha o paciente e a data para registrar exames</p>
      </div>
    </div>
  `;

  let patients = [];
  let examTypes = [];
  let existingRecords = [];
  let activeExamTypeIds = new Set();

  const patientSelect = container.querySelector('#exam-patient-select');
  const dateInput = container.querySelector('#exam-date-input');
  const fieldsContainer = container.querySelector('#exam-fields-container');
  const saveBtn = container.querySelector('#save-exams-btn');

  // Set today as default date
  dateInput.value = new Date().toISOString().split('T')[0];

  // Load initial data
  try {
    [patients, examTypes] = await Promise.all([getPatients(), getExamTypes()]);
    patients.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      patientSelect.appendChild(opt);
    });

    // Check URL params for pre-selected patient
    const urlParams = new URLSearchParams(window.location.hash.split('?')[1] || '');
    const preselected = urlParams.get('paciente');
    if (preselected) {
      patientSelect.value = preselected;
      await loadExamFields();
    }
  } catch (err) {
    showToast('Erro ao carregar dados: ' + err.message, 'error');
  }

  patientSelect.addEventListener('change', loadExamFields);
  dateInput.addEventListener('change', loadExamFields);

  async function loadExamFields() {
    const patientId = patientSelect.value;
    const date = dateInput.value;
    if (!patientId || !date) return;

    fieldsContainer.innerHTML = '<div class="spinner"></div>';
    saveBtn.disabled = false;

    try {
      existingRecords = await getExamRecordsByDate(patientId, date);
      // Show all exam types, pre-fill values from existing records
      activeExamTypeIds = new Set(examTypes.map(et => et.id));
      renderExamGrid();
    } catch (err) {
      showToast('Erro: ' + err.message, 'error');
    }
  }

  function renderExamGrid() {
    const activeTypes = examTypes.filter(et => activeExamTypeIds.has(et.id));
    if (activeTypes.length === 0) {
      fieldsContainer.innerHTML = '<div class="empty-state"><h3>Nenhum tipo de exame</h3></div>';
      return;
    }

    fieldsContainer.innerHTML = `<div class="exam-grid">${activeTypes.map(et => {
      const record = existingRecords.find(r => r.exam_type_id === et.id);
      const val = record ? record.value : '';
      const refText = (et.reference_min != null && et.reference_max != null)
        ? `Ref: ${et.reference_min} - ${et.reference_max}`
        : '';
      let valueClass = '';
      if (record && et.reference_max != null && record.value > et.reference_max) valueClass = 'value-high';
      if (record && et.reference_min != null && record.value < et.reference_min) valueClass = 'value-low';

      return `
        <div class="exam-field" data-type-id="${et.id}">
          <button class="exam-field-remove" title="Remover este exame do dia" data-remove="${et.id}">&times;</button>
          <div class="exam-field-header">
            <span class="exam-field-abbr">${escapeHtml(et.abbreviation)}</span>
            <span class="exam-field-unit">${et.unit || ''}</span>
          </div>
          <div class="exam-field-name">${escapeHtml(et.name)}</div>
          <input type="number" step="any" data-exam-type="${et.id}" value="${val}" placeholder="—" class="${valueClass}" />
          <div class="exam-field-ref">${refText}</div>
        </div>
      `;
    }).join('')}</div>`;

    // Remove buttons
    fieldsContainer.querySelectorAll('.exam-field-remove').forEach(btn => {
      btn.addEventListener('click', async () => {
        const typeId = btn.dataset.remove;
        activeExamTypeIds.delete(typeId);
        // Also delete from DB if exists
        const patientId = patientSelect.value;
        const date = dateInput.value;
        try {
          await deleteExamRecordsByDate(patientId, date, typeId);
        } catch (e) { /* may not exist yet */ }
        renderExamGrid();
      });
    });

    // Live highlight on input
    fieldsContainer.querySelectorAll('input[data-exam-type]').forEach(input => {
      input.addEventListener('input', () => {
        const typeId = input.dataset.examType;
        const et = examTypes.find(e => e.id === typeId);
        const v = parseFloat(input.value);
        input.classList.remove('value-high', 'value-low');
        if (!isNaN(v) && et) {
          if (et.reference_max != null && v > et.reference_max) input.classList.add('value-high');
          if (et.reference_min != null && v < et.reference_min) input.classList.add('value-low');
        }
      });
    });
  }

  // Save all
  saveBtn.addEventListener('click', async () => {
    const patientId = patientSelect.value;
    const date = dateInput.value;
    if (!patientId || !date) { showToast('Selecione paciente e data', 'error'); return; }

    const inputs = fieldsContainer.querySelectorAll('input[data-exam-type]');
    const records = [];
    inputs.forEach(input => {
      const val = parseFloat(input.value);
      if (!isNaN(val)) {
        records.push({
          patient_id: patientId,
          exam_type_id: input.dataset.examType,
          exam_date: date,
          value: val
        });
      }
    });

    if (records.length === 0) { showToast('Preencha pelo menos um exame', 'error'); return; }

    saveBtn.disabled = true;
    saveBtn.innerHTML = '<div class="spinner" style="width:16px;height:16px;margin:0;border-width:2px"></div> Salvando...';

    try {
      await upsertExamRecords(records);
      showToast(`${records.length} exame(s) salvo(s) com sucesso!`);
      await loadExamFields(); // Reload to show saved state
    } catch (err) {
      showToast('Erro ao salvar: ' + err.message, 'error');
    } finally {
      saveBtn.disabled = false;
      saveBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Salvar Todos`;
    }
  });

  // Add new exam type
  container.querySelector('#add-exam-type-btn').addEventListener('click', () => {
    const bodyEl = document.createElement('div');
    bodyEl.innerHTML = `
      <div class="form-group">
        <label class="form-label">Nome do Exame</label>
        <input type="text" id="new-et-name" class="form-input" placeholder="Ex: Hemoglobina Glicada" />
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Abreviação</label>
          <input type="text" id="new-et-abbr" class="form-input" placeholder="Ex: HBA1C" />
        </div>
        <div class="form-group">
          <label class="form-label">Unidade</label>
          <input type="text" id="new-et-unit" class="form-input" placeholder="Ex: %" />
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Ref. Mínimo</label>
          <input type="number" step="any" id="new-et-min" class="form-input" placeholder="Opcional" />
        </div>
        <div class="form-group">
          <label class="form-label">Ref. Máximo</label>
          <input type="number" step="any" id="new-et-max" class="form-input" placeholder="Opcional" />
        </div>
      </div>
    `;

    const modal = openModal({
      title: 'Novo Tipo de Exame',
      body: bodyEl,
      footer: `
        <button class="btn btn-secondary" data-close>Cancelar</button>
        <button class="btn btn-primary" id="modal-save-et">Criar</button>
      `
    });

    modal.element.querySelector('[data-close]').addEventListener('click', modal.close);
    modal.element.querySelector('#modal-save-et').addEventListener('click', async () => {
      const name = modal.element.querySelector('#new-et-name').value.trim();
      const abbreviation = modal.element.querySelector('#new-et-abbr').value.trim().toUpperCase();
      const unit = modal.element.querySelector('#new-et-unit').value.trim();
      const reference_min = parseFloat(modal.element.querySelector('#new-et-min').value) || null;
      const reference_max = parseFloat(modal.element.querySelector('#new-et-max').value) || null;

      if (!name || !abbreviation) { showToast('Nome e abreviação são obrigatórios', 'error'); return; }

      try {
        const newType = await createExamType({ name, abbreviation, unit, reference_min, reference_max });
        examTypes.push(newType);
        activeExamTypeIds.add(newType.id);
        showToast(`Exame "${abbreviation}" criado!`);
        modal.close();
        if (patientSelect.value && dateInput.value) renderExamGrid();
      } catch (err) {
        showToast('Erro: ' + err.message, 'error');
      }
    });
  });
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}
