import { getPatients, getExamTypes, getExamRecords } from '../supabase.js';
import { showToast } from '../components/toast.js';
import Chart from 'chart.js/auto';

let chartInstances = [];

export async function renderDashboard(container) {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Dashboard <span>Comparativo</span></h1>
        <p class="page-subtitle">Acompanhe a evolução dos exames</p>
      </div>
    </div>
    <div class="filter-bar">
      <div class="form-group" style="min-width:250px">
        <label class="form-label">Paciente</label>
        <select id="dash-patient-select" class="form-input form-select">
          <option value="">Selecione um paciente...</option>
        </select>
      </div>
      <div class="form-group" style="min-width:160px">
        <label class="form-label">Período</label>
        <select id="dash-period-select" class="form-input form-select">
          <option value="7">Últimos 7 dias</option>
          <option value="15">Últimos 15 dias</option>
          <option value="30" selected>Últimos 30 dias</option>
          <option value="90">Últimos 90 dias</option>
          <option value="365">Último ano</option>
          <option value="all">Todos</option>
        </select>
      </div>
    </div>
    <div id="dash-exam-chips" class="chip-group" style="display:none"></div>
    <div id="dash-content">
      <div class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
        <h3>Selecione um paciente</h3>
        <p>Escolha o paciente para ver a evolução dos exames</p>
      </div>
    </div>
  `;

  let patients = [];
  let examTypes = [];
  let records = [];
  let selectedExamIds = new Set();

  const patientSelect = container.querySelector('#dash-patient-select');
  const periodSelect = container.querySelector('#dash-period-select');
  const chipsEl = container.querySelector('#dash-exam-chips');
  const contentEl = container.querySelector('#dash-content');

  try {
    [patients, examTypes] = await Promise.all([getPatients(), getExamTypes()]);
    patients.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      patientSelect.appendChild(opt);
    });
  } catch (err) {
    showToast('Erro: ' + err.message, 'error');
  }

  patientSelect.addEventListener('change', loadDashboard);
  periodSelect.addEventListener('change', loadDashboard);

  async function loadDashboard() {
    const patientId = patientSelect.value;
    if (!patientId) return;

    contentEl.innerHTML = '<div class="spinner"></div>';
    destroyCharts();

    const periodDays = periodSelect.value;
    let startDate = null;
    if (periodDays !== 'all') {
      const d = new Date();
      d.setDate(d.getDate() - parseInt(periodDays));
      startDate = d.toISOString().split('T')[0];
    }

    try {
      records = await getExamRecords(patientId, startDate, null);
      if (records.length === 0) {
        chipsEl.style.display = 'none';
        contentEl.innerHTML = `<div class="empty-state"><h3>Sem dados</h3><p>Nenhum exame registrado neste período</p></div>`;
        return;
      }

      // Find unique exam types in records
      const usedTypeIds = [...new Set(records.map(r => r.exam_type_id))];
      const usedTypes = examTypes.filter(et => usedTypeIds.includes(et.id));

      // Init selected exams (first 6)
      if (selectedExamIds.size === 0) {
        usedTypes.slice(0, 6).forEach(et => selectedExamIds.add(et.id));
      }

      // Render chips
      chipsEl.style.display = 'flex';
      chipsEl.innerHTML = usedTypes.map(et =>
        `<span class="chip ${selectedExamIds.has(et.id) ? 'active' : ''}" data-id="${et.id}">${et.abbreviation}</span>`
      ).join('');

      chipsEl.querySelectorAll('.chip').forEach(chip => {
        chip.addEventListener('click', () => {
          const id = chip.dataset.id;
          if (selectedExamIds.has(id)) selectedExamIds.delete(id);
          else selectedExamIds.add(id);
          chip.classList.toggle('active');
          renderCharts();
        });
      });

      renderCharts();
    } catch (err) {
      showToast('Erro: ' + err.message, 'error');
    }
  }

  function renderCharts() {
    destroyCharts();
    const selectedTypes = examTypes.filter(et => selectedExamIds.has(et.id));
    if (selectedTypes.length === 0) {
      contentEl.innerHTML = '<div class="empty-state"><h3>Selecione exames</h3><p>Clique nos chips acima para visualizar</p></div>';
      return;
    }

    // Get sorted unique dates
    const dates = [...new Set(records.map(r => r.exam_date))].sort();

    // Build charts + table
    let chartsHtml = '';
    selectedTypes.forEach(et => {
      const canvasId = `chart-${et.id}`;
      chartsHtml += `
        <div class="chart-container">
          <div class="chart-title">${escapeHtml(et.name)} (${et.abbreviation}) ${et.unit ? '— ' + et.unit : ''}</div>
          <div class="chart-canvas-wrapper"><canvas id="${canvasId}"></canvas></div>
        </div>
      `;
    });

    // Build comparison table
    let tableHtml = `<div class="chart-container" style="margin-top:8px">
      <div class="chart-title">Tabela Comparativa</div>
      <div class="table-wrapper"><table>
        <thead><tr><th>Exame</th>${dates.map(d => `<th>${formatDate(d)}</th>`).join('')}</tr></thead>
        <tbody>`;

    selectedTypes.forEach(et => {
      tableHtml += `<tr><td><strong style="color:var(--accent)">${et.abbreviation}</strong></td>`;
      dates.forEach(date => {
        const rec = records.find(r => r.exam_type_id === et.id && r.exam_date === date);
        if (rec) {
          let cls = '';
          if (et.reference_max != null && rec.value > et.reference_max) cls = 'value-high';
          if (et.reference_min != null && rec.value < et.reference_min) cls = 'value-low';
          tableHtml += `<td class="${cls}">${rec.value}</td>`;
        } else {
          tableHtml += `<td style="color:var(--text-muted)">—</td>`;
        }
      });
      tableHtml += '</tr>';
    });

    tableHtml += '</tbody></table></div></div>';
    contentEl.innerHTML = chartsHtml + tableHtml;

    // Create Chart.js instances
    const colors = [
      '#00d4aa', '#4dc9f6', '#f67019', '#f53794',
      '#537bc4', '#acc236', '#166a8f', '#00a950',
      '#58595b', '#8549ba'
    ];

    selectedTypes.forEach((et, idx) => {
      const ctx = document.getElementById(`chart-${et.id}`);
      if (!ctx) return;

      const etRecords = records
        .filter(r => r.exam_type_id === et.id)
        .sort((a, b) => a.exam_date.localeCompare(b.exam_date));

      const chartData = {
        labels: etRecords.map(r => formatDate(r.exam_date)),
        datasets: [{
          label: et.abbreviation,
          data: etRecords.map(r => r.value),
          borderColor: colors[idx % colors.length],
          backgroundColor: colors[idx % colors.length] + '20',
          tension: 0.3,
          fill: true,
          pointRadius: 4,
          pointHoverRadius: 6,
          borderWidth: 2
        }]
      };

      // Add reference lines if available
      const annotations = {};
      if (et.reference_min != null) {
        chartData.datasets.push({
          label: 'Mín. Ref.',
          data: etRecords.map(() => et.reference_min),
          borderColor: 'rgba(255,165,2,0.4)',
          borderDash: [5, 5],
          pointRadius: 0,
          borderWidth: 1,
          fill: false
        });
      }
      if (et.reference_max != null) {
        chartData.datasets.push({
          label: 'Máx. Ref.',
          data: etRecords.map(() => et.reference_max),
          borderColor: 'rgba(255,71,87,0.4)',
          borderDash: [5, 5],
          pointRadius: 0,
          borderWidth: 1,
          fill: false
        });
      }

      const chart = new Chart(ctx, {
        type: 'line',
        data: chartData,
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { intersect: false, mode: 'index' },
          plugins: {
            legend: {
              labels: { color: '#8888a8', font: { family: 'Inter', size: 11 } }
            },
            tooltip: {
              backgroundColor: '#1a1a3a',
              titleColor: '#e8e8f0',
              bodyColor: '#8888a8',
              borderColor: 'rgba(255,255,255,0.1)',
              borderWidth: 1,
              cornerRadius: 8,
              padding: 10
            }
          },
          scales: {
            x: {
              ticks: { color: '#55556a', font: { family: 'Inter', size: 10 } },
              grid: { color: 'rgba(255,255,255,0.04)' }
            },
            y: {
              ticks: { color: '#55556a', font: { family: 'Inter', size: 10 } },
              grid: { color: 'rgba(255,255,255,0.04)' }
            }
          }
        }
      });
      chartInstances.push(chart);
    });
  }

  function destroyCharts() {
    chartInstances.forEach(c => c.destroy());
    chartInstances = [];
  }
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function formatDate(dateStr) {
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}`;
}
