// js/relatorios.js
// ---------------------------------------------------
// Página de Relatórios (ADM)
// - Carrega chamados do Firestore
// - Aplica filtros por período, status e texto
// - Exibe tabela com resultados
// - Exibe resumo (totais por status)
// - Gera CSV para download usando Blob + URL.createObjectURL
// - Gera logs de geração de relatórios e erros
// ---------------------------------------------------

import {
  db,
  collection,
  getDocs,
  query,
  orderBy
} from "./firebase-config.js";
import {
  formatarDataHora,
  criarLog,
  aplicarClasseStatus
} from "./common.js";

// ELEMENTOS DA PÁGINA
const relDataInicioInput = document.getElementById("relDataInicio");
const relDataFimInput = document.getElementById("relDataFim");
const relStatusSelect = document.getElementById("relStatus");
const relTextoInput = document.getElementById("relTexto");
const aplicarFiltrosBtn = document.getElementById("aplicarFiltrosBtn");
const resumoRelatoriosSection = document.getElementById("resumoRelatorios");
const relTabelaBody = document.getElementById("relTabelaBody");
const gerarCsvBtn = document.getElementById("gerarCsvBtn");

// Modal de alerta simples
const relAlertModal = document.getElementById("relAlertModal");
const relAlertTitle = document.getElementById("relAlertTitle");
const relAlertMessage = document.getElementById("relAlertMessage");
const relAlertCloseBtn = document.getElementById("relAlertCloseBtn");

// Estado em memória
let todosChamados = [];   // todos os chamados trazidos do Firestore
let chamadosFiltrados = []; // resultado dos filtros atuais

// -----------------------
// CARREGAMENTO INICIAL
// -----------------------

/**
 * Carrega todos os chamados da coleção "chamados".
 * Para simplificar, buscamos uma vez e aplicamos
 * os filtros no front-end.
 */
async function carregarChamados() {
  const chamadosRef = collection(db, "chamados");
  const q = query(chamadosRef, orderBy("createdAt", "desc"));

  console.log("Carregando chamados para relatórios...");

  try {
    const snapshot = await getDocs(q);
    todosChamados = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data()
    }));

    console.log(`Total de chamados carregados: ${todosChamados.length}`);

    // Primeiro filtro inicial (sem parâmetros) apenas para preencher tabela
    aplicarFiltros();
  } catch (err) {
    console.error("Erro ao carregar chamados para relatórios:", err);

    await criarLog({
      type: "ERROR_LOAD_RELATORIOS",
      chamadoId: null,
      actorType: "ADM",
      details: `Erro ao carregar chamados para relatórios: ${err.message}`
    });

    mostrarRelAlert(
      "Erro ao carregar relatórios",
      "Não foi possível carregar os dados de chamados. Tente novamente mais tarde."
    );
  }
}

// Dispara carregamento inicial
carregarChamados();

// -----------------------
// APLICAÇÃO DE FILTROS
// -----------------------

aplicarFiltrosBtn?.addEventListener("click", () => {
  aplicarFiltros();
});

/**
 * Aplica filtros de período, status e texto sobre o array `todosChamados`
 * e atualiza tabela + resumo.
 */
async function aplicarFiltros() {
  if (!todosChamados || todosChamados.length === 0) {
    relTabelaBody.innerHTML =
      "<tr><td colspan='5'>Nenhum chamado encontrado para gerar relatórios.</td></tr>";
    resumoRelatoriosSection.innerHTML = "";
    return;
  }

  const dataInicioStr = relDataInicioInput.value; // yyyy-MM-dd
  const dataFimStr = relDataFimInput.value;
  const statusFiltro = relStatusSelect.value;
  const textoFiltro = relTextoInput.value.trim().toLowerCase();

  // Período: convertemos para Date, sendo:
  // - dataInicio: 00:00:00 do dia
  // - dataFim: 23:59:59 do dia
  const dataInicio = dataInicioStr
    ? new Date(`${dataInicioStr}T00:00:00`)
    : null;
  const dataFim = dataFimStr
    ? new Date(`${dataFimStr}T23:59:59`)
    : null;

  let filtrados = [...todosChamados];

  filtrados = filtrados.filter((c) => {
    const createdAtDate = c.createdAt?.toDate
      ? c.createdAt.toDate()
      : c.createdAt || null;

    // Filtro de período
    if (dataInicio && createdAtDate && createdAtDate < dataInicio) {
      return false;
    }
    if (dataFim && createdAtDate && createdAtDate > dataFim) {
      return false;
    }

    // Filtro de status
    if (statusFiltro !== "TODOS" && c.status !== statusFiltro) {
      return false;
    }

    // Filtro de texto (nome ou assunto)
    if (textoFiltro) {
      const nome = (c.nome || "").toLowerCase();
      const assunto = (c.assunto || "").toLowerCase();
      if (!nome.includes(textoFiltro) && !assunto.includes(textoFiltro)) {
        return false;
      }
    }

    return true;
  });

  chamadosFiltrados = filtrados;

  console.log("Filtros aplicados nos relatórios:", {
    dataInicio: dataInicioStr || null,
    dataFim: dataFimStr || null,
    status: statusFiltro,
    texto: textoFiltro,
    totalResultado: chamadosFiltrados.length
  });

  // Loga geração de relatório e filtros usados
  await criarLog({
    type: "GERAR_RELATORIO",
    chamadoId: null,
    actorType: "ADM",
    details: `Relatório gerado com filtros - Inicio: ${dataInicioStr || "-"}, Fim: ${
      dataFimStr || "-"
    }, Status: ${statusFiltro}, Texto: "${textoFiltro}", Total: ${
      chamadosFiltrados.length
    }`
  });

  renderizarResumo();
  renderizarTabela();
}

// -----------------------
// RENDERIZAÇÃO DE RESUMO
// -----------------------

function renderizarResumo() {
  resumoRelatoriosSection.innerHTML = "";

  if (!chamadosFiltrados || chamadosFiltrados.length === 0) {
    resumoRelatoriosSection.innerHTML =
      "<p class='small muted'>Nenhum chamado encontrado com os filtros atuais.</p>";
    return;
  }

  const total = chamadosFiltrados.length;

  const contagemPorStatus = {
    "Em Espera": 0,
    "Em atendimento": 0,
    "Resolvido": 0,
    "Cancelado": 0
  };

  chamadosFiltrados.forEach((c) => {
    if (contagemPorStatus[c.status] !== undefined) {
      contagemPorStatus[c.status]++;
    }
  });

  // Card de total
  const totalCard = document.createElement("div");
  totalCard.className = "summary-card summary-card-total";
  totalCard.innerHTML = `
    <span class="summary-label">Total de chamados</span>
    <span class="summary-value">${total}</span>
  `;
  resumoRelatoriosSection.appendChild(totalCard);

  // Cards por status
  Object.entries(contagemPorStatus).forEach(([status, qtd]) => {
    const card = document.createElement("div");
    card.className = "summary-card";
    card.innerHTML = `
      <span class="summary-label">${status}</span>
      <span class="summary-value">${qtd}</span>
    `;
    resumoRelatoriosSection.appendChild(card);
  });
}

// -----------------------
// RENDERIZAÇÃO DA TABELA
// -----------------------

function renderizarTabela() {
  relTabelaBody.innerHTML = "";

  if (!chamadosFiltrados || chamadosFiltrados.length === 0) {
    relTabelaBody.innerHTML =
      "<tr><td colspan='5'>Nenhum chamado encontrado com os filtros atuais.</td></tr>";
    return;
  }

  chamadosFiltrados.forEach((c) => {
    const tr = document.createElement("tr");

    const tdProtocolo = document.createElement("td");
    tdProtocolo.textContent = c.protocolo || "-";

    const tdData = document.createElement("td");
    tdData.textContent = formatarDataHora(c.createdAt);

    const tdStatus = document.createElement("td");
    const spanStatus = document.createElement("span");
    aplicarClasseStatus(spanStatus, c.status);
    spanStatus.textContent = c.status || "-";
    tdStatus.appendChild(spanStatus);

    const tdNome = document.createElement("td");
    tdNome.textContent = c.nome || "-";

    const tdAssunto = document.createElement("td");
    tdAssunto.textContent = c.assunto || "-";

    tr.appendChild(tdProtocolo);
    tr.appendChild(tdData);
    tr.appendChild(tdStatus);
    tr.appendChild(tdNome);
    tr.appendChild(tdAssunto);

    relTabelaBody.appendChild(tr);
  });
}

// -----------------------
// GERAÇÃO DO CSV
// -----------------------

gerarCsvBtn?.addEventListener("click", async () => {
  if (!chamadosFiltrados || chamadosFiltrados.length === 0) {
    mostrarRelAlert(
      "Nenhum dado para exportar",
      "Aplique filtros que retornem pelo menos um chamado antes de gerar o CSV."
    );
    return;
  }

  try {
    const csv = gerarCsv(chamadosFiltrados);
    downloadCsv(csv);

    console.log("Planilha CSV de relatórios gerada com sucesso.");

    await criarLog({
      type: "GERAR_CSV_RELATORIO",
      chamadoId: null,
      actorType: "ADM",
      details: `CSV de relatórios gerado com ${chamadosFiltrados.length} linhas.`
    });
  } catch (err) {
    console.error("Erro ao gerar CSV de relatórios:", err);

    await criarLog({
      type: "ERROR_GERAR_CSV_RELATORIO",
      chamadoId: null,
      actorType: "ADM",
      details: `Erro ao gerar CSV de relatórios: ${err.message}`
    });

    mostrarRelAlert(
      "Erro ao gerar CSV",
      "Não foi possível gerar o arquivo de relatório. Tente novamente."
    );
  }
});

/**
 * Gera uma string CSV a partir da lista de chamados filtrados.
 * Usamos separador ';' (comum em planilhas PT-BR).
 * Campos principais:
 *  - Protocolo, Data Abertura, Status, Nome, Telefone, Assunto, Descrição
 */
function gerarCsv(lista) {
  const header = [
    "Protocolo",
    "DataAbertura",
    "Status",
    "Nome",
    "Telefone",
    "Assunto",
    "Descricao"
  ];

  const linhas = [];

  // Cabeçalho
  linhas.push(header.join(";"));

  // Função para escapar valores com aspas duplas no CSV
  const csvEscape = (valor) => {
    const v = (valor ?? "").toString().replace(/"/g, '""');
    return `"${v}"`;
  };

  // Linhas de dados
  lista.forEach((c) => {
    const linha = [
      csvEscape(c.protocolo || ""),
      csvEscape(formatarDataHora(c.createdAt)),
      csvEscape(c.status || ""),
      csvEscape(c.nome || ""),
      csvEscape(c.telefone || ""),
      csvEscape(c.assunto || ""),
      csvEscape(c.descricao || "")
    ].join(";");
    linhas.push(linha);
  });

  // Junta tudo em uma única string
  return linhas.join("\r\n");
}

/**
 * Faz o download do CSV gerado usando Blob + URL.createObjectURL.
 * Essa abordagem:
 *  - Cria um Blob em memória com o conteúdo do CSV
 *  - Gera uma URL temporária com URL.createObjectURL(blob)
 *  - Cria um <a download="..."> apontando para essa URL
 *  - Dispara o click programaticamente
 *  - Remove o link e revoga a URL após o download
 */
function downloadCsv(csvString) {
  const blob = new Blob([csvString], {
    type: "text/csv;charset=utf-8;"
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  link.href = url;
  link.download = `relatorio_chamados_${timestamp}.csv`;

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

// -----------------------
// HELPERS DE MODAL/ALERTA
// -----------------------

function mostrarRelAlert(titulo, mensagem) {
  relAlertTitle.textContent = titulo;
  relAlertMessage.textContent = mensagem;
  abrirModal(relAlertModal);
}

relAlertCloseBtn?.addEventListener("click", () =>
  fecharModal(relAlertModal)
);

relAlertModal?.addEventListener("click", (e) => {
  if (e.target === relAlertModal) fecharModal(relAlertModal);
});

function abrirModal(modal) {
  if (!modal) return;
  modal.classList.remove("hidden");
}

function fecharModal(modal) {
  if (!modal) return;
  modal.classList.add("hidden");
}
