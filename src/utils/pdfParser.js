/**
 * pdfParser.js
 * Parser de laudos laboratoriais padronizados da
 * Secretaria de Estado da Saúde de SP (SES-SP).
 *
 * Suporta dois layouts:
 *   - Legacy (líquor): tabular, uma linha por exame.
 *   - Block (multi-exame): cada exame é um bloco vertical com
 *     "Coletado em / Liberado em / Valor / Histórico de resultados".
 *
 * Detecção do formato é automática (presença de "Histórico de resultados").
 */

import * as pdfjsLib from 'pdfjs-dist';

// Aponta para o worker bundled (Vite copia o arquivo automaticamente)
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

// ---------------------------------------------------------------------------
// Tabela de alias: Nome completo do PDF → Abreviação canônica no BD.
// Comparação sempre em UPPER CASE; o nome lookup é feito após cleanExamName
// (que remove sufixos de material como ", SORO" ou ", SANGUE").
// ---------------------------------------------------------------------------
const PDF_NAME_TO_ABBR = {
  // Bioquímica
  'PROTEÍNAS TOTAIS':                     'PT',
  'PROTEINAS TOTAIS':                     'PT',
  'GLICOSE':                              'GLICOS',
  'CLORO':                                'CL',
  'SÓDIO':                                'NA',
  'SODIO':                                'NA',
  'POTÁSSIO':                             'K',
  'POTASSIO':                             'K',
  'UREIA':                                'U',
  'URÉIA':                                'U',
  'CREATININA':                           'CR',
  'CÁLCIO':                               'CA',
  'CALCIO':                               'CA',
  'CÁLCIO TOTAL':                         'CA',
  'CALCIO TOTAL':                         'CA',
  'FÓSFORO':                              'FOSF',
  'FOSFORO':                              'FOSF',
  'MAGNÉSIO':                             'MG',
  'MAGNESIO':                             'MG',
  'BILIRRUBINA TOTAL':                    'BT',
  'BILIRRUBINA DIRETA':                   'BD',
  'BILIRRUBINA INDIRETA':                 'BI',
  'TGO':                                  'TGO',
  'TGP':                                  'TGP',
  'TGO - ASPARTATO AMINO TRANSFERASE':    'TGO',
  'TGP - ALANINA AMINOTRANSFERASE':       'TGP',
  'ASPARTATO AMINO TRANSFERASE':          'TGO',
  'ALANINA AMINOTRANSFERASE':             'TGP',
  'FOSFATASE ALCALINA':                   'FALC',
  'GAMA GLUTAMIL TRANSFERASE':            'GGT',
  'GAMA GT':                              'GGT',
  'AMILASE':                              'AMIL',
  'LIPASE':                               'LIP',
  'ALBUMINA':                             'ALB',
  'GLOBULINAS':                           'GLOB',
  'PCR':                                  'PCR',
  'PROTEÍNA C REATIVA':                   'PCR',
  'PROTEINA C REATIVA':                   'PCR',
  'PROTEÍNA C REATIVA (PCR)':             'PCR',
  'PROTEINA C REATIVA (PCR)':             'PCR',
  'LACTATO':                              'LAC',
  'TRIGLICÉRIDES':                        'TG',
  'TRIGLICERIDES':                        'TG',
  'COLESTEROL TOTAL':                     'COLT',
  'LDH':                                  'LDH',
  'DHL':                                  'LDH',
  'DESIDROGENASE LÁCTICA':                'LDH',
  'DESIDROGENASE LACTICA':                'LDH',
  'DHL - DESIDROGENASE LÁCTICA':          'LDH',
  'DHL - DESIDROGENASE LACTICA':          'LDH',
  'FERRITINA':                            'FERRIT',
  'FERRO':                                'FE',
  // Hematologia / LCR
  'LEUCÓCITOS':                           'LEUCOS',
  'LEUCOCITOS':                           'LEUCOS',
  'HEMÁCIAS':                             'HEM',
  'HEMACIAS':                             'HEM',
  'ERITRÓCITOS':                          'HEM',
  'ERITROCITOS':                          'HEM',
  'HEMOGLOBINA':                          'HB',
  'HEMATÓCRITO':                          'HT',
  'HEMATOCRITO':                          'HT',
  'PLAQUETAS':                            'PQT',
  'VCM':                                  'VCM',
  'HCM':                                  'HCM',
  'CHCM':                                 'CHCM',
  'RDW':                                  'RDW',
  'RDW-CV':                               'RDW',
  'NEUTRÓFILOS':                          'NEUT',
  'NEUTROFILOS':                          'NEUT',
  'SEGMENTADOS':                          'SEG',
  'LINFÓCITOS':                           'LINF',
  'LINFOCITOS':                           'LINF',
  'MONÓCITOS':                            'MONO',
  'MONOCITOS':                            'MONO',
  'EOSINÓFILOS':                          'EOS',
  'EOSINOFILOS':                          'EOS',
  'BASÓFILOS':                            'BASO',
  'BASOFILOS':                            'BASO',
  'POLIMORFONUCLEARES':                   'POLIMORFO',
  'MONONUCLEARES':                        'MONONU',
  // Coagulograma
  'TP':                                   'TP',
  'TEMPO DE PROTROMBINA':                 'TP',
  'ATIVIDADE':                            'ATIV',
  'INR':                                  'INR',
  'TTPA':                                 'TTPA',
  'TEMPO DE TROMBOPLASTINA PARCIAL ATIVADA': 'TTPA',
  'RELAÇÃO':                              'RTTPA',
  'RELACAO':                              'RTTPA',
  // LCR específico
  'VOLUME':                               'VOL',
  'GLICOSE (LCR)':                        'GLICOS_LCR',
  'PROTEÍNAS (LCR)':                      'PT_LCR',
  'PROTEINAS (LCR)':                      'PT_LCR',
};

// Sufixos de material que devem ser removidos do nome canônico.
// Ex: "CÁLCIO TOTAL, SORO" → "CÁLCIO TOTAL"
const MATERIAL_SUFFIX_RE = /,\s*(SORO|SANGUE|PLASMA\s+CITRATADO|PLASMA|L[ÍI]QUOR|URINA|L[CR]R)\s*$/i;

function cleanExamName(rawName) {
  if (!rawName) return '';
  return rawName.replace(MATERIAL_SUFFIX_RE, '').trim();
}

// Lookup com normalização UPPER CASE para compatibilidade com Title Case do PDF
function getAbbr(rawName) {
  const upper = cleanExamName(rawName).toUpperCase();
  return PDF_NAME_TO_ABBR[upper] || null;
}

/**
 * Gera abreviação automática a partir do nome completo quando não há
 * entrada na tabela de alias. Usa primeiras letras de cada palavra.
 * Ex: "HEMOGLOBINA GLICADA" → "HEMGLIC"
 */
function autoAbbr(name) {
  const words = cleanExamName(name).trim().toUpperCase().split(/\s+/);
  if (words.length === 1) {
    return words[0].slice(0, 6);
  }
  return (words[0].slice(0, 3) + words[words.length - 1].slice(0, 3));
}

/**
 * Converte string de referência em { min, max }.
 * Suporta: "10 - 45", "10 a 45", "Adultos: 10 a 45", "até 0,3", "> 70", "< 1", "Até 1,00".
 * Retorna { min: null, max: null } para padrões não reconhecidos.
 */
function parseReference(refStr) {
  if (!refStr) return { min: null, max: null };

  // Padrões "abertos" (limite só superior ou só inferior) têm precedência —
  // evita pegar "0,1 a 0,3" do qualificador "Risco cardíaco" quando a
  // referência principal é "inferior a 1 mg/dL".
  const inf = refStr.match(/inferior\s+a\s+([\d.,]+)/i);
  if (inf) return { min: null, max: parseFloat(inf[1].replace(',', '.')) };
  const sup = refStr.match(/superior\s+a\s+([\d.,]+)/i);
  if (sup) return { min: parseFloat(sup[1].replace(',', '.')), max: null };
  const ate = refStr.match(/at[ée]\s*([\d.,]+)/i);
  if (ate) return { min: null, max: parseFloat(ate[1].replace(',', '.')) };

  // Limpa unidade e prefixos comuns; preserva números, separadores e sinais.
  // Ex.: "Adultos: 13 a 39 U/L" → " 13 a 39 "
  const clean = refStr
    .replace(/Adultos?:|Feminino:|Masculino:|Crian[çc]as?:/gi, ' ')
    .replace(/[a-zA-ZµμÁÀÃÂÉÊÍÓÔÕÚÇáàãâéêíóôõúç\/%°³²]+/g, ' ')
    .trim();

  // Range: "X a Y" ou "X - Y"
  const range = clean.match(/([\d.,]+)\s*[-–a]\s*([\d.,]+)/);
  if (range) {
    return {
      min: parseFloat(range[1].replace(',', '.')),
      max: parseFloat(range[2].replace(',', '.')),
    };
  }
  // Comparadores
  const gt = clean.match(/>\s*([\d.,]+)/);
  if (gt) return { min: parseFloat(gt[1].replace(',', '.')), max: null };
  const lt = clean.match(/<\s*([\d.,]+)/);
  if (lt) return { min: null, max: parseFloat(lt[1].replace(',', '.')) };

  return { min: null, max: null };
}

/**
 * Heurística para detectar se um item é unidade (vs. parte de referência).
 * Rejeita strings que começam com prefixos de referência ("Até", "Adultos:",
 * "Feminino:", etc.) ou misturam números e texto (ex.: "Até 1,00").
 */
function looksLikeUnit(str) {
  if (!str) return false;
  if (/^(At[ée]|Adultos?|Femini|Mascul|Crian|Risco|inferior|superior|moderad|baixo|alto)/i.test(str)) return false;
  // Espaço + (dígito ou < > =) sugere referência, não unidade
  if (/\s/.test(str) && /[\d<>=]/.test(str)) return false;
  if (str.length > 18) return false;
  return /^[A-Za-zµμÁÀÃÂÉÊÍÓÔÕÚÇáàãâéêíóôõúç%/³²°.\d]+$/.test(str);
}

/**
 * Converte valor numérico em string BR para float.
 * "323,90" → 323.9 | "270.000" → 270000 | "12.5" → 12.5
 */
function parseBrNumber(str) {
  const s = String(str).trim();
  // Padrão "270.000" (milhar com ponto): converte para 270000
  if (/^\d+\.\d{3}$/.test(s)) return parseFloat(s.replace('.', ''));
  return parseFloat(s.replace(',', '.'));
}

/**
 * Agrupa items de texto por linhas (Y ± tolerância), respeitando a página.
 * Items de páginas diferentes nunca são agrupados, mesmo com Y similar.
 * Retorna array de linhas em ordem de leitura: página crescente, depois Y
 * decrescente (topo → base) dentro de cada página.
 */
function groupByRows(items, tolerance = 6) {
  // Ordenar por página crescente, depois Y decrescente (topo → base), depois X
  const sorted = [...items].sort((a, b) =>
    a.page - b.page || b.y - a.y || a.x - b.x
  );
  const rows = [];
  let currentRow = [];
  let currentY = null;
  let currentPage = null;

  const flush = () => {
    if (currentRow.length > 0) {
      // Ordena items da linha por X crescente (esquerda → direita) para que
      // row[0] seja sempre o mais à esquerda — vários consumidores assumem isso.
      currentRow.sort((a, b) => a.x - b.x);
      rows.push(currentRow);
    }
  };

  for (const item of sorted) {
    const samePage = item.page === currentPage;
    if (samePage && currentY !== null && Math.abs(item.y - currentY) <= tolerance) {
      currentRow.push(item);
      currentY = currentRow.reduce((s, i) => s + i.y, 0) / currentRow.length;
    } else {
      flush();
      currentRow = [item];
      currentY = item.y;
      currentPage = item.page;
    }
  }
  flush();
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

// ---------------------------------------------------------------------------
// Detecção de formato
// ---------------------------------------------------------------------------

function detectFormat(items) {
  // Junta tudo num único texto pois o PDF pode quebrar a frase em items
  const fullText = items.map(i => i.str).join(' ').toUpperCase();
  if (fullText.includes('HISTÓRICO DE RESULTADOS') || fullText.includes('HISTORICO DE RESULTADOS')) {
    return 'block';
  }
  return 'legacy';
}

// ---------------------------------------------------------------------------
// Cabeçalho compartilhado: nome do paciente, data de coleta, nº requisição
// ---------------------------------------------------------------------------

function detectCollectionDate(rows) {
  // A data desejada é a de "Cadastro:" (=coleta), não a de "Emissão:".
  // Estratégia: localizar o label "Cadastro:" na 1ª página e pegar a data
  // na mesma linha (Y similar), à direita. Fallback: data mais à direita
  // entre y 705-720.
  const dateRe = /(\d{2})\/(\d{2})\/(\d{4})/;
  const page1 = rows.filter(r => r[0].page === 1);

  // Tenta achar "Cadastro:" e a data na mesma linha
  for (const row of page1) {
    if (row[0].y < 700) break;
    const labelItem = row.find(i => /^Cadastro:?$/i.test(i.str));
    if (!labelItem) continue;
    // Data na mesma linha, à direita do label
    for (const item of row) {
      if (item.x > labelItem.x) {
        const m = item.str.match(dateRe);
        if (m) return `${m[3]}-${m[2]}-${m[1]}`;
      }
    }
  }

  // Fallback: data com y entre 705-720, x > 470 (faixa típica de Cadastro)
  for (const row of page1) {
    if (row[0].y < 705 || row[0].y > 720) continue;
    for (const item of row) {
      if (item.x > 470) {
        const m = item.str.match(dateRe);
        if (m) return `${m[3]}-${m[2]}-${m[1]}`;
      }
    }
  }

  // Último fallback: qualquer data no cabeçalho da página 1
  for (const row of page1) {
    if (row[0].y < 700) break;
    for (const item of row) {
      if (item.x > 470) {
        const m = item.str.match(dateRe);
        if (m) return `${m[3]}-${m[2]}-${m[1]}`;
      }
    }
  }
  return null;
}

function detectPatientName(rows) {
  const page1 = rows.filter(r => r[0].page === 1);
  for (const row of page1) {
    if (row[0].y < 700) break;
    for (const item of row) {
      if (item.x > 150 && item.x < 440 && item.y > 735 && item.y < 760) {
        const s = item.str.trim();
        if (s.length > 4 && /\s/.test(s) && /^[A-ZÁÀÃÂÉÊÍÓÔÕÚÇ ]+$/.test(s)) {
          return s;
        }
      }
    }
  }
  return null;
}

function detectReqNumber(rows) {
  const page1 = rows.filter(r => r[0].page === 1);
  for (const row of page1) {
    if (row[0].y < 700) break;
    for (const item of row) {
      if (item.x > 470 && /^\d{10,}$/.test(item.str)) return item.str;
    }
  }
  return null;
}

// ===========================================================================
// FORMATO LEGADO (Quimiocitológico de Líquor — layout tabular)
// ===========================================================================

const LEGACY_COL = {
  EXAM_NAME_MAX:  120,
  VALUE_MIN:      110,
  VALUE_MAX:      275,
  REF_MIN:        295,
  REF_MAX:        450,
  HEADER_Y_MIN:   700,
};

const LEGACY_SECTION_HEADERS = new Set([
  'ANÁLISE BIOQUÍMICA', 'ANALISE BIOQUIMICA',
  'ANÁLISE CITOLÓGICA', 'ANALISE CITOLOGICA',
  'ANÁLISE MICROBIOLÓGICA', 'ANALISE MICROBIOLOGICA',
  'ANÁLISE IMUNOLÓGICA', 'ANALISE IMUNOLOGICA',
  'HEMOGRAMA', 'COAGULOGRAMA', 'URINA TIPO I',
  'PRÉ CENTRIFUGAÇÃO', 'PRE CENTRIFUGACAO',
  'APÓS CENTRIFUGAÇÃO', 'APOS CENTRIFUGACAO',
  'RESULTADO', 'VALORES DE REFERÊNCIA', 'METODO', 'MÉTODO',
]);

const LEGACY_HEADER_LABELS = new Set([
  'NOME:', 'REGISTRO:', 'SEXO:', 'IDADE:', 'DATA NASC:', 'CONVÊNIO:',
  'DR. (A):', 'CLÍNICA:', 'CADASTRO:', 'Nº REQUISIÇÃO:', 'FOLHA:',
  'EMISSÃO:', 'COLETADO EM:', 'LIBERADO EM:',
]);

function parseLegacyExamRow(row) {
  const nameItems = row.filter(i => i.x < LEGACY_COL.EXAM_NAME_MAX && !/^[\d.,]+$/.test(i.str) && i.str !== ':');
  const valueItems = row.filter(i => i.x >= LEGACY_COL.VALUE_MIN && i.x <= LEGACY_COL.VALUE_MAX);
  const refItems = row.filter(i => i.x >= LEGACY_COL.REF_MIN && i.x <= LEGACY_COL.REF_MAX);

  if (nameItems.length === 0 || valueItems.length === 0) return null;

  const rawName = nameItems.map(i => i.str).join(' ').replace(/\s*:\s*$/, '').trim();
  const rawNameUpper = rawName.toUpperCase();
  if (!rawName || LEGACY_SECTION_HEADERS.has(rawNameUpper)) return null;
  if (LEGACY_HEADER_LABELS.has(rawNameUpper + ':') || LEGACY_HEADER_LABELS.has(rawNameUpper)) return null;

  let numericValueStr = null;
  let unitStr = '';
  for (const vi of valueItems) {
    if (/^[\d.,]+$/.test(vi.str)) {
      numericValueStr = vi.str;
      const afterValue = row.filter(i => i.x > vi.x + 5 && i.x < LEGACY_COL.REF_MIN);
      if (afterValue.length > 0) unitStr = afterValue[0].str.trim();
      break;
    }
  }
  if (numericValueStr === null) return null;

  const numValue = parseBrNumber(numericValueStr);
  if (isNaN(numValue)) return null;

  const refText = refItems.map(i => i.str).join(' ').trim();
  const { min: ref_min, max: ref_max } = parseReference(refText);
  const cleanedName = cleanExamName(rawName);
  const abbr = getAbbr(rawName) || autoAbbr(rawName);

  return {
    name: cleanedName,
    abbr,
    value: numValue,
    unit: unitStr,
    ref_min,
    ref_max,
    rawRef: refText || null,
  };
}

function parseLegacyFormat(rows) {
  const entries = [];
  const seen = new Set();

  for (const row of rows) {
    if (row[0].y >= LEGACY_COL.HEADER_Y_MIN) continue;
    if (row[0].y < 100) continue;

    const exam = parseLegacyExamRow(row);
    if (!exam) continue;

    const key = exam.abbr + '|' + exam.value;
    if (seen.has(key)) continue;
    seen.add(key);

    entries.push(exam);
  }
  return entries;
}

// ===========================================================================
// FORMATO BLOCK (multi-exame com "Histórico de resultados")
// ===========================================================================

// Linhas que NUNCA são nome de exame
const BLOCK_NOISE_EXACT = new Set([
  'RESULTADO', 'VALORES DE REFERÊNCIA', 'VALORES DE REFERENCIA', 'MÉTODO', 'METODO',
  'HISTÓRICO DE RESULTADOS', 'HISTORICO DE RESULTADOS',
  'SECRETARIA DE ESTADO DA SAÚDE', 'UGA I - HOSPITAL HELIÓPOLIS',
  'SERVIÇO DE PATOLOGIA CLÍNICA:', 'CONVÊNIO: SUS',
  'ERITROGRAMA', 'LEUCOGRAMA',
  'NOME:', 'REGISTRO:', 'SEXO:', 'IDADE:', 'CONVÊNIO:',
  'DR. (A):', 'CLÍNICA:', 'CADASTRO:', 'EMISSÃO:', 'FOLHA:',
  'DATA NASC.:', 'DATA NASC:', 'Nº REQUISIÇÃO:',
  'COLETADO EM:', 'LIBERADO EM:',
  'RESPONSÁVEIS:',
]);

const BLOCK_NOISE_REGEX = [
  /^R\.\s+C[ôo]nego/i,                    // endereço
  /^\(\d{2}\)\s+\d{4}/,                   // telefone "(11) 2067-0498"
  /^DR[.\s]/i,                            // assinaturas DR JOSE ...
  /^DRA[.\s]/i,
  /^CRM:?/i,
  /^CRBM/i,
  /^CRBIO/i,
  /^CRF/i,
  /^Os resultados dos exames/i,           // disclaimer rodapé
  /^cl[íi]nicos e demais/i,
  /^\d{2}\/\d{2}\/\d{4}\s*-/,             // linha de histórico "06/05/2026 - 2,3 - mg/dL"
  /^Folha:/i,
  /^Respons[áa]veis:/i,                   // rodapé "Responsáveis: DR JOSE..."
  /^Eritrograma$/i,                       // subtítulos do hemograma
  /^Leucograma$/i,
];

const SPECIAL_BLOCK_TYPES = {
  HEMOGRAMA: /HEMOGRAMA\s+COMPLETO/i,
  TP_BLOCK:  /TEMPO\s+DE\s+PROTROMBINA/i,
  TTPA_BLOCK:/TEMPO\s+DE\s+TROMBOPLASTINA\s+PARCIAL\s+ATIVADA/i,
};

const BLOCK_HEADER_Y_MAX = 695;   // y > 695 é cabeçalho da página
const BLOCK_FOOTER_Y_MIN = 95;    // y < 95 é rodapé (responsáveis/disclaimer)

/**
 * True se a linha é "ruído" e nunca representa um nome de exame.
 */
function isBlockNoiseLine(text, row) {
  const u = text.toUpperCase().trim();
  if (!u) return true;
  if (BLOCK_NOISE_EXACT.has(u)) return true;
  // "Resultado Valores de Referência Método" combinado
  if (/^RESULTADO\s+VALORES\s+DE\s+REFER[ÊE]NCIA\s+M[ÉE]TODO/.test(u)) return true;
  // "Coletado em ... Liberado em ..."
  if (/^COLETADO\s+EM/.test(u)) return true;
  if (/^LIBERADO\s+EM/.test(u)) return true;
  // Apenas data
  if (/^\d{2}\/\d{2}\/\d{4}/.test(u)) return true;
  // Apenas hora
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(u)) return true;
  for (const re of BLOCK_NOISE_REGEX) {
    if (re.test(text)) return true;
  }
  // Linha começando à direita (>200) muito provavelmente não é nome.
  // row[0] não é necessariamente o item de menor X (groupByRows preserva
  // ordem do sort por Y), então pegamos o min(x) explicitamente.
  if (row && row.length > 0) {
    const minX = Math.min(...row.map(it => it.x));
    if (minX > 200) return true;
  }
  return false;
}

/**
 * Heurística para detectar se uma linha é o nome de um exame (anchor).
 * Combina: posição X esquerda, texto majoritariamente em maiúsculas,
 * próxima(s) linha(s) contém "Coletado em:".
 */
/**
 * Extrai apenas os items à esquerda da linha, formando o nome candidato.
 * Items na coluna direita (x >= 250) tipicamente são "Liberado em" / hora
 * que ficam na mesma linha Y do nome do exame e devem ser excluídos.
 */
function leftSideName(row, maxX = 250) {
  const left = row.filter(it => it.x < maxX);
  if (left.length === 0) return '';
  return [...left].sort((a, b) => a.x - b.x).map(it => it.str).join(' ').trim();
}

function isExamNameLine(candidateName, row, nextRows) {
  if (!candidateName || candidateName.length < 2) return false;
  if (isBlockNoiseLine(candidateName, row)) return false;

  // Linha NÃO pode ter items numéricos puros — sinal de que é uma sub-linha
  // de tabela (ex.: "INR: 1,48 Até 1,00") e não um nome de exame.
  // Excluímos items à direita (x >= 400) onde a hora "12:19:41" fica.
  const hasNumericItem = row.some(it => it.x < 400 && /^[\d.,]+$/.test(it.str));
  if (hasNumericItem) return false;

  // Letras devem ser majoritariamente UPPER (>=40%) — acomoda nomes mistos
  // como "DHL - Desidrogenase Láctica, SORO"
  const letters = candidateName.replace(/[^A-Za-zÁÀÃÂÉÊÍÓÔÕÚÇáàãâéêíóôõúç]/g, '');
  if (letters.length === 0) return false;
  const upperCount = letters.replace(/[^A-ZÁÀÃÂÉÊÍÓÔÕÚÇ]/g, '').length;
  const upperRatio = upperCount / letters.length;
  if (upperRatio < 0.4) return false;

  // Coluna esquerda: pelo menos um item em x <= 130
  const hasLeftAnchor = row.some(it => it.x <= 130);
  if (!hasLeftAnchor) return false;

  // Próximas 1-2 linhas devem conter "Coletado em" para confirmar bloco.
  // Janela curta evita falso positivo em assinaturas que ficam várias
  // linhas antes do próximo "Coletado em" do bloco seguinte.
  for (let k = 0; k < Math.min(2, nextRows.length); k++) {
    const nxt = nextRows[k].map(it => it.str).join(' ');
    if (/Coletado\s+em/i.test(nxt)) return true;
  }
  return false;
}

/**
 * Junta items de uma linha em uma única string com espaços.
 */
function rowToText(row) {
  return [...row].sort((a, b) => a.x - b.x).map(it => it.str).join(' ').trim();
}

/**
 * Identifica os blocos de exame: lista de { name, startIdx, endIdx, rows }.
 * Cada bloco vai do anchor (nome do exame) até o anchor seguinte (exclusivo)
 * ou fim das linhas válidas.
 */
function findExamBlocks(rows) {
  // Filtrar apenas linhas no corpo da página (excluir cabeçalhos/rodapés)
  const bodyRows = rows.filter(r => {
    const y = r[0].y;
    return y < BLOCK_HEADER_Y_MAX && y >= BLOCK_FOOTER_Y_MIN;
  });

  const anchors = [];
  for (let i = 0; i < bodyRows.length; i++) {
    const row = bodyRows[i];
    // Nome candidato usa só items à esquerda, descartando "Liberado em" /
    // hora que aparecem na mesma linha Y mas em x alto.
    const candidateName = leftSideName(row);
    const nextRows = bodyRows.slice(i + 1, i + 6);
    if (isExamNameLine(candidateName, row, nextRows)) {
      anchors.push({ idx: i, name: candidateName });
    }
  }

  const blocks = [];
  for (let i = 0; i < anchors.length; i++) {
    const start = anchors[i].idx;
    const end = i + 1 < anchors.length ? anchors[i + 1].idx : bodyRows.length;
    blocks.push({
      name: anchors[i].name,
      rows: bodyRows.slice(start + 1, end),
      // mantém referência ao corpo total caso o bloco precise olhar ao redor
    });
  }
  return blocks;
}

/**
 * Trunca as linhas de um bloco até "Histórico de resultados" (exclusivo).
 */
function truncateAtHistory(blockRows) {
  const out = [];
  for (const row of blockRows) {
    const t = rowToText(row);
    if (/Hist[óo]rico\s+de\s+resultados/i.test(t)) break;
    out.push(row);
  }
  return out;
}

/**
 * Tenta extrair (valor, unidade, referência) de um bloco simples.
 * Estratégia: encontrar a primeira linha (após "Liberado em:") cujo primeiro
 * item da esquerda é um número. Nessa linha:
 *   - VALOR  = primeiro item numérico da esquerda
 *   - UNIDADE = item logo à direita do valor (com x próximo)
 *   - REF    = items mais à direita (após gap de X)
 */
function parseSimpleBlock(blockName, blockRows) {
  const usable = truncateAtHistory(blockRows);

  for (const row of usable) {
    const sorted = [...row].sort((a, b) => a.x - b.x);
    const text = sorted.map(it => it.str).join(' ');

    // Pular linhas estruturais
    if (/^Coletado\s+em/i.test(text)) continue;
    if (/^Liberado\s+em/i.test(text)) continue;
    if (/^Resultado\b/i.test(text)) continue;
    if (/^\d{2}:\d{2}/.test(text)) continue;
    if (/^\d{2}\/\d{2}\/\d{4}\s*-/.test(text)) continue;

    // Achar primeiro item numérico
    const numIdx = sorted.findIndex(it => /^[\d.,]+$/.test(it.str));
    if (numIdx === -1) continue;
    const numItem = sorted[numIdx];
    const value = parseBrNumber(numItem.str);
    if (isNaN(value)) continue;

    // Unidade: item logo após (mesma "coluna do valor", x próximo)
    let unit = '';
    let unitEndX = numItem.x + 50;
    if (numIdx + 1 < sorted.length) {
      const next = sorted[numIdx + 1];
      if (next.x - numItem.x < 80 && looksLikeUnit(next.str)) {
        unit = next.str;
        unitEndX = next.x + 50;
      }
    }

    // Referência: tudo o que vier após o valor+unidade (até início do método/fim)
    // Capturamos itens à direita (gap > 10) e antes do método.
    const afterUnit = sorted.filter(it => it.x > unitEndX);
    // Heurística: o método é a última "frase" longa (geralmente uma palavra
    // a >480px). Excluímos tudo a partir de x ≥ 520 da referência.
    const refItems = afterUnit.filter(it => it.x < 520);
    const refText = refItems.map(it => it.str).join(' ').trim();

    // Multi-linha: se a próxima linha continua a referência (ex.
    // "Masculino: 0,7 a 1,2 mg/dL" ou "Risco cardíaco: baixo < 0,1"),
    // concatena. Só considera linhas que começam com prefixos conhecidos.
    let extendedRef = refText;
    const idxInUsable = usable.indexOf(row);
    const REF_CONTINUATION_RE = /^(Feminino|Masculino|Crian[çc]as?|Adultos?|Risco|moderado|baixo|alto|Idosos?)/i;
    for (let k = idxInUsable + 1; k < usable.length && k < idxInUsable + 3; k++) {
      const nextRow = usable[k];
      const nextSorted = [...nextRow].sort((a, b) => a.x - b.x);
      const nextText = nextSorted.map(it => it.str).join(' ').trim();
      if (!REF_CONTINUATION_RE.test(nextText)) break;
      extendedRef = (extendedRef + ' ' + nextText).trim();
    }

    const { min: ref_min, max: ref_max } = parseReference(extendedRef);
    const cleanedName = cleanExamName(blockName);
    const abbr = getAbbr(blockName) || autoAbbr(blockName);

    return {
      name: cleanedName,
      abbr,
      value,
      unit,
      ref_min,
      ref_max,
      rawRef: extendedRef || null,
    };
  }
  return null;
}

/**
 * Parser do bloco HEMOGRAMA COMPLETO. Extrai cada linha como um exame.
 * Linha pode ter 1 ou 2 valores numéricos (% e absoluto). Quando há 2,
 * preferimos o ABSOLUTO (mais relevante no leucograma).
 */
function parseHemogramaBlock(blockRows) {
  const usable = truncateAtHistory(blockRows);
  const entries = [];

  for (const row of usable) {
    const sorted = [...row].sort((a, b) => a.x - b.x);
    const text = sorted.map(it => it.str).join(' ').trim();
    const upper = text.toUpperCase();

    // Pular subtítulos/headers/datas
    if (!text) continue;
    if (BLOCK_NOISE_EXACT.has(upper)) continue;
    if (/^Coletado\s+em/i.test(text) || /^Liberado\s+em/i.test(text)) continue;
    if (/^Resultado\b/i.test(text)) continue;
    if (/^Eritrograma$/i.test(text) || /^Leucograma$/i.test(text)) continue;
    if (/^\d{2}:\d{2}/.test(text)) continue;

    // Linha de exame: primeiro item à esquerda é o nome (não-numérico)
    const firstNonNum = sorted.find(it => !/^[\d.,]+$/.test(it.str));
    if (!firstNonNum || firstNonNum.x > 200) continue;

    // Coletar nome — items à esquerda até o primeiro número
    const nameItems = [];
    let idx = 0;
    for (; idx < sorted.length; idx++) {
      const it = sorted[idx];
      if (/^[\d.,]+$/.test(it.str)) break;
      // Para se houver gap muito grande (>120) — provavelmente já é unidade/ref
      if (nameItems.length > 0 && it.x - nameItems[nameItems.length - 1].x > 120) break;
      nameItems.push(it);
    }
    if (nameItems.length === 0) continue;
    const rawName = nameItems.map(i => i.str).join(' ').trim();
    if (!rawName) continue;
    if (BLOCK_NOISE_EXACT.has(rawName.toUpperCase())) continue;

    // Pegar todos os números restantes
    const remaining = sorted.slice(idx);
    const numItems = remaining.filter(it => /^[\d.,]+$/.test(it.str));
    if (numItems.length === 0) continue;

    // Quando há 2 números, o segundo é o absoluto (preferido)
    let valueItem = numItems.length >= 2 ? numItems[1] : numItems[0];
    const value = parseBrNumber(valueItem.str);
    if (isNaN(value)) continue;

    // Unidade logo à direita do valueItem
    let unit = '';
    const valueIdx = remaining.indexOf(valueItem);
    if (valueIdx + 1 < remaining.length) {
      const next = remaining[valueIdx + 1];
      if (next.x - valueItem.x < 80 && looksLikeUnit(next.str)) {
        unit = next.str;
      }
    }

    // Referência: items após a unidade
    const afterValue = remaining.slice(valueIdx + (unit ? 2 : 1));
    const refItems = afterValue.filter(it => it.x < 520);
    const refText = refItems.map(it => it.str).join(' ').trim();
    const { min: ref_min, max: ref_max } = parseReference(refText);

    const cleanedName = cleanExamName(rawName);
    const abbr = getAbbr(rawName) || autoAbbr(rawName);

    entries.push({
      name: cleanedName,
      abbr,
      value,
      unit,
      ref_min,
      ref_max,
      rawRef: refText || null,
    });
  }
  return entries;
}

/**
 * Parser dos blocos TEMPO DE PROTROMBINA / TEMPO DE TROMBOPLASTINA PARCIAL.
 * Cada linha tem padrão: NOME  VALOR  UNIDADE  [REFERÊNCIA] [MÉTODO]
 * Ex: "TP 19,0 Segs Automatizado" / "Atividade 59,0 % > 70 %"
 */
function parseCoagulationBlock(blockRows) {
  const usable = truncateAtHistory(blockRows);
  const entries = [];

  for (const row of usable) {
    const sorted = [...row].sort((a, b) => a.x - b.x);
    const text = sorted.map(it => it.str).join(' ').trim();
    const upper = text.toUpperCase();

    if (!text) continue;
    if (BLOCK_NOISE_EXACT.has(upper)) continue;
    if (/^Coletado\s+em/i.test(text) || /^Liberado\s+em/i.test(text)) continue;
    if (/^Resultado\b/i.test(text)) continue;
    if (/^\d{2}:\d{2}/.test(text)) continue;

    // Nome: items à esquerda até o primeiro número
    const nameItems = [];
    let idx = 0;
    for (; idx < sorted.length; idx++) {
      const it = sorted[idx];
      if (/^[\d.,]+$/.test(it.str)) break;
      nameItems.push(it);
    }
    if (nameItems.length === 0) continue;
    const rawName = nameItems.map(i => i.str).join(' ').replace(/:\s*$/, '').trim();
    if (!rawName) continue;

    const numItems = sorted.slice(idx).filter(it => /^[\d.,]+$/.test(it.str));
    if (numItems.length === 0) continue;
    const valueItem = numItems[0];
    const value = parseBrNumber(valueItem.str);
    if (isNaN(value)) continue;

    // Unidade
    let unit = '';
    const valueIdx = sorted.indexOf(valueItem);
    if (valueIdx + 1 < sorted.length) {
      const next = sorted[valueIdx + 1];
      if (next.x - valueItem.x < 80 && looksLikeUnit(next.str)) {
        unit = next.str;
      }
    }

    // Referência: tudo após o valor+unidade até método
    const afterValue = sorted.slice(valueIdx + (unit ? 2 : 1));
    const refItems = afterValue.filter(it => it.x < 520);
    const refText = refItems.map(it => it.str).join(' ').trim();
    const { min: ref_min, max: ref_max } = parseReference(refText);

    const cleanedName = cleanExamName(rawName);
    const abbr = getAbbr(rawName) || autoAbbr(rawName);

    entries.push({
      name: cleanedName,
      abbr,
      value,
      unit,
      ref_min,
      ref_max,
      rawRef: refText || null,
    });
  }
  return entries;
}

function parseBlockFormat(rows) {
  const blocks = findExamBlocks(rows);
  const entries = [];
  const seen = new Set();

  for (const block of blocks) {
    let blockEntries = [];

    if (SPECIAL_BLOCK_TYPES.HEMOGRAMA.test(block.name)) {
      blockEntries = parseHemogramaBlock(block.rows);
    } else if (SPECIAL_BLOCK_TYPES.TP_BLOCK.test(block.name) ||
               SPECIAL_BLOCK_TYPES.TTPA_BLOCK.test(block.name)) {
      blockEntries = parseCoagulationBlock(block.rows);
    } else {
      const single = parseSimpleBlock(block.name, block.rows);
      if (single) blockEntries = [single];
    }

    for (const e of blockEntries) {
      const key = e.abbr.toUpperCase() + '|' + e.value;
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push(e);
    }
  }
  return entries;
}

// ===========================================================================
// Função principal exportada
// ===========================================================================

/**
 * Parseia um laudo PDF da SES-SP a partir de um ArrayBuffer.
 *
 * @param {ArrayBuffer} arrayBuffer - Conteúdo do arquivo PDF
 * @returns {Promise<{
 *   date: string|null,
 *   patientName: string|null,
 *   reqNumber: string|null,
 *   format: 'block'|'legacy',
 *   entries: Array<{name, abbr, value, unit, ref_min, ref_max, rawRef}>
 * }>}
 */
export async function parseSesSpPdf(arrayBuffer) {
  const data = new Uint8Array(arrayBuffer);

  let pdf;
  try {
    const loadingTask = pdfjsLib.getDocument({ data });
    pdf = await loadingTask.promise;
  } catch (err) {
    throw new Error('Não foi possível ler o PDF: ' + err.message);
  }

  const items = await extractItems(pdf);
  if (items.length === 0) {
    throw new Error('O PDF não contém texto extraível. Pode ser um PDF escaneado (imagem).');
  }

  const rows = groupByRows(items);
  const date = detectCollectionDate(rows);
  const patientName = detectPatientName(rows);
  const reqNumber = detectReqNumber(rows);

  const format = detectFormat(items);
  const entries = format === 'block'
    ? parseBlockFormat(rows)
    : parseLegacyFormat(rows);

  return { date, patientName, reqNumber, format, entries };
}
