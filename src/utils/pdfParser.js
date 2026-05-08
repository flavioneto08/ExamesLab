/**
 * pdfParser.js
 * Parser de laudos laboratoriais padronizados da
 * Secretaria de Estado da Saúde de SP (SES-SP).
 *
 * Estratégia: extração posicional via pdfjs-dist.
 * - X (coluna) é fixo pelo layout do laudo → identifica o tipo do dado
 * - Y (linha) é dinâmico → percorrido sem limite de quantidade de exames
 *
 * Funciona com 1 ou múltiplas páginas, 3 ou 30 exames.
 */

import * as pdfjsLib from 'pdfjs-dist';

// Aponta para o worker bundled (Vite copia o arquivo automaticamente)
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

// ---------------------------------------------------------------------------
// Tabela de alias: Nome completo do PDF → Abreviação canônica no BD
// Adicione novas entradas conforme novos tipos de laudo aparecerem.
// A comparação é feita sempre em UPPER CASE.
// ---------------------------------------------------------------------------
const PDF_NAME_TO_ABBR = {
  // Bioquímica
  'PROTEÍNAS TOTAIS':      'PT',
  'PROTEINAS TOTAIS':      'PT',
  'GLICOSE':               'GLICOS',
  'CLORO':                 'CL',
  'SÓDIO':                 'NA',
  'SODIO':                 'NA',
  'POTÁSSIO':              'K',
  'POTASSIO':              'K',
  'UREIA':                 'U',
  'URÉIA':                 'U',
  'CREATININA':            'CR',
  'CÁLCIO':                'CA',
  'CALCIO':                'CA',
  'FÓSFORO':               'FOSF',
  'FOSFORO':               'FOSF',
  'MAGNÉSIO':              'MG',
  'MAGNESIO':              'MG',
  'BILIRRUBINA TOTAL':     'BT',
  'BILIRRUBINA DIRETA':    'BD',
  'BILIRRUBINA INDIRETA':  'BI',
  'TGO':                   'TGO',
  'TGP':                   'TGP',
  'FOSFATASE ALCALINA':    'FALC',
  'AMILASE':               'AMIL',
  'LIPASE':                'LIP',
  'ALBUMINA':              'ALB',
  'PCR':                   'PCR',
  'PROTEÍNA C REATIVA':    'PCR',
  'PROTEINA C REATIVA':    'PCR',
  'LACTATO':               'LAC',
  'TRIGLICÉRIDES':         'TG',
  'TRIGLICERIDES':         'TG',
  'COLESTEROL TOTAL':      'COLT',
  'LDH':                   'LDH',
  'FERRITINA':             'FERRIT',
  'FERRO':                 'FE',
  // Hematologia / LCR
  'LEUCÓCITOS':            'LEUCOS',
  'LEUCOCITOS':            'LEUCOS',
  'HEMÁCIAS':              'HEM',
  'HEMACIAS':              'HEM',
  'HEMOGLOBINA':           'HB',
  'HEMATÓCRITO':           'HT',
  'HEMATOCRITO':           'HT',
  'PLAQUETAS':             'PQT',
  'VCM':                   'VCM',
  'HCM':                   'HCM',
  'CHCM':                  'CHCM',
  'NEUTRÓFILOS':           'NEUT',
  'NEUTROFILOS':           'NEUT',
  'LINFÓCITOS':            'LINF',
  'LINFOCITOS':            'LINF',
  'MONÓCITOS':             'MONO',
  'MONOCITOS':             'MONO',
  'EOSINÓFILOS':           'EOS',
  'EOSINOFILOS':           'EOS',
  'BASÓFILOS':             'BASO',
  'BASOFILOS':             'BASO',
  'POLIMORFONUCLEARES':    'POLIMORFO',
  'MONONUCLEARES':         'MONONU',
  // LCR específico
  'VOLUME':                'VOL',
  'GLICOSE (LCR)':         'GLICOS_LCR',
  'PROTEÍNAS (LCR)':       'PT_LCR',
  'PROTEINAS (LCR)':       'PT_LCR',
};

// Lookup com normalização UPPER CASE para compatibilidade com Title Case do PDF
function getAbbr(rawName) {
  const upper = rawName.toUpperCase();
  return PDF_NAME_TO_ABBR[upper] || null;
}

/**
 * Gera abreviação automática a partir do nome completo quando não há
 * entrada na tabela de alias. Usa primeiras letras de cada palavra.
 * Ex: "HEMOGLOBINA GLICADA" → "HEMGLIC"
 */
function autoAbbr(name) {
  const words = name.trim().toUpperCase().split(/\s+/);
  if (words.length === 1) {
    // Uma única palavra: primeiros 6 caracteres
    return words[0].slice(0, 6);
  }
  // Múltiplas palavras: primeiras 3 letras da primeira + 3 da última
  return (words[0].slice(0, 3) + words[words.length - 1].slice(0, 3));
}

/**
 * Converte string de referência "10 - 45 mg/dL" → { min: 10, max: 45 }
 * Retorna null para referências não numéricas (ex: "Ausente", "2/3 da glicemia").
 */
function parseReference(refStr) {
  if (!refStr) return { min: null, max: null };
  // Remove unidade da referência (mg/dL, mmol/L, etc.)
  const clean = refStr.replace(/[a-zA-Z\/µμ%°]+/g, ' ').trim();
  // Padrão: número - número  (ex: "10 - 45" ou "118 - 132")
  const m = clean.match(/([\d.,]+)\s*[-–]\s*([\d.,]+)/);
  if (m) {
    return {
      min: parseFloat(m[1].replace(',', '.')),
      max: parseFloat(m[2].replace(',', '.'))
    };
  }
  return { min: null, max: null };
}

/**
 * Converte valor numérico em string BR para float.
 * "323,90" → 323.9 | "270.000" → 270000
 */
function parseBrNumber(str) {
  const s = str.trim();
  if (/^\d+\.\d{3}$/.test(s)) return parseFloat(s.replace('.', ''));
  return parseFloat(s.replace(',', '.'));
}

// ---------------------------------------------------------------------------
// Posições X aproximadas das colunas do layout SES-SP
// (medidas empíricas do PDF analisado — tolerância de ±20px)
// ---------------------------------------------------------------------------
const COL = {
  EXAM_NAME_MAX:  120,   // Nome do exame: x < 120
  VALUE_MIN:      110,   // Valor numérico: 110 ≤ x ≤ 275
  VALUE_MAX:      275,
  REF_MIN:        295,   // Referência: 295 ≤ x ≤ 450
  REF_MAX:        450,
  // Cabeçalho: coluna direita de metadados
  HEADER_DATA_X:  470,   // x > 470 na região do cabeçalho (y > 700)
  HEADER_Y_MIN:   700,   // Região do cabeçalho (y alto = topo da página)
};

// Títulos de seção — linhas com esses textos são ignoradas como dados
const SECTION_HEADERS = new Set([
  'ANÁLISE BIOQUÍMICA', 'ANALISE BIOQUIMICA',
  'ANÁLISE CITOLÓGICA', 'ANALISE CITOLOGICA',
  'ANÁLISE MICROBIOLÓGICA', 'ANALISE MICROBIOLOGICA',
  'ANÁLISE IMUNOLÓGICA', 'ANALISE IMUNOLOGICA',
  'HEMOGRAMA', 'COAGULOGRAMA', 'URINA TIPO I',
  'PRÉ CENTRIFUGAÇÃO', 'PRE CENTRIFUGACAO',
  'APÓS CENTRIFUGAÇÃO', 'APOS CENTRIFUGACAO',
  'RESULTADO', 'VALORES DE REFERÊNCIA', 'METODO', 'MÉTODO',
]);

// Linhas do cabeçalho com metadados (ignorar como exames)
const HEADER_LABELS = new Set([
  'NOME:', 'REGISTRO:', 'SEXO:', 'IDADE:', 'DATA NASC:', 'CONVÊNIO:', 'CONVÊNIO:',
  'DR. (A):', 'CLÍNICA:', 'CADASTRO:', 'Nº REQUISIÇÃO:', 'FOLHA:',
  'EMISSÃO:', 'COLETADO EM:', 'LIBERADO EM:',
]);

/**
 * Agrupa items de texto por linhas (Y ± tolerância).
 * Retorna array de linhas ordenadas de Y maior (topo) para menor (base).
 */
function groupByRows(items, tolerance = 6) {
  // Ordenar por Y decrescente, depois X crescente
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const rows = [];
  let currentRow = [];
  let currentY = null;

  for (const item of sorted) {
    if (currentY === null || Math.abs(item.y - currentY) <= tolerance) {
      currentRow.push(item);
      // Atualiza Y médio da linha
      currentY = currentRow.reduce((s, i) => s + i.y, 0) / currentRow.length;
    } else {
      if (currentRow.length > 0) rows.push(currentRow);
      currentRow = [item];
      currentY = item.y;
    }
  }
  if (currentRow.length > 0) rows.push(currentRow);
  return rows;
}

/**
 * Extrai todos os items de texto com posição X,Y de todas as páginas do PDF.
 */
async function extractItems(pdf) {
  const allItems = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    for (const item of content.items) {
      const str = item.str.trim();
      if (str) {
        allItems.push({
          str,
          x: Math.round(item.transform[4]),
          y: Math.round(item.transform[5]),
          page: p,
        });
      }
    }
  }
  return allItems;
}

/**
 * Detecta a data de coleta no cabeçalho do laudo.
 * Procura padrões DD/MM/AAAA HH:mm na região de cabeçalho (y > 700, x > 470).
 */
function detectCollectionDate(rows) {
  const dateRe = /(\d{2}\/\d{2}\/\d{4})/;

  for (const row of rows) {
    // Só olhar região do cabeçalho
    if (row[0].y < COL.HEADER_Y_MIN) break;

    for (const item of row) {
      // "Cadastro:" / "Coletado em:" geralmente fica com x≈497, y≈718
      if (item.x > COL.HEADER_DATA_X) {
        const m = item.str.match(dateRe);
        if (m) {
          // Converter DD/MM/AAAA → AAAA-MM-DD
          const [d, mo, y] = m[1].split('/');
          return `${y}-${mo}-${d}`;
        }
      }
    }
  }
  return null;
}

/**
 * Detecta o nome do paciente no cabeçalho.
 */
function detectPatientName(rows) {
  for (const row of rows) {
    if (row[0].y < COL.HEADER_Y_MIN) break;
    for (const item of row) {
      // Nome fica em x≈177, y≈742 — mas verificamos só pela posição relativa
      if (item.x > 150 && item.x < 440 && item.y > 735 && item.y < 750) {
        return item.str.trim();
      }
    }
  }
  return null;
}

/**
 * Detecta o número da requisição.
 */
function detectReqNumber(rows) {
  for (const row of rows) {
    if (row[0].y < COL.HEADER_Y_MIN) break;
    for (const item of row) {
      // Nº Requisição fica em x≈497, y≈755
      if (item.x > COL.HEADER_DATA_X && item.y > 748 && item.y < 762) {
        if (/^\d{10,}$/.test(item.str)) return item.str;
      }
    }
  }
  return null;
}

/**
 * Processa uma única linha de texto e tenta extrair um exame numérico.
 * Retorna null se a linha não representa um exame numérico válido.
 *
 * Layout esperado na linha:
 *   [nome, x<120] [": ", opcional] [valor, 110≤x≤275] [unidade, x próxima ao valor]
 *   [referência, x≈313]
 */
function parseExamRow(row) {
  // Coletar itens por coluna — excluir valores puramente numéricos da coluna de nome
  // (evita capturar o valor do exame como parte do nome, ex: "Volume : 02 mL")
  const nameItems = row.filter(i => i.x < COL.EXAM_NAME_MAX && !/^[\d.,]+$/.test(i.str) && i.str !== ':');
  const valueItems = row.filter(i => i.x >= COL.VALUE_MIN && i.x <= COL.VALUE_MAX);
  const refItems = row.filter(i => i.x >= COL.REF_MIN && i.x <= COL.REF_MAX);

  if (nameItems.length === 0 || valueItems.length === 0) return null;

  // Montar nome completo (pode haver múltiplos items na coluna do nome)
  const rawName = nameItems.map(i => i.str).join(' ')
    .replace(/\s*:\s*$/, '') // remove ":" final
    .trim();

  // Comparação em UPPER para os filtros
  const rawNameUpper = rawName.toUpperCase();
  if (!rawName || SECTION_HEADERS.has(rawNameUpper)) return null;
  if (HEADER_LABELS.has(rawNameUpper + ':') || HEADER_LABELS.has(rawNameUpper)) return null;

  // Valor: pegar o primeiro item numérico na coluna de valor
  let numericValueStr = null;
  let unitStr = '';

  for (const vi of valueItems) {
    // Aceita: "323,90", "33", "127", "02", "00", "5"
    if (/^[\d.,]+$/.test(vi.str)) {
      numericValueStr = vi.str;
      // Unidade: próximo item na mesma linha com x > vi.x (fora da coluna de valor)
      const afterValue = row.filter(i => i.x > vi.x + 5 && i.x < COL.REF_MIN);
      if (afterValue.length > 0) unitStr = afterValue[0].str.trim();
      break;
    }
  }

  if (numericValueStr === null) return null;

  const numValue = parseBrNumber(numericValueStr);
  if (isNaN(numValue)) return null;

  // Referência
  const refText = refItems.map(i => i.str).join(' ').trim();
  const { min: ref_min, max: ref_max } = parseReference(refText);

  // Abreviação: usar tabela de alias (case-insensitive) ou gerar automaticamente
  const abbr = getAbbr(rawName) || autoAbbr(rawName);

  return {
    name: rawName,   // nome original preservado (Title Case ou UPPER conforme o PDF)
    abbr,
    value: numValue,
    unit: unitStr,
    ref_min,
    ref_max,
    rawRef: refText || null,
  };
}

// ---------------------------------------------------------------------------
// Função principal exportada
// ---------------------------------------------------------------------------

/**
 * Parseia um laudo PDF da SES-SP a partir de um ArrayBuffer.
 *
 * @param {ArrayBuffer} arrayBuffer - Conteúdo do arquivo PDF
 * @returns {Promise<{
 *   date: string|null,
 *   patientName: string|null,
 *   reqNumber: string|null,
 *   entries: Array<{name, abbr, value, unit, ref_min, ref_max, rawRef}>
 * }>}
 */
export async function parseSesSpPdf(arrayBuffer) {
  const data = new Uint8Array(arrayBuffer);

  // Carregar o PDF (sem worker em alguns browsers — fallback para fake worker)
  let pdf;
  try {
    const loadingTask = pdfjsLib.getDocument({ data });
    pdf = await loadingTask.promise;
  } catch (err) {
    throw new Error('Não foi possível ler o PDF: ' + err.message);
  }

  // Extrair todos os items de texto com posição X,Y
  const items = await extractItems(pdf);

  if (items.length === 0) {
    throw new Error('O PDF não contém texto extraível. Pode ser um PDF escaneado (imagem).');
  }

  // Agrupar em linhas por Y
  const rows = groupByRows(items);

  // Extrair metadados do cabeçalho
  const date = detectCollectionDate(rows);
  const patientName = detectPatientName(rows);
  const reqNumber = detectReqNumber(rows);

  // Percorrer todas as linhas e extrair exames numéricos
  const entries = [];
  const seenAbbrs = new Set(); // evitar duplicatas (PDF tem 2 páginas com cabeçalho repetido)

  for (const row of rows) {
    // Ignorar linhas do cabeçalho (y > 700)
    if (row[0].y >= COL.HEADER_Y_MIN) continue;
    // Ignorar linhas do rodapé (y < 100)
    if (row[0].y < 100) continue;

    const exam = parseExamRow(row);
    if (!exam) continue;

    // Deduplicar por abreviação (o mesmo exame pode aparecer no cabeçalho de pág 2)
    const key = exam.abbr + '|' + exam.value;
    if (seenAbbrs.has(key)) continue;
    seenAbbrs.add(key);

    entries.push(exam);
  }

  // Ordenar pela posição Y (topo para baixo = ordem natural do laudo)
  // rows já estão em ordem decrescente de Y, então os entries estão na ordem certa

  return { date, patientName, reqNumber, entries };
}
