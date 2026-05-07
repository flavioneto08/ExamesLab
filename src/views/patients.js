import { getPatients, createPatient, updatePatient, deletePatient, getPatientStats, getExamRecords, getExamTypes } from '../supabase.js';
import { showToast } from '../components/toast.js';
import { openModal } from '../components/modal.js';

export async function renderPatients(container) {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Meus <span>Pacientes</span></h1>
        <p class="page-subtitle">Gerencie os pacientes cadastrados</p>
      </div>
      <button id="add-patient-btn" class="btn btn-primary">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Novo Paciente
      </button>
    </div>
    <div class="search-wrapper" style="margin-bottom:20px">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input type="text" id="patient-search" class="form-input" placeholder="Buscar paciente..." />
    </div>
    <div id="patients-list" class="card-grid"><div class="spinner"></div></div>
  `;

  const listEl = container.querySelector('#patients-list');
  let patients = [];
  let examTypes = [];

  async function loadPatients() {
    try {
      [patients, examTypes] = await Promise.all([getPatients(), getExamTypes()]);
      const statsPromises = patients.map(p => getPatientStats(p.id));
      const stats = await Promise.all(statsPromises);
      patients.forEach((p, i) => p._stats = stats[i]);
      renderList(patients);
    } catch (err) {
      showToast('Erro ao carregar pacientes: ' + err.message, 'error');
      listEl.innerHTML = '<div class="empty-state"><h3>Erro ao carregar</h3></div>';
    }
  }

  function renderList(list) {
    if (list.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
          <h3>Nenhum paciente</h3>
          <p>Clique em "Novo Paciente" para começar</p>
        </div>`;
      return;
    }
    listEl.innerHTML = list.map(p => `
      <div class="card patient-card" data-id="${p.id}">
        <div class="patient-name">${escapeHtml(p.name)}</div>
        <div class="patient-notes">${p.notes ? escapeHtml(p.notes) : '<em style="color:var(--text-muted)">Sem observações</em>'}</div>
        <div class="patient-meta">
          <span>📋 ${p._stats?.totalRecords || 0} registros</span>
          <span>📅 ${p._stats?.totalDays || 0} dias</span>
          ${p._stats?.lastDate ? `<span>Último: ${formatDate(p._stats.lastDate)}</span>` : ''}
        </div>
        <div class="patient-actions">
          <button class="btn btn-secondary btn-sm edit-patient" data-id="${p.id}">Editar</button>
          <button class="btn btn-danger btn-sm delete-patient" data-id="${p.id}">Excluir</button>
        </div>
      </div>
    `).join('');

    listEl.querySelectorAll('.edit-patient').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const p = patients.find(x => x.id === btn.dataset.id);
        openPatientModal(p);
      });
    });

    listEl.querySelectorAll('.delete-patient').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const p = patients.find(x => x.id === btn.dataset.id);
        confirmDelete(p);
      });
    });

    // Card click → overview
    listEl.querySelectorAll('.patient-card').forEach(card => {
      card.addEventListener('click', () => {
        const p = patients.find(x => x.id === card.dataset.id);
        if (p) openPatientOverview(p);
      });
    });
  }

  // ===== PATIENT OVERVIEW =====
  async function openPatientOverview(patient) {
    const bodyEl = document.createElement('div');
    bodyEl.className = 'overview-body';
    bodyEl.innerHTML = `
      <div class="overview-header-info">
        <div class="overview-avatar">${patient.name.charAt(0).toUpperCase()}</div>
        <div>
          <div class="overview-name">${escapeHtml(patient.name)}</div>
          <div class="overview-meta">
            ${patient._stats?.totalRecords || 0} registros em ${patient._stats?.totalDays || 0} dia(s)
            ${patient._stats?.lastDate ? ` · Último: ${formatDate(patient._stats.lastDate)}` : ''}
          </div>
        </div>
      </div>

      <div class="overview-grid">
        <!-- Notes section -->
        <div class="overview-section overview-notes-section">
          <div class="overview-section-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            Notas do Paciente
          </div>
          <textarea
            id="overview-notes"
            class="form-input overview-notes-textarea"
            placeholder="Leito, diagnóstico, evolução clínica..."
          >${escapeHtml(patient.notes || '')}</textarea>
          <button id="save-notes-btn" class="btn btn-primary btn-sm" style="margin-top:8px;align-self:flex-end">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
            Salvar Notas
          </button>
        </div>

        <!-- Records section -->
        <div class="overview-section overview-records-section">
          <div class="overview-section-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            Histórico de Exames
          </div>
          <div id="overview-records-container">
            <div class="spinner"></div>
          </div>
        </div>
      </div>
    `;

    const modal = openModal({
      title: 'Visão Geral do Paciente',
      body: bodyEl,
      footer: `
        <button class="btn btn-secondary" data-close>Fechar</button>
        <button class="btn btn-primary" id="overview-go-exams">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Registrar Exames
        </button>
      `,
      size: 'xl'
    });

    // Save notes
    modal.element.querySelector('#save-notes-btn').addEventListener('click', async () => {
      const notes = modal.element.querySelector('#overview-notes').value.trim();
      const btn = modal.element.querySelector('#save-notes-btn');
      btn.disabled = true;
      try {
        await updatePatient(patient.id, { notes });
        patient.notes = notes;
        showToast('Notas salvas!');
        await loadPatients(); // refresh card
      } catch (err) {
        showToast('Erro ao salvar: ' + err.message, 'error');
      } finally {
        btn.disabled = false;
      }
    });

    // Go to exams
    modal.element.querySelector('#overview-go-exams').addEventListener('click', () => {
      modal.close();
      window.location.hash = `#/exames?paciente=${patient.id}`;
    });

    // Load exam records
    loadOverviewRecords(modal.element.querySelector('#overview-records-container'), patient.id);
  }

  async function loadOverviewRecords(containerEl, patientId) {
    try {
      const records = await getExamRecords(patientId);

      if (records.length === 0) {
        containerEl.innerHTML = `
          <div class="overview-empty">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            <p>Nenhum exame registrado ainda</p>
          </div>`;
        return;
      }

      // Group by date
      const byDate = {};
      records.forEach(r => {
        if (!byDate[r.exam_date]) byDate[r.exam_date] = [];
        byDate[r.exam_date].push(r);
      });
      const sortedDates = Object.keys(byDate).sort().reverse();

      // Render accordion groups
      containerEl.innerHTML = sortedDates.map((date, idx) => {
        const dayRecords = byDate[date];
        const chips = dayRecords.map(r => {
          const et = r.exam_types;
          if (!et) return '';
          const val = r.value;
          let chipClass = '';
          if (et.reference_max != null && val > et.reference_max) chipClass = 'exam-chip-high';
          else if (et.reference_min != null && val < et.reference_min) chipClass = 'exam-chip-low';
          return `<span class="exam-chip ${chipClass}" title="${escapeHtml(et.name || et.abbreviation)}">
            <span class="exam-chip-abbr">${escapeHtml(et.abbreviation)}</span>
            <span class="exam-chip-val">${val}</span>
          </span>`;
        }).join('');

        // First entry starts expanded
        const isOpen = idx === 0;
        return `
          <div class="date-record-group${isOpen ? ' is-open' : ''}">
            <button class="date-record-toggle" aria-expanded="${isOpen}">
              <div class="date-toggle-left">
                <span class="date-badge">${formatDate(date)}</span>
                <span class="date-count">${dayRecords.length} exame(s)</span>
              </div>
              <svg class="date-toggle-arrow" width="16" height="16" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" stroke-width="2.5">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
            <div class="date-record-body">
              <div class="exam-chips-row">${chips}</div>
            </div>
          </div>`;
      }).join('');

      // Attach accordion toggle listeners
      containerEl.querySelectorAll('.date-record-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
          const group = btn.closest('.date-record-group');
          const isOpen = group.classList.contains('is-open');
          group.classList.toggle('is-open', !isOpen);
          btn.setAttribute('aria-expanded', String(!isOpen));
        });
      });

    } catch (err) {
      containerEl.innerHTML = `<div class="overview-empty"><p>Erro ao carregar registros</p></div>`;
    }
  }

  // ===== PATIENT MODAL (create/edit) =====
  function openPatientModal(patient = null) {
    const isEdit = !!patient;
    const bodyEl = document.createElement('div');
    bodyEl.innerHTML = `
      <div class="form-group">
        <label class="form-label">Nome do Paciente</label>
        <input type="text" id="modal-patient-name" class="form-input" value="${isEdit ? escapeHtml(patient.name) : ''}" placeholder="Nome completo" />
      </div>
      <div class="form-group">
        <label class="form-label">Observações</label>
        <textarea id="modal-patient-notes" class="form-input" rows="3" placeholder="Leito, diagnóstico, etc.">${isEdit ? escapeHtml(patient.notes || '') : ''}</textarea>
      </div>
    `;

    const modal = openModal({
      title: isEdit ? 'Editar Paciente' : 'Novo Paciente',
      body: bodyEl,
      footer: `
        <button class="btn btn-secondary" data-close>Cancelar</button>
        <button class="btn btn-primary" id="modal-save">Salvar</button>
      `
    });

    modal.element.querySelector('#modal-save').addEventListener('click', async () => {
      const name = modal.element.querySelector('#modal-patient-name').value.trim();
      const notes = modal.element.querySelector('#modal-patient-notes').value.trim();
      if (!name) { showToast('Nome é obrigatório', 'error'); return; }
      try {
        if (isEdit) {
          await updatePatient(patient.id, { name, notes });
          showToast('Paciente atualizado!');
        } else {
          await createPatient(name, notes);
          showToast('Paciente cadastrado!');
        }
        modal.close();
        await loadPatients();
      } catch (err) {
        showToast('Erro: ' + err.message, 'error');
      }
    });

    setTimeout(() => modal.element.querySelector('#modal-patient-name').focus(), 100);
  }

  function confirmDelete(patient) {
    const modal = openModal({
      title: 'Excluir Paciente',
      body: `<p>Tem certeza que deseja excluir <strong>${escapeHtml(patient.name)}</strong>? Todos os registros de exames serão perdidos.</p>`,
      footer: `
        <button class="btn btn-secondary" data-close>Cancelar</button>
        <button class="btn btn-danger" id="modal-confirm-delete">Excluir</button>
      `
    });
    modal.element.querySelector('#modal-confirm-delete').addEventListener('click', async () => {
      try {
        await deletePatient(patient.id);
        showToast('Paciente excluído');
        modal.close();
        await loadPatients();
      } catch (err) {
        showToast('Erro: ' + err.message, 'error');
      }
    });
  }

  container.querySelector('#add-patient-btn').addEventListener('click', () => openPatientModal());
  container.querySelector('#patient-search').addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    renderList(patients.filter(p => p.name.toLowerCase().includes(q)));
  });

  await loadPatients();
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
