// js/acompanhamento.js
// ---------------------------------------------------
// Página de acompanhamento do chamado (usuário final)
// - Busca por protocolo ou por nome do solicitante
// - Exibe lista de chamados em cards
// - Modal somente leitura com detalhes
// - Usuário pode CANCELAR o chamado (UPDATE de status)
// - Chat de comentários (usuário/ADM) dentro do modal
// - Gera logs em Firestore (coleção "logs")
// ---------------------------------------------------

import {
  db,
  collection,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
  onSnapshot
} from "./firebase-config.js";
import {
  criarLog,
  criarComentario,
  calcularTempoAbertura,
  formatarDataHora,
  aplicarClasseStatus
} from "./common.js";

// ELEMENTOS DA PÁGINA
const protocoloInput = document.getElementById("protocoloInput");
const nomeInput = document.getElementById("nomeInput"); // filtro por nome
const buscarChamadoBtn = document.getElementById("buscarChamadoBtn");
const acompanhamentoResultado = document.getElementById("acompanhamentoResultado");

// Modal de acompanhamento
const acompanharModal = document.getElementById("acompanharModal");
const acompanharFecharBtn = document.getElementById("acompanharFecharBtn");
const acompanharDataAberturaSpan = document.getElementById("acompanharDataAbertura");
const acompanharTempoAberturaSpan = document.getElementById("acompanharTempoAbertura");
const acompanharStatusSpan = document.getElementById("acompanharStatus");
const acompModalProtocoloSpan = document.getElementById("acompModalProtocolo");
const acompanharNomeSpan = document.getElementById("acompanharNome");
const acompanharTelefoneSpan = document.getElementById("acompanharTelefone");
const acompanharAssuntoSpan = document.getElementById("acompanharAssunto");
const acompanharDescricaoDiv = document.getElementById("acompanharDescricao");
const acompanharAnexoContainer = document.getElementById("acompanharAnexoContainer");
const cancelarChamadoBtn = document.getElementById("cancelarChamadoBtn");

// Chat / comentários no modal (lado do usuário)
const userCommentsList = document.getElementById("userCommentsList");
const userNewCommentTextarea = document.getElementById("userNewComment");
const userSendCommentBtn = document.getElementById("userSendCommentBtn");

// Modal de alerta simples
const acompAlertModal = document.getElementById("acompAlertModal");
const acompAlertTitle = document.getElementById("acompAlertTitle");
const acompAlertMessage = document.getElementById("acompAlertMessage");
const acompAlertCloseBtn = document.getElementById("acompAlertCloseBtn");

// Estado local
let chamadoAtual = null; // chamado selecionado no modal
let unsubscribeComentariosUser = null; // para parar o listener do chat

// -----------------------
// BUSCA (PROTOCOLO / NOME)
// -----------------------
buscarChamadoBtn?.addEventListener("click", () => {
  buscarChamados();
});

protocoloInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    buscarChamados();
  }
});

nomeInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    buscarChamados();
  }
});

/**
 * Busca chamados por:
 *  - Protocolo (se informado), ou
 *  - Nome do solicitante (se protocolo vazio e nome preenchido)
 */
async function buscarChamados() {
  let protocolo = protocoloInput?.value.trim() || "";
  const nome = nomeInput?.value.trim().toLowerCase() || "";

  if (!protocolo && !nome) {
    mostrarAcompAlert("Atenção", "Digite um número de protocolo ou um nome para buscar.");
    return;
  }

  acompanhamentoResultado.innerHTML =
    '<p class="small muted">Buscando chamados...</p>';

  try {
    const chamadosRef = collection(db, "chamados");

    // 1) Busca por PROTOCOLO (mais exata)
    if (protocolo) {
      protocolo = protocolo.toUpperCase();
      console.log("Buscando por protocolo:", protocolo);

      const q = query(chamadosRef, where("protocolo", "==", protocolo));
      const snapshot = await getDocs(q);

      console.log("Snapshot por protocolo, docs:", snapshot.size);

      if (snapshot.empty) {
        acompanhamentoResultado.innerHTML =
          '<p class="small muted">Nenhum chamado encontrado para este protocolo.</p>';

        await criarLog({
          type: "READ_CHAMADO_NOT_FOUND",
          chamadoId: protocolo,
          actorType: "USUARIO",
          details: "Usuário tentou consultar protocolo inexistente ou não encontrado."
        });

        return;
      }

      const chamados = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data()
      }));

      console.log("Chamados encontrados por protocolo:", chamados.length);

      await criarLog({
        type: "READ_CHAMADO",
        chamadoId: protocolo,
        actorType: "USUARIO",
        details: "Usuário consultou chamados por protocolo."
      });

      renderizarListaChamados(chamados);
      return;
    }

    // 2) Não há protocolo -> busca por NOME (client-side)
    console.log("Buscando por nome (client-side):", nome);

    const snapshot = await getDocs(chamadosRef);
    console.log("Snapshot total de chamados (para filtro por nome):", snapshot.size);

    let chamados = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data()
    }));

    chamados = chamados.filter((c) =>
      (c.nome || "").toLowerCase().includes(nome)
    );

    console.log("Chamados encontrados por nome:", chamados.length);

    if (chamados.length === 0) {
      acompanhamentoResultado.innerHTML =
        '<p class="small muted">Nenhum chamado encontrado para este nome.</p>';

      await criarLog({
        type: "READ_CHAMADO_NOT_FOUND_NOME",
        chamadoId: null,
        actorType: "USUARIO",
        details: `Usuário tentou consultar por nome "${nome}", sem resultados.`
      });

      return;
    }

    await criarLog({
      type: "READ_CHAMADOS_BY_NOME",
      chamadoId: null,
      actorType: "USUARIO",
      details: `Usuário consultou ${chamados.length} chamados pelo nome "${nome}".`
    });

    renderizarListaChamados(chamados);
  } catch (err) {
    console.error("Erro ao buscar chamados:", err);
    acompanhamentoResultado.innerHTML =
      '<p class="small muted">Não foi possível buscar. Tente novamente mais tarde.</p>';

    await criarLog({
      type: "ERROR_READ_CHAMADO",
      chamadoId: null,
      actorType: "USUARIO",
      details: `Erro ao buscar chamado: ${err.message}`
    });

    mostrarAcompAlert(
      "Erro ao buscar chamado",
      "Ocorreu um erro ao consultar. Tente novamente em alguns instantes."
    );
  }
}

/**
 * Renderiza lista de chamados em forma de cards.
 */
function renderizarListaChamados(chamados) {
  acompanhamentoResultado.innerHTML = "";

  if (!chamados || chamados.length === 0) {
    acompanhamentoResultado.innerHTML =
      '<p class="small muted">Nenhum chamado encontrado.</p>';
    return;
  }

  chamados.forEach((chamado) => {
    const card = document.createElement("article");
    card.className = "ticket-card";

    const header = document.createElement("div");
    header.className = "ticket-header";

    const protocoloSpan = document.createElement("span");
    protocoloSpan.className = "ticket-protocol";
    protocoloSpan.textContent = chamado.protocolo || "(sem protocolo)";

    const statusSpan = document.createElement("span");
    aplicarClasseStatus(statusSpan, chamado.status);
    statusSpan.textContent = chamado.status || "-";

    header.appendChild(protocoloSpan);
    header.appendChild(statusSpan);

    const titulo = document.createElement("div");
    titulo.className = "ticket-title";
    titulo.textContent = chamado.assunto || "(sem assunto)";

    const subtitle = document.createElement("div");
    subtitle.className = "ticket-subtitle";
    subtitle.textContent = chamado.nome || "(sem nome)";

    const footer = document.createElement("div");
    footer.className = "ticket-footer";

    const tempoSpan = document.createElement("span");
    tempoSpan.className = "ticket-time";
    tempoSpan.textContent = calcularTempoAbertura(chamado.createdAt);

    footer.appendChild(tempoSpan);

    card.appendChild(header);
    card.appendChild(titulo);
    card.appendChild(subtitle);
    card.appendChild(footer);

    card.addEventListener("click", () => abrirModalAcompanhamento(chamado));

    acompanhamentoResultado.appendChild(card);
  });
}

// -----------------------
// MODAL DE ACOMPANHAMENTO
// -----------------------
function abrirModalAcompanhamento(chamado) {
  if (!chamado) return;

  chamadoAtual = chamado;

  acompModalProtocoloSpan.textContent = chamado.protocolo || "";
  acompanharDataAberturaSpan.textContent = formatarDataHora(chamado.createdAt);
  acompanharTempoAberturaSpan.textContent = calcularTempoAbertura(chamado.createdAt);

  aplicarClasseStatus(acompanharStatusSpan, chamado.status);
  acompanharStatusSpan.textContent = chamado.status || "-";

  acompanharNomeSpan.textContent = chamado.nome || "-";
  acompanharTelefoneSpan.textContent = chamado.telefone || "-";
  acompanharAssuntoSpan.textContent = chamado.assunto || "-";
  acompanharDescricaoDiv.textContent = chamado.descricao || "-";

  if (chamado.attachmentName) {
    acompanharAnexoContainer.innerHTML =
      `<strong>${chamado.attachmentName}</strong><br>` +
      `<span class="small muted">${chamado.attachmentType || ""} - ${(chamado.attachmentSize || 0) / 1024 | 0} KB</span><br>` +
      (chamado.attachmentData
        ? `<a href="${chamado.attachmentData}" target="_blank">Abrir anexo</a>`
        : '<span class="small muted">Pré-visualização indisponível.</span>');
  } else {
    acompanharAnexoContainer.textContent = "Nenhum anexo.";
  }

  // Inicia/renova listener de comentários (chat)
  iniciarChatUsuario(chamado);

  abrirModal(acompanharModal);
}

acompanharFecharBtn?.addEventListener("click", () =>
  fecharModal(acompanharModal)
);

acompanharModal?.addEventListener("click", (e) => {
  if (e.target === acompanharModal) {
    fecharModal(acompanharModal);
  }
});

// -----------------------
// CHAT / COMENTÁRIOS (USUÁRIO)
// -----------------------

function iniciarChatUsuario(chamado) {
  if (!userCommentsList) return;

  // Encerra listener anterior, se existir
  if (unsubscribeComentariosUser) {
    unsubscribeComentariosUser();
    unsubscribeComentariosUser = null;
  }

  userCommentsList.innerHTML =
    '<p class="small muted">Carregando mensagens...</p>';

  const comentariosRef = collection(db, "comentarios");

  // Sem orderBy na query (evita índice composto)
  const q = query(
    comentariosRef,
    where("chamadoId", "==", chamado.id)
  );

  unsubscribeComentariosUser = onSnapshot(
    q,
    (snapshot) => {
      let comentarios = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data()
      }));

      // Ordena no cliente por createdAt (mais antigo -> mais recente)
      comentarios = comentarios.sort((a, b) => {
        const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
        const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
        return ta - tb;
      });

      renderComentariosUsuario(comentarios);
    },
    (error) => {
      console.error("Erro ao ouvir comentários:", error);
      userCommentsList.innerHTML =
        '<p class="small muted">Não foi possível carregar as mensagens.</p>';
    }
  );
}

function renderComentariosUsuario(lista) {
  userCommentsList.innerHTML = "";

  if (!lista || lista.length === 0) {
    userCommentsList.innerHTML =
      '<p class="small muted">Nenhuma mensagem ainda. Você pode enviar uma dúvida aqui.</p>';
    return;
  }

  lista.forEach((c) => {
    const wrapper = document.createElement("div");
    wrapper.className = "comment-wrapper";

    const bubble = document.createElement("div");
    bubble.className = "comment-bubble";

    const isUsuario = c.autorTipo === "USUARIO";
    const isAdm = c.autorTipo === "ADM";

    if (isUsuario) {
      bubble.classList.add("comment-user");
    } else if (isAdm) {
      bubble.classList.add("comment-admin");
    }

    const meta = document.createElement("div");
    meta.className = "comment-meta";
    const quem = isAdm ? "Atendimento" : "Você";
    meta.textContent = `${quem} • ${formatarDataHora(c.createdAt)}`;

    const texto = document.createElement("div");
    texto.className = "comment-text";
    texto.textContent = c.mensagem || "";

    bubble.appendChild(meta);
    bubble.appendChild(texto);
    wrapper.appendChild(bubble);

    userCommentsList.appendChild(wrapper);
  });

  userCommentsList.scrollTop = userCommentsList.scrollHeight;
}

// Enviar comentário pelo usuário
async function enviarComentarioUsuario() {
  if (!chamadoAtual) {
    mostrarAcompAlert("Nenhum chamado", "Abra um chamado antes de comentar.");
    return;
  }
  const texto = userNewCommentTextarea.value.trim();
  if (!texto) return;

  try {
    await criarComentario({
      chamadoFirestoreId: chamadoAtual.id,
      protocolo: chamadoAtual.protocolo,
      actorType: "USUARIO",
      mensagem: texto,
      origem: "CHAT_USUARIO"
    });

    await criarLog({
      type: "CREATE_COMENTARIO_USUARIO",
      chamadoId: chamadoAtual.protocolo,
      actorType: "USUARIO",
      details: `Usuário adicionou um comentário no chamado.`
    });

    userNewCommentTextarea.value = "";
  } catch (err) {
    console.error("Erro ao enviar comentário do usuário:", err);
    mostrarAcompAlert(
      "Erro ao enviar mensagem",
      "Não foi possível enviar seu comentário. Tente novamente."
    );
  }
}

userSendCommentBtn?.addEventListener("click", () => {
  enviarComentarioUsuario();
});

userNewCommentTextarea?.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    enviarComentarioUsuario();
  }
});

// -----------------------
// CANCELAMENTO DO CHAMADO
// -----------------------
cancelarChamadoBtn?.addEventListener("click", async () => {
  if (!chamadoAtual) {
    mostrarAcompAlert(
      "Nenhum chamado selecionado",
      "Busque um protocolo e abra os detalhes do chamado antes de cancelar."
    );
    return;
  }

  if (chamadoAtual.status === "Cancelado") {
    mostrarAcompAlert(
      "Chamado já cancelado",
      "Este chamado já está com status 'Cancelado'."
    );
    return;
  }

  if (chamadoAtual.status === "Resolvido") {
    mostrarAcompAlert(
      "Chamado já resolvido",
      "Este chamado já foi marcado como 'Resolvido' pelo atendimento."
    );
    return;
  }

  try {
    const docRef = doc(db, "chamados", chamadoAtual.id);
    await updateDoc(docRef, {
      status: "Cancelado",
      updatedAt: new Date()
    });

    console.log("Chamado cancelado pelo usuário:", chamadoAtual.protocolo);

    chamadoAtual.status = "Cancelado";
    aplicarClasseStatus(acompanharStatusSpan, chamadoAtual.status);
    acompanharStatusSpan.textContent = chamadoAtual.status;

    await criarComentario({
      chamadoFirestoreId: chamadoAtual.id,
      protocolo: chamadoAtual.protocolo,
      actorType: "USUARIO",
      mensagem: "Usuário cancelou o chamado. Status alterado para 'Cancelado'.",
      origem: "CANCELAMENTO_USUARIO"
    });

    await criarLog({
      type: "CANCEL_CHAMADO_USUARIO",
      chamadoId: chamadoAtual.protocolo,
      actorType: "USUARIO",
      details: "Usuário cancelou o chamado (status 'Cancelado')."
    });

    mostrarAcompAlert(
      "Chamado cancelado",
      "Seu chamado foi cancelado com sucesso. Caso precise, você pode abrir um novo chamado a qualquer momento."
    );
  } catch (err) {
    console.error("Erro ao cancelar chamado:", err);

    await criarLog({
      type: "ERROR_CANCEL_CHAMADO_USUARIO",
      chamadoId: chamadoAtual.protocolo,
      actorType: "USUARIO",
      details: `Erro ao cancelar chamado: ${err.message}`
    });

    mostrarAcompAlert(
      "Erro ao cancelar chamado",
      "Não foi possível cancelar o chamado. Tente novamente em alguns instantes."
    );
  }
});

// -----------------------
// HELPERS DE MODAL/ALERTA
// -----------------------
function abrirModal(modal) {
  if (!modal) return;
  modal.classList.remove("hidden");
}

function fecharModal(modal) {
  if (!modal) return;
  modal.classList.add("hidden");
}

function mostrarAcompAlert(titulo, mensagem) {
  acompAlertTitle.textContent = titulo;
  acompAlertMessage.textContent = mensagem;
  abrirModal(acompAlertModal);
}

acompAlertCloseBtn?.addEventListener("click", () =>
  fecharModal(acompAlertModal)
);

acompAlertModal?.addEventListener("click", (e) => {
  if (e.target === acompAlertModal) fecharModal(acompAlertModal);
});
