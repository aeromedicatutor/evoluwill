// js/admin.js
// ---------------------------------------------------
// Lida com:
//  - Listagem em tempo real dos chamados (cards)
//  - Filtros (status + texto)
//  - Modal de detalhes com edição e update de status
//  - Exclusão de chamado com confirmação
//  - Leitura de logs (tabela + filtros por data/hora)
// ---------------------------------------------------

import {
  db,
  collection,
  onSnapshot,
  query,
  orderBy,
  doc,
  updateDoc,
  deleteDoc,
  getDocs,
  where
} from "./firebase-config.js";
import {
  criarLog,
  calcularTempoAbertura,
  formatarDataHora,
  aplicarClasseStatus
} from "./common.js";

// ELEMENTOS PRINCIPAIS
const containerChamados = document.getElementById("chamadosContainer");
const totalChamadosBadge = document.getElementById("totalChamadosBadge");
const statusFiltroSelect = document.getElementById("statusFiltro");
const buscaTextoInput = document.getElementById("buscaTexto");

// Modal detalhes
const detalheModal = document.getElementById("detalheChamadoModal");
const detalheFecharBtn = document.getElementById("detalheFecharBtn");
const modalProtocoloSpan = document.getElementById("modalProtocolo");
const modalDataAberturaSpan = document.getElementById("modalDataAbertura");
const modalTempoAberturaSpan = document.getElementById("modalTempoAbertura");
const modalStatusSelect = document.getElementById("modalStatus");
const modalNomeInput = document.getElementById("modalNome");
const modalTelefoneInput = document.getElementById("modalTelefone");
const modalAssuntoInput = document.getElementById("modalAssunto");
const modalDescricaoTextarea = document.getElementById("modalDescricao");
const modalAnexoContainer = document.getElementById("modalAnexoContainer");
const modalSalvarBtn = document.getElementById("modalSalvarBtn");
const modalExcluirBtn = document.getElementById("modalExcluirBtn");

// Modal confirmação de exclusão
const confirmDeleteModal = document.getElementById("confirmDeleteModal");
const confirmDeleteCancelBtn = document.getElementById("confirmDeleteCancelBtn");
const confirmDeleteOkBtn = document.getElementById("confirmDeleteOkBtn");

// Modal admin alert
const adminAlertModal = document.getElementById("adminAlertModal");
const adminAlertTitle = document.getElementById("adminAlertTitle");
const adminAlertMessage = document.getElementById("adminAlertMessage");
const adminAlertCloseBtn = document.getElementById("adminAlertCloseBtn");

// Logs
const logsTableBody = document.getElementById("logsTableBody");
const logDataInicioInput = document.getElementById("logDataInicio");
const logDataFimInput = document.getElementById("logDataFim");
const filtrarLogsBtn = document.getElementById("filtrarLogsBtn");

// Estado em memória
let listaChamados = [];
let chamadoSelecionado = null;

// -----------------------
// LISTAGEM EM TEMPO REAL
// -----------------------
const chamadosRef = collection(db, "chamados");
const qChamados = query(chamadosRef, orderBy("createdAt", "desc"));

onSnapshot(
  qChamados,
  (snapshot) => {
    listaChamados = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data()
    }));

    console.log("Snapshot de chamados recebido. Total:", listaChamados.length);
    renderizarChamados();
  },
  (error) => {
    console.error("Erro ao ouvir chamados:", error);
    mostrarAdminAlert("Erro", "Falha ao carregar chamados em tempo real.");
  }
);

// Renderiza cards considerando filtros
function renderizarChamados() {
  const statusFiltro = statusFiltroSelect.value;
  const texto = buscaTextoInput.value.trim().toLowerCase();

  containerChamados.innerHTML = "";

  const filtrados = listaChamados.filter((c) => {
    const statusOk = statusFiltro === "TODOS" || c.status === statusFiltro;
    const textoOk =
      !texto ||
      (c.nome && c.nome.toLowerCase().includes(texto)) ||
      (c.assunto && c.assunto.toLowerCase().includes(texto));

    return statusOk && textoOk;
  });

  totalChamadosBadge.textContent = `${filtrados.length} chamado${filtrados.length === 1 ? "" : "s"}`;

  if (filtrados.length === 0) {
    containerChamados.innerHTML =
      '<p class="small muted">Nenhum chamado encontrado com os filtros atuais.</p>';
    return;
  }

  filtrados.forEach((c) => {
    const card = document.createElement("article");
    card.className = "ticket-card";

    const header = document.createElement("div");
    header.className = "ticket-header";

    const protocoloSpan = document.createElement("span");
    protocoloSpan.className = "ticket-protocol";
    protocoloSpan.textContent = c.protocolo || "(sem protocolo)";

    const statusSpan = document.createElement("span");
    aplicarClasseStatus(statusSpan, c.status);
    statusSpan.textContent = c.status || "-";

    header.appendChild(protocoloSpan);
    header.appendChild(statusSpan);

    const titulo = document.createElement("div");
    titulo.className = "ticket-title";
    titulo.textContent = c.assunto || "(sem assunto)";

    const subtitle = document.createElement("div");
    subtitle.className = "ticket-subtitle";
    subtitle.textContent = c.nome || "(sem nome)";

    const footer = document.createElement("div");
    footer.className = "ticket-footer";

    const tempoSpan = document.createElement("span");
    tempoSpan.className = "ticket-time";
    tempoSpan.textContent = calcularTempoAbertura(c.createdAt);

    footer.appendChild(tempoSpan);

    card.appendChild(header);
    card.appendChild(titulo);
    card.appendChild(subtitle);
    card.appendChild(footer);

    card.addEventListener("click", () => abrirModalDetalhe(c));

    containerChamados.appendChild(card);
  });
}

// Filtros
statusFiltroSelect?.addEventListener("change", renderizarChamados);
buscaTextoInput?.addEventListener("input", () => {
  renderizarChamados();
});

// -----------------------
// MODAL DETALHE (CRUD)
// -----------------------
function abrirModalDetalhe(chamado) {
  chamadoSelecionado = chamado;

  modalProtocoloSpan.textContent = chamado.protocolo || "";
  modalDataAberturaSpan.textContent = formatarDataHora(chamado.createdAt);
  modalTempoAberturaSpan.textContent = calcularTempoAbertura(chamado.createdAt);
  modalStatusSelect.value = chamado.status || "Em Espera";
  modalNomeInput.value = chamado.nome || "";
  modalTelefoneInput.value = chamado.telefone || "";
  modalAssuntoInput.value = chamado.assunto || "";
  modalDescricaoTextarea.value = chamado.descricao || "";

  if (chamado.attachmentName) {
    modalAnexoContainer.innerHTML =
      `<strong>${chamado.attachmentName}</strong><br>` +
      `<span class="small muted">${chamado.attachmentType || ""} - ${(chamado.attachmentSize || 0) / 1024 | 0} KB</span><br>` +
      (chamado.attachmentData
        ? `<a href="${chamado.attachmentData}" target="_blank">Abrir anexo</a>`
        : "");
  } else {
    modalAnexoContainer.textContent = "Nenhum anexo.";
  }

  abrirModal(detalheModal);
}

detalheFecharBtn?.addEventListener("click", () => fecharModal(detalheModal));
detalheModal?.addEventListener("click", (e) => {
  if (e.target === detalheModal) fecharModal(detalheModal);
});

// Salvar alterações (UPDATE)
modalSalvarBtn?.addEventListener("click", async () => {
  if (!chamadoSelecionado) return;

  const novoStatus = modalStatusSelect.value;
  const novoNome = modalNomeInput.value.trim();
  const novoTelefone = modalTelefoneInput.value.trim();
  const novoAssunto = modalAssuntoInput.value.trim();
  const novaDescricao = modalDescricaoTextarea.value.trim();

  try {
    const docRef = doc(db, "chamados", chamadoSelecionado.id);
    await updateDoc(docRef, {
      status: novoStatus,
      nome: novoNome,
      telefone: novoTelefone,
      assunto: novoAssunto,
      descricao: novaDescricao,
      updatedAt: new Date()
    });

    console.log("Chamado atualizado:", chamadoSelecionado.protocolo);

    await criarLog({
      type: "UPDATE_CHAMADO",
      chamadoId: chamadoSelecionado.protocolo,
      actorType: "ADM",
      details: `Chamado atualizado pelo ADM. Novo status: "${novoStatus}".`
    });

    fecharModal(detalheModal);
  } catch (err) {
    console.error("Erro ao atualizar chamado:", err);
    await criarLog({
      type: "ERROR_UPDATE_CHAMADO",
      chamadoId: chamadoSelecionado.protocolo,
      actorType: "ADM",
      details: `Erro ao atualizar chamado: ${err.message}`
    });
    mostrarAdminAlert("Erro", "Não foi possível salvar as alterações.");
  }
});

// Exclusão com confirmação (DELETE)
let aguardandoConfirmacaoDelete = false;

modalExcluirBtn?.addEventListener("click", () => {
  if (!chamadoSelecionado) return;
  aguardandoConfirmacaoDelete = true;
  abrirModal(confirmDeleteModal);
});

confirmDeleteCancelBtn?.addEventListener("click", () => {
  aguardandoConfirmacaoDelete = false;
  fecharModal(confirmDeleteModal);
});

confirmDeleteOkBtn?.addEventListener("click", async () => {
  if (!aguardandoConfirmacaoDelete || !chamadoSelecionado) return;

  try {
    const docRef = doc(db, "chamados", chamadoSelecionado.id);
    await deleteDoc(docRef);

    console.log("Chamado excluído:", chamadoSelecionado.protocolo);

    await criarLog({
      type: "DELETE_CHAMADO",
      chamadoId: chamadoSelecionado.protocolo,
      actorType: "ADM",
      details: "Chamado excluído definitivamente pelo administrador."
    });

    fecharModal(confirmDeleteModal);
    fecharModal(detalheModal);
  } catch (err) {
    console.error("Erro ao excluir chamado:", err);
    await criarLog({
      type: "ERROR_DELETE_CHAMADO",
      chamadoId: chamadoSelecionado.protocolo,
      actorType: "ADM",
      details: `Erro ao excluir chamado: ${err.message}`
    });
    mostrarAdminAlert("Erro", "Não foi possível excluir o chamado.");
  } finally {
    aguardandoConfirmacaoDelete = false;
  }
});

// -----------------------
// LOGS: leitura e filtros
// -----------------------
async function carregarLogs() {
  logsTableBody.innerHTML = "<tr><td colspan='5'>Carregando...</td></tr>";

  const logsRef = collection(db, "logs");
  // Vamos aplicar filtros por data/hora apenas por Firestore.
  // Se o usuário não preencher, buscamos tudo e filtramos no cliente.
  let q = query(logsRef, orderBy("createdAt", "desc"));

  try {
    const snapshot = await getDocs(q);

    let logs = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data()
    }));

    const inicio = logDataInicioInput.value ? new Date(logDataInicioInput.value) : null;
    const fim = logDataFimInput.value ? new Date(logDataFimInput.value) : null;

    if (inicio) {
      logs = logs.filter((l) => l.createdAt?.toDate() >= inicio);
    }
    if (fim) {
      logs = logs.filter((l) => l.createdAt?.toDate() <= fim);
    }

    logsTableBody.innerHTML = "";

    if (logs.length === 0) {
      logsTableBody.innerHTML = "<tr><td colspan='5'>Nenhum log encontrado.</td></tr>";
      return;
    }

    logs.forEach((log) => {
      const tr = document.createElement("tr");

      const tdData = document.createElement("td");
      tdData.textContent = formatarDataHora(log.createdAt);
      const tdTipo = document.createElement("td");
      tdTipo.textContent = log.type || "";
      const tdChamado = document.createElement("td");
      tdChamado.textContent = log.chamadoId || "-";
      const tdAtor = document.createElement("td");
      tdAtor.textContent = log.actorType || "-";
      const tdDetalhes = document.createElement("td");
      tdDetalhes.textContent = log.details || "";

      tr.appendChild(tdData);
      tr.appendChild(tdTipo);
      tr.appendChild(tdChamado);
      tr.appendChild(tdAtor);
      tr.appendChild(tdDetalhes);

      logsTableBody.appendChild(tr);
    });
  } catch (err) {
    console.error("Erro ao carregar logs:", err);
    mostrarAdminAlert("Erro", "Não foi possível carregar os logs.");
  }
}

// Carrega logs inicialmente
carregarLogs();

// Botão de filtro
filtrarLogsBtn?.addEventListener("click", () => {
  console.log("Filtrando logs por período:", logDataInicioInput.value, logDataFimInput.value);
  carregarLogs();
});

// -----------------------
// Helpers de modais
// -----------------------
function abrirModal(modal) {
  if (!modal) return;
  modal.classList.remove("hidden");
}

function fecharModal(modal) {
  if (!modal) return;
  modal.classList.add("hidden");
}

// Modal de alerta simples
function mostrarAdminAlert(titulo, mensagem) {
  adminAlertTitle.textContent = titulo;
  adminAlertMessage.textContent = mensagem;
  abrirModal(adminAlertModal);
}

adminAlertCloseBtn?.addEventListener("click", () => fecharModal(adminAlertModal));
adminAlertModal?.addEventListener("click", (e) => {
  if (e.target === adminAlertModal) fecharModal(adminAlertModal);
});
