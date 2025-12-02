// js/admin.js
// ---------------------------------------------------
// Painel do Administrador
// - Listagem em tempo real dos chamados (cards)
// - Filtros (status + texto + nome)
// - Modal de detalhes com edição e update de status
// - Exclusão de chamado com confirmação
// - Logs (tabela + filtros de data/hora)
// - Chat de comentários dentro do modal (ADM <-> Usuário)
// - Comentário automático em mudança de status
// - NOVO: suporte a categoria, urgência e loading global
// ---------------------------------------------------

import {
  db,
  collection,
  onSnapshot,
  query,
  orderBy,
  where,
  doc,
  updateDoc,
  deleteDoc,
  getDocs
} from "./firebase-config.js";
import {
  criarLog,
  criarComentario,
  calcularTempoAbertura,
  formatarDataHora,
  aplicarClasseStatus
} from "./common.js";

// ELEMENTOS PRINCIPAIS
const containerChamados = document.getElementById("chamadosContainer");
const totalChamadosBadge = document.getElementById("totalChamadosBadge");
const contagemNomeBadge = document.getElementById("contagemNomeBadge");
const statusFiltroSelect = document.getElementById("statusFiltro");
const buscaTextoInput = document.getElementById("buscaTexto");
const filtroNomeInput = document.getElementById("filtroNome");

// LOADING GLOBAL (overlay que bloqueia a tela durante operações async)
const globalLoading = document.getElementById("globalLoading");

function mostrarLoading() {
  if (globalLoading) {
    globalLoading.classList.remove("hidden");
  }
}

function ocultarLoading() {
  if (globalLoading) {
    globalLoading.classList.add("hidden");
  }
}

// Modal detalhes
const detalheModal = document.getElementById("detalheChamadoModal");
const detalheFecharBtn = document.getElementById("detalheFecharBtn");
const modalProtocoloSpan = document.getElementById("modalProtocolo");
const modalDataAberturaSpan = document.getElementById("modalDataAbertura");
const modalTempoAberturaSpan = document.getElementById("modalTempoAbertura");
const modalStatusSelect = document.getElementById("modalStatus");
const modalNomeInput = document.getElementById("modalNome");
// TELEFONE REMOVIDO DO SISTEMA → não há mais modalTelefoneInput
const modalCategoriaSelect = document.getElementById("modalCategoria");
const modalUrgenciaSelect = document.getElementById("modalUrgencia");
const modalAssuntoInput = document.getElementById("modalAssunto");
const modalDescricaoTextarea = document.getElementById("modalDescricao");
const modalAnexoContainer = document.getElementById("modalAnexoContainer");
const modalSalvarBtn = document.getElementById("modalSalvarBtn");
const modalExcluirBtn = document.getElementById("modalExcluirBtn");

// Chat / comentários no modal ADM
const adminCommentsList = document.getElementById("adminCommentsList");
const adminNewCommentTextarea = document.getElementById("adminNewComment");
const adminSendCommentBtn = document.getElementById("adminSendCommentBtn");

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
let aguardandoConfirmacaoDelete = false;

// Listener de comentários no modal
let unsubscribeComentariosAdm = null;

// -----------------------
// LISTAGEM EM TEMPO REAL
// -----------------------
const chamadosRef = collection(db, "chamados");
const qChamados = query(chamadosRef, orderBy("createdAt", "desc"));

onSnapshot(
  qChamados,
  (snapshot) => {
    listaChamados = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data()
    }));

    console.log("Snapshot de chamados recebido. Total:", listaChamados.length);
    renderizarChamados();
  },
  (error) => {
    console.error("Erro ao ouvir chamados:", error);
    mostrarAdminAlert("Erro", "Falha ao carregar chamados em tempo real.");
  }
);

// -----------------------
// RENDERIZAÇÃO DOS CARDS
// -----------------------
function renderizarChamados() {
  const statusFiltro = statusFiltroSelect?.value || "TODOS";
  const texto = buscaTextoInput?.value.trim().toLowerCase() || "";
  const nomeFiltro = filtroNomeInput?.value.trim().toLowerCase() || "";

  containerChamados.innerHTML = "";

  // Contagem por nome (independente de status)
  if (nomeFiltro) {
    const qtdPorNome = listaChamados.filter((c) =>
      (c.nome || "").toLowerCase().includes(nomeFiltro)
    ).length;

    if (contagemNomeBadge) {
      contagemNomeBadge.style.display = "inline-flex";
      contagemNomeBadge.textContent =
        `${qtdPorNome} chamado${qtdPorNome === 1 ? "" : "s"} para "${filtroNomeInput.value}"`;
    }
  } else if (contagemNomeBadge) {
    contagemNomeBadge.style.display = "none";
    contagemNomeBadge.textContent = "";
  }

  const filtrados = listaChamados.filter((c) => {
    // Não mostrar arquivados na lista principal (se usar esse campo)
    if (c.arquivado) return false;

    const statusOk = statusFiltro === "TODOS" || c.status === statusFiltro;
    const textoOk =
      !texto ||
      (c.nome && c.nome.toLowerCase().includes(texto)) ||
      (c.assunto && c.assunto.toLowerCase().includes(texto));
    const nomeOk =
      !nomeFiltro ||
      (c.nome && c.nome.toLowerCase().includes(nomeFiltro));

    return statusOk && textoOk && nomeOk;
  });

  if (totalChamadosBadge) {
    totalChamadosBadge.textContent =
      `${filtrados.length} chamado${filtrados.length === 1 ? "" : "s"}`;
  }

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

    // NOVO: exibir categoria e urgência no card
    const metaRight = document.createElement("div");
    metaRight.className = "ticket-meta-right";

    const categoriaSpan = document.createElement("span");
    categoriaSpan.className = "badge"; // reaproveita visual existente
    categoriaSpan.textContent = c.categoria || "Sem categoria";

    const urgenciaSpan = document.createElement("span");
    urgenciaSpan.className = "badge";
    urgenciaSpan.textContent = c.urgencia || "Sem urgência";

    metaRight.appendChild(categoriaSpan);
    metaRight.appendChild(urgenciaSpan);

    footer.appendChild(tempoSpan);
    footer.appendChild(metaRight);

    card.appendChild(header);
    card.appendChild(titulo);
    card.appendChild(subtitle);
    card.appendChild(footer);

    card.addEventListener("click", () => abrirModalDetalhe(c));

    containerChamados.appendChild(card);
  });
}

statusFiltroSelect?.addEventListener("change", renderizarChamados);
buscaTextoInput?.addEventListener("input", renderizarChamados);
filtroNomeInput?.addEventListener("input", renderizarChamados);

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
  // TELEFONE REMOVIDO
  modalCategoriaSelect.value = chamado.categoria || "";
  modalUrgenciaSelect.value = chamado.urgencia || "";
  modalAssuntoInput.value = chamado.assunto || "";
  modalDescricaoTextarea.value = chamado.descricao || "";

  if (chamado.attachmentName) {
    modalAnexoContainer.innerHTML =
      `<strong>${chamado.attachmentName}</strong><br>` +
      `<span class="small muted">${chamado.attachmentType || ""} - ${
        ((chamado.attachmentSize || 0) / 1024) | 0
      } KB</span><br>` +
      (chamado.attachmentData
        ? `<a href="${chamado.attachmentData}" target="_blank">Abrir anexo</a>`
        : "");
  } else {
    modalAnexoContainer.textContent = "Nenhum anexo.";
  }

  // Inicia/renova chat de comentários para este chamado
  iniciarChatAdm(chamado);

  abrirModal(detalheModal);
}

detalheFecharBtn?.addEventListener("click", () => fecharModal(detalheModal));
detalheModal?.addEventListener("click", (e) => {
  if (e.target === detalheModal) fecharModal(detalheModal);
});

// -----------------------
// SALVAR ALTERAÇÕES
// -----------------------
modalSalvarBtn?.addEventListener("click", async () => {
  if (!chamadoSelecionado) return;

  const novoStatus = modalStatusSelect.value;
  const novoNome = modalNomeInput.value.trim();
  const novaCategoria = modalCategoriaSelect?.value || "";
  const novaUrgencia = modalUrgenciaSelect?.value || "";
  const novoAssunto = modalAssuntoInput.value.trim();
  const novaDescricao = modalDescricaoTextarea.value.trim();

  const statusAnterior = chamadoSelecionado.status || "";

  mostrarLoading();
  try {
    const docRef = doc(db, "chamados", chamadoSelecionado.id);
    await updateDoc(docRef, {
      status: novoStatus,
      nome: novoNome,
      categoria: novaCategoria,
      urgencia: novaUrgencia,
      assunto: novoAssunto,
      descricao: novaDescricao,
      updatedAt: new Date()
    });

    console.log("Chamado atualizado:", chamadoSelecionado.protocolo);

    const promises = [];

    // Comentário automático de mudança de status
    if (statusAnterior !== novoStatus) {
      const msgStatus = `Status alterado de "${statusAnterior || "-"}" para "${novoStatus}".`;

      promises.push(
        criarComentario({
          chamadoFirestoreId: chamadoSelecionado.id,
          protocolo: chamadoSelecionado.protocolo,
          actorType: "ADM",
          mensagem: msgStatus,
          origem: "STATUS_CHANGE"
        })
      );

      promises.push(
        criarLog({
          type: "UPDATE_STATUS",
          chamadoId: chamadoSelecionado.protocolo,
          actorType: "ADM",
          details: msgStatus
        })
      );
    }

    // Log genérico de update
    promises.push(
      criarLog({
        type: "UPDATE_CHAMADO",
        chamadoId: chamadoSelecionado.protocolo,
        actorType: "ADM",
        details: `Chamado atualizado pelo ADM. Novo status: "${novoStatus}".`
      })
    );

    await Promise.all(promises);

    // Atualiza estado em memória até o próximo snapshot
    chamadoSelecionado.status = novoStatus;
    chamadoSelecionado.nome = novoNome;
    chamadoSelecionado.categoria = novaCategoria;
    chamadoSelecionado.urgencia = novaUrgencia;
    chamadoSelecionado.assunto = novoAssunto;
    chamadoSelecionado.descricao = novaDescricao;

    fecharModal(detalheModal);
  } catch (err) {
    console.error("Erro ao atualizar chamado:", err);
    await criarLog({
      type: "ERROR_UPDATE_CHAMADO",
      chamadoId: chamadoSelecionado?.protocolo || null,
      actorType: "ADM",
      details: `Erro ao atualizar chamado: ${err.message}`
    });
    mostrarAdminAlert("Erro", "Não foi possível salvar as alterações.");
  } finally {
    ocultarLoading();
  }
});

// -----------------------
// CHAT / COMENTÁRIOS (ADM)
// -----------------------
function iniciarChatAdm(chamado) {
  if (!adminCommentsList) return;

  if (unsubscribeComentariosAdm) {
    unsubscribeComentariosAdm();
    unsubscribeComentariosAdm = null;
  }

  adminCommentsList.innerHTML =
    '<p class="small muted">Carregando mensagens...</p>';

  const comentariosRef = collection(db, "comentarios");

  // Sem orderBy na query (não precisa de índice composto)
  const q = query(
    comentariosRef,
    where("chamadoId", "==", chamado.id)
  );

  unsubscribeComentariosAdm = onSnapshot(
    q,
    (snapshot) => {
      let comentarios = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data()
      }));

      // Ordena no cliente por createdAt
      comentarios = comentarios.sort((a, b) => {
        const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
        const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
        return ta - tb;
      });

      renderComentariosAdm(comentarios);
    },
    (error) => {
      console.error("Erro ao ouvir comentários (ADM):", error);
      adminCommentsList.innerHTML =
        '<p class="small muted">Não foi possível carregar as mensagens.</p>';
    }
  );
}

function renderComentariosAdm(lista) {
  adminCommentsList.innerHTML = "";

  if (!lista || lista.length === 0) {
    adminCommentsList.innerHTML =
      '<p class="small muted">Nenhuma mensagem ainda. Use o campo abaixo para falar com o usuário.</p>';
    return;
  }

  lista.forEach((c) => {
    const wrapper = document.createElement("div");
    wrapper.className = "comment-wrapper";

    const bubble = document.createElement("div");
    bubble.className = "comment-bubble";

    const isAdm = c.autorTipo === "ADM";
    const isUsuario = c.autorTipo === "USUARIO";

    if (isAdm) {
      bubble.classList.add("comment-admin");
    } else if (isUsuario) {
      bubble.classList.add("comment-user");
    }

    const meta = document.createElement("div");
    meta.className = "comment-meta";
    const quem = isAdm ? "Você (ADM)" : "Usuário";
    meta.textContent = `${quem} • ${formatarDataHora(c.createdAt)}`;

    const texto = document.createElement("div");
    texto.className = "comment-text";
    texto.textContent = c.mensagem || "";

    bubble.appendChild(meta);
    bubble.appendChild(texto);
    wrapper.appendChild(bubble);

    adminCommentsList.appendChild(wrapper);
  });

  adminCommentsList.scrollTop = adminCommentsList.scrollHeight;
}

async function enviarComentarioAdm() {
  if (!chamadoSelecionado) {
    mostrarAdminAlert("Nenhum chamado", "Abra um chamado antes de comentar.");
    return;
  }

  const texto = adminNewCommentTextarea.value.trim();
  if (!texto) return;

  mostrarLoading();
  try {
    await criarComentario({
      chamadoFirestoreId: chamadoSelecionado.id,
      protocolo: chamadoSelecionado.protocolo,
      actorType: "ADM",
      mensagem: texto,
      origem: "CHAT_ADM"
    });

    await criarLog({
      type: "CREATE_COMENTARIO_ADM",
      chamadoId: chamadoSelecionado.protocolo,
      actorType: "ADM",
      details: "ADM adicionou um novo comentário no chamado."
    });

    adminNewCommentTextarea.value = "";
  } catch (err) {
    console.error("Erro ao enviar comentário do ADM:", err);
    mostrarAdminAlert(
      "Erro ao enviar mensagem",
      "Não foi possível enviar seu comentário. Tente novamente."
    );
  } finally {
    ocultarLoading();
  }
}

adminSendCommentBtn?.addEventListener("click", () => {
  enviarComentarioAdm();
});

adminNewCommentTextarea?.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    enviarComentarioAdm();
  }
});

// -----------------------
// EXCLUSÃO COM CONFIRMAÇÃO
// -----------------------
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

  mostrarLoading();
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
    ocultarLoading();
  }
});

// -----------------------
// LOGS: leitura e filtros
// -----------------------
async function carregarLogs() {
  logsTableBody.innerHTML = "<tr><td colspan='5'>Carregando...</td></tr>";

  const logsRef = collection(db, "logs");
  const q = query(logsRef, orderBy("createdAt", "desc"));

  mostrarLoading();
  try {
    const snapshot = await getDocs(q);

    let logs = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data()
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
  } finally {
    ocultarLoading();
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
