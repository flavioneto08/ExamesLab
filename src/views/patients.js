import { getPatients, createPatient, updatePatient, deletePatient, getPatientStats } from '../supabase.js';
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

  async function loadPatients() {
    try {
      patients = await getPatients();
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

    listEl.querySelectorAll('.patient-card').forEach(card => {
      card.addEventListener('click', () => {
        window.location.hash = `#/exames?paciente=${card.dataset.id}`;
      });
    });
  }

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

    modal.element.querySelector('[data-close]').addEventListener('click', modal.close);
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
    modal.element.querySelector('[data-close]').addEventListener('click', modal.close);
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
  d.textContent = str;
  return d.innerHTML;
}

function formatDate(dateStr) {
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}
