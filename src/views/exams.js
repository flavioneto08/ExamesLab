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
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button id="import-text-btn" class="btn btn-secondary">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          Importar Texto
        </button>
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
  // Holds values imported from text before grid render
  let pendingImportValues = {};

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
      // Priority: pendingImportValues > existingRecords
      const val = pendingImportValues[et.id] !== undefined
        ? pendingImportValues[et.id]
        : (record ? record.value : '');
      const refText = (et.reference_min != null && et.reference_max != null)
        ? `Ref: ${et.reference_min} - ${et.reference_max}`
        : '';
      let valueClass = '';
      const numVal = parseFloat(String(val).replace(',', '.'));
      if (!isNaN(numVal) && et.reference_max != null && numVal > et.reference_max) valueClass = 'value-high';
      if (!isNaN(numVal) && et.reference_min != null && numVal < et.reference_min) valueClass = 'value-low';

      // Highlight fields that came from import
      const isImported = pendingImportValues[et.id] !== undefined;

      return `
        <div class="exam-field${isImported ? ' exam-field-imported' : ''}" data-type-id="${et.id}">
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
        delete pendingImportValues[typeId];
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
        // Clear pending import highlight once user edits
        const field = input.closest('.exam-field');
        if (field) field.classList.remove('exam-field-imported');
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
      pendingImportValues = {};
      showToast(`${records.length} exame(s) salvo(s) com sucesso!`);
      await loadExamFields();
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

  // ===== IMPORT TEXT =====
  container.querySelector('#import-text-btn').addEventListener('click', () => {
    openImportModal();
  });

  function openImportModal() {
    const bodyEl = document.createElement('div');
    bodyEl.innerHTML = `
      <div class="form-group">
        <label class="form-label">Cole o texto dos exames abaixo</label>
        <textarea
          id="import-raw-text"
          class="form-input import-textarea"
          rows="7"
          placeholder="01/05/26: BT 1,8 | BI 0,9 | BD 0,9 | CA 8,2 | CR 1,2&#10;PCR 2,77 | PT 5,7 | ALB 3,2 | GLOB 2,5 | TGO 34"></textarea>
      </div>
      <div id="import-preview" class="import-preview" style="display:none"></div>
    `;

    const modal = openModal({
      title: 'Importar Exames por Texto',
      body: bodyEl,
      footer: `
        <button class="btn btn-secondary" data-close>Cancelar</button>
        <button class="btn btn-secondary" id="import-analyze-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          Analisar
        </button>
        <button class="btn btn-primary" id="import-confirm-btn" style="display:none">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          Importar
        </button>
      `,
      wide: true
    });

    const textarea = modal.element.querySelector('#import-raw-text');
    const previewEl = modal.element.querySelector('#import-preview');
    const analyzeBtn = modal.element.querySelector('#import-analyze-btn');
    const confirmBtn = modal.element.querySelector('#import-confirm-btn');

    modal.element.querySelector('[data-close]').addEventListener('click', modal.close);

    // Re-show analyze btn and hide confirm when user changes text
    textarea.addEventListener('input', () => {
      previewEl.style.display = 'none';
      confirmBtn.style.display = 'none';
      analyzeBtn.style.display = '';
    });

    let parsedEntries = [];
    let detectedDate = null;

    analyzeBtn.addEventListener('click', () => {
      const raw = textarea.value;
      if (!raw.trim()) { showToast('Cole algum texto primeiro', 'error'); return; }

      const parsed = parseExamText(raw);
      parsedEntries = parsed.entries;
      detectedDate = parsed.date;

      if (parsedEntries.length === 0) {
        previewEl.style.display = 'block';
        previewEl.innerHTML = `<div class="import-empty">Nenhum exame encontrado no texto. Verifique o formato.</div>`;
        confirmBtn.style.display = 'none';
        return;
      }

      // Build preview
      const dateInfo = detectedDate
        ? `<div class="import-date-badge">📅 Data detectada: <strong>${formatDateDisplay(detectedDate)}</strong></div>`
        : `<div class="import-date-badge import-date-missing">⚠️ Data não detectada — será usada a data selecionada na tela</div>`;

      const items = parsedEntries.map(entry => {
        const found = examTypes.find(et => et.abbreviation.toUpperCase() === entry.abbr.toUpperCase());
        const statusClass = found ? 'import-item-known' : 'import-item-new';
        const statusLabel = found
          ? `<span class="import-badge import-badge-known">✓ cadastrado</span>`
          : `<span class="import-badge import-badge-new">+ novo</span>`;
        return `
          <div class="import-item ${statusClass}">
            <span class="import-item-abbr">${escapeHtml(entry.abbr)}</span>
            <span class="import-item-arrow">→</span>
            <span class="import-item-value">${entry.value}</span>
            ${statusLabel}
          </div>`;
      }).join('');

      const newCount = parsedEntries.filter(e =>
        !examTypes.find(et => et.abbreviation.toUpperCase() === e.abbr.toUpperCase())
      ).length;

      const summary = newCount > 0
        ? `<div class="import-summary">⚡ <strong>${newCount}</strong> tipo(s) novo(s) serão criados automaticamente com a sigla.</div>`
        : '';

      previewEl.innerHTML = `${dateInfo}${summary}<div class="import-items-grid">${items}</div>`;
      previewEl.style.display = 'block';
      confirmBtn.style.display = '';
      analyzeBtn.style.display = 'none';
    });

    confirmBtn.addEventListener('click', async () => {
      if (!patientSelect.value) {
        showToast('Selecione um paciente antes de importar', 'error');
        modal.close();
        return;
      }

      confirmBtn.disabled = true;
      confirmBtn.innerHTML = '<div class="spinner" style="width:14px;height:14px;margin:0;border-width:2px"></div> Importando...';

      try {
        // Update date field if detected
        if (detectedDate) {
          dateInput.value = detectedDate;
          // Reload existing records for the new date
          existingRecords = await getExamRecordsByDate(patientSelect.value, detectedDate);
        }

        // Create missing exam types
        for (const entry of parsedEntries) {
          let et = examTypes.find(e => e.abbreviation.toUpperCase() === entry.abbr.toUpperCase());
          if (!et) {
            et = await createExamType({
              name: entry.abbr.toUpperCase(),
              abbreviation: entry.abbr.toUpperCase(),
              unit: '',
              reference_min: null,
              reference_max: null
            });
            examTypes.push(et);
            showToast(`Tipo "${entry.abbr.toUpperCase()}" criado`, 'info');
          }
          // Map value to exam type id
          entry.examTypeId = et.id;
        }

        // Build pendingImportValues map
        pendingImportValues = {};
        parsedEntries.forEach(entry => {
          if (entry.examTypeId) {
            pendingImportValues[entry.examTypeId] = entry.value;
          }
        });

        // Ensure all imported types are active
        parsedEntries.forEach(entry => {
          if (entry.examTypeId) activeExamTypeIds.add(entry.examTypeId);
        });

        saveBtn.disabled = false;
        modal.close();
        renderExamGrid();

        const newCount = parsedEntries.filter(e =>
          !examTypes.find(et => et.id !== e.examTypeId && et.abbreviation.toUpperCase() === e.abbr.toUpperCase())
        ).length;
        showToast(`${parsedEntries.length} exame(s) importado(s)${detectedDate ? ` — data atualizada para ${formatDateDisplay(detectedDate)}` : ''}`, 'success');
      } catch (err) {
        showToast('Erro ao importar: ' + err.message, 'error');
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> Importar`;
      }
    });

    setTimeout(() => textarea.focus(), 100);
  }
}

// ===== PARSE EXAM TEXT =====
/**
 * Parses the multi-line exam text format.
 * Returns: { date: string|null (YYYY-MM-DD), entries: [{abbr, value}] }
 * 
 * Format example:
 *   01/05/26: BT 1,8 | BI 0,9 | BD 0,9
 *   PCR 2,77 | PT 5,7
 *   | HT 36,9 | HCM 34,4
 */
function parseExamText(rawText) {
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);

  // Try to detect date from first line: DD/MM/YY or DD/MM/YYYY
  let date = null;
  const dateRegex = /(\d{2})\/(\d{2})\/(\d{2,4})/;
  const firstLine = lines[0] || '';
  const dateMatch = firstLine.match(dateRegex);
  if (dateMatch) {
    const [, day, month, yearRaw] = dateMatch;
    const year = yearRaw.length === 2 ? '20' + yearRaw : yearRaw;
    date = `${year}-${month}-${day}`;
  }

  // Remove date prefix from first line (e.g. "01/05/26:")
  if (dateMatch) {
    lines[0] = lines[0].replace(/^\d{2}\/\d{2}\/\d{2,4}\s*:\s*/, '').trim();
  }

  // Join all lines into one token string, treating | as separator across lines
  const joined = lines.join(' | ');

  // Split by |
  const tokens = joined.split('|').map(t => t.trim()).filter(Boolean);

  const entries = [];
  // Each token should be: SIGLA VALUE (e.g. "BT 1,8" or "LEUCOS 7800")
  const entryRegex = /^([A-Za-záàãâõóíúçÁÀÃÂÕÓÍÚÇ0-9]+)\s+([\d.,]+)/;

  for (const token of tokens) {
    const m = token.match(entryRegex);
    if (m) {
      const abbr = m[1].trim().toUpperCase();
      const rawValue = m[2].trim().replace(',', '.');
      const value = parseFloat(rawValue);
      if (!isNaN(value)) {
        entries.push({ abbr, value });
      }
    }
  }

  return { date, entries };
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

function formatDate(dateStr) {
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

function formatDateDisplay(isoDate) {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}
