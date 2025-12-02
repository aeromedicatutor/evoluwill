// js/acompanhamento.js
// ---------------------------------------------------
// Página de acompanhamento do chamado (usuário final)
// - Busca por protocolo ou por nome do solicitante
// - Exibe lista de chamados em cards
// - Modal somente leitura com detalhes
// - Usuário pode CANCELAR o chamado (UPDATE de status)
// - Chat de comentários (usuário/ADM) dentro do modal
// - Gera logs em Firestore (coleção "logs")
// - Usa loading global em operações assíncronas
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
  aplicarClasseStatus,
  mostrarLoading,
  ocultarLoading
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
const acompanharCategoriaSpan = document.getElementById("acompanharCategoria");
const acompanharUrgenciaSpan = document.getElementById("acompanharUrgencia");
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
// HELPERS
// -----------------------

function mostrarAcompAlert(titulo, mensagem) {
  if (!acompAlertModal) {
    alert(mensagem);
    return;
  }
  acompAlertTitle.textContent = titulo;
  acompAlertMessage.textContent = mensagem;
  acompAlertModal.classList.remove("hidden");
}

function fecharAcompAlert() {
  acompAlertModal?.classList.add("hidden");
}

acompAlertCloseBtn?.addEventListener("click", fecharAcompAlert);

function mapearClasseUrgencia(urgencia) {
  if (!urgencia) return "urgency-azul";

  const texto = urgencia.toLowerCase();
  if (texto.startsWith("vermelho")) return "urgency-vermelho";
  if (texto.startsWith("laranja")) return "urgency-laranja";
  if (texto.startsWith("amarelo")) return "urgency-amarelo";
  if (texto.startsWith("verde")) return "urgency-verde";
  if (texto.startsWith("azul")) return "urgency-azul";
  return "urgency-azul";
}

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
 *
 * IMPORTANTE:
 *  - Firestore é case-sensitive.
 *  - Aqui não convertemos mais para lowerCase, então o usuário precisa
 *    digitar o nome com a mesma capitalização usada na abertura do chamado
 *    (ex: "Jonas" ≠ "jonas").
 */
async function buscarChamados() {
  let protocolo = protocoloInput?.value.trim() || "";
  const nome = nomeInput?.value.trim() || ""; // <-- REMOVIDO .toLowerCase()

  if (!protocolo && !nome) {
    mostrarAcompAlert(
      "Atenção",
      "Digite um número de protocolo ou um nome para buscar."
    );
    return;
  }

  acompanhamentoResultado.innerHTML =
    '<p class="small muted">Buscando chamados...</p>';

  try {
    mostrarLoading();

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
          details:
            "Usuário tentou consultar protocolo inexistente ou não encontrado."
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

    // 2) Não há protocolo → busca por nome (prefix search, case-sensitive)
    console.log("Buscando por nome:", nome);
    const qNome = query(
      chamadosRef,
      where("nome", ">=", nome),
      where("nome", "<=", nome + "\uf8ff")
    );
    const snapshotNome = await getDocs(qNome);

    if (snapshotNome.empty) {
      acompanhamentoResultado.innerHTML =
        '<p class="small muted">Nenhum chamado encontrado para este nome.</p>';

      await criarLog({
        type: "READ_CHAMADO_NOT_FOUND",
        chamadoId: null,
        actorType: "USUARIO",
        details:
          "Usuário tentou consultar por nome, mas nenhum chamado foi encontrado."
      });

      return;
    }

    const chamadosPorNome = snapshotNome.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data()
    }));

    await criarLog({
      type: "READ_CHAMADO",
      chamadoId: null,
      actorType: "USUARIO",
      details: "Usuário consultou chamados pelo nome."
    });

    renderizarListaChamados(chamadosPorNome);
  } catch (err) {
    console.error("Erro ao buscar chamados:", err);

    await criarLog({
      type: "ERROR_READ_CHAMADO",
      chamadoId: null,
      actorType: "USUARIO",
      details: `Erro ao buscar chamados: ${err.message}`
    });

    mostrarAcompAlert(
      "Erro",
      "Não foi possível buscar os chamados. Tente novamente mais tarde."
    );
  } finally {
    ocultarLoading();
  }
}

// -----------------------
// RENDERIZAÇÃO DOS CARDS
// -----------------------
function renderizarListaChamados(chamados) {
  acompanhamentoResultado.innerHTML = "";

  if (!chamados || chamados.length === 0) {
    acompanhamentoResultado.innerHTML =
      '<p class="small muted">Nenhum chamado encontrado.</p>';
    return;
  }

  chamados.forEach((c) => {
    const card = document.createElement("article");
    card.className = "ticket-card";

    const tempoAbertura = c.createdAt ? calcularTempoAbertura(c.createdAt) : "-";

    const urgenciaClasse = mapearClasseUrgencia(c.urgencia);
    const urgenciaTexto = c.urgencia || "-";

    card.innerHTML = `
      <header class="ticket-card-header">
        <span class="pill pill-primary">${c.protocolo || "Sem protocolo"}</span>
        <span class="status-pill status-${(c.status || "")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .replace(/\s+/g, "-")}">
          ${c.status || "Sem status"}
        </span>
      </header>
      <div class="ticket-card-body">
        <h3 class="ticket-title">${c.assunto || "Sem assunto"}</h3>
        <p class="ticket-meta">
          <strong>Solicitante:</strong> ${c.nome || "-"}<br/>
          <strong>Categoria:</strong> ${c.categoria || "-"}
        </p>
        <p class="ticket-meta">
          <strong>Urgência:</strong>
          <span class="urgency-pill ${urgenciaClasse}">${urgenciaTexto}</span>
        </p>
        <p class="ticket-time">${tempoAbertura}</p>
      </div>
    `;

    card.addEventListener("click", () => {
      abrirModalAcompanhamento(c);
    });

    acompanhamentoResultado.appendChild(card);
  });
}

// -----------------------
// MODAL ACOMPANHAMENTO
// -----------------------
function abrirModalAcompanhamento(chamado) {
  chamadoAtual = chamado;

  acompModalProtocoloSpan.textContent = chamado.protocolo || "-";
  acompanharDataAberturaSpan.textContent = chamado.createdAt
    ? formatarDataHora(chamado.createdAt)
    : "-";
  acompanharTempoAberturaSpan.textContent = chamado.createdAt
    ? calcularTempoAbertura(chamado.createdAt)
    : "-";

  acompanharNomeSpan.textContent = chamado.nome || "-";
  acompanharCategoriaSpan.textContent = chamado.categoria || "-";
  acompanharAssuntoSpan.textContent = chamado.assunto || "-";
  acompanharDescricaoDiv.textContent = chamado.descricao || "-";

  // Status
  aplicarClasseStatus(acompanharStatusSpan, chamado.status || "Em Espera");

  // Urgência
  const urgenciaTexto = chamado.urgencia || "-";
  acompanharUrgenciaSpan.textContent = urgenciaTexto;
  acompanharUrgenciaSpan.className = "urgency-pill " + mapearClasseUrgencia(urgenciaTexto);

  // Anexo
  acompanharAnexoContainer.innerHTML = "";
  if (chamado.anexoBase64 && chamado.anexoNome) {
    const link = document.createElement("a");
    link.href = chamado.anexoBase64;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = chamado.anexoNome;
    acompanharAnexoContainer.appendChild(link);
  } else {
    acompanharAnexoContainer.textContent = "Nenhum anexo.";
  }

  // Listener de comentários
  iniciarListenerComentarios(chamado);

  acompanharModal.classList.remove("hidden");
}

acompanharFecharBtn?.addEventListener("click", () => {
  acompanharModal.classList.add("hidden");
  if (unsubscribeComentariosUser) {
    unsubscribeComentariosUser();
    unsubscribeComentariosUser = null;
  }
});

/**
 * Listener em tempo real de comentários para o chamado atual.
 */
function iniciarListenerComentarios(chamado) {
  if (unsubscribeComentariosUser) {
    unsubscribeComentariosUser();
    unsubscribeComentariosUser = null;
  }

  const comentariosRef = collection(db, "comentarios");
  const q = query(comentariosRef, where("chamadoId", "==", chamado.id));

  unsubscribeComentariosUser = onSnapshot(
    q,
    (snapshot) => {
      const comentarios = snapshot.docs
        .map((d) => d.data())
        .sort((a, b) => {
          const da = a.createdAt?.toMillis?.() ?? 0;
          const dbb = b.createdAt?.toMillis?.() ?? 0;
          return da - dbb;
        });

      userCommentsList.innerHTML = "";

      comentarios.forEach((c) => {
        const item = document.createElement("div");
        item.className =
          "comment-item " +
          (c.autorTipo === "ADM" ? "comment-adm" : "comment-user");

        const dataStr = c.createdAt ? formatarDataHora(c.createdAt) : "";
        item.innerHTML = `
          <div class="comment-meta">
            <span class="comment-author">${c.autorTipo || "-"}</span>
            <span class="comment-date">${dataStr}</span>
          </div>
          <div class="comment-text">
            ${c.mensagem || ""}
          </div>
        `;
        userCommentsList.appendChild(item);
      });

      userCommentsList.scrollTop = userCommentsList.scrollHeight;
    },
    (error) => {
      console.error("Erro ao ouvir comentários:", error);
    }
  );
}

// -----------------------
// CANCELAR CHAMADO (USUÁRIO)
// -----------------------
cancelarChamadoBtn?.addEventListener("click", async () => {
  if (!chamadoAtual) return;

  const confirmar = confirm(
    "Tem certeza que deseja cancelar este chamado? O status será alterado para 'Cancelado'."
  );
  if (!confirmar) return;

  try {
    mostrarLoading();

    const chamadoRef = doc(db, "chamados", chamadoAtual.id);
    await updateDoc(chamadoRef, {
      status: "Cancelado"
    });

    await criarLog({
      type: "CANCELAR_CHAMADO_USUARIO",
      chamadoId: chamadoAtual.protocolo || chamadoAtual.id,
      actorType: "USUARIO",
      details: "Usuário cancelou o chamado via página de acompanhamento."
    });

    await criarComentario({
      chamadoFirestoreId: chamadoAtual.id,
      protocolo: chamadoAtual.protocolo,
      actorType: "USUARIO",
      origem: "CANCELAMENTO_USUARIO",
      mensagem: "Chamado cancelado pelo usuário via acompanhamento."
    });

    mostrarAcompAlert(
      "Chamado cancelado",
      "Seu chamado foi cancelado com sucesso."
    );

    acompanharModal.classList.add("hidden");
  } catch (err) {
    console.error("Erro ao cancelar chamado:", err);

    await criarLog({
      type: "ERROR_CANCELAR_CHAMADO_USUARIO",
      chamadoId: chamadoAtual.protocolo || chamadoAtual.id,
      actorType: "USUARIO",
      details: `Erro ao cancelar chamado: ${err.message}`
    });

    mostrarAcompAlert(
      "Erro ao cancelar",
      "Não foi possível cancelar o chamado. Tente novamente."
    );
  } finally {
    ocultarLoading();
  }
});

// -----------------------
// ENVIO DE COMENTÁRIO PELO USUÁRIO
// -----------------------
userSendCommentBtn?.addEventListener("click", async () => {
  if (!chamadoAtual) return;
  const texto = userNewCommentTextarea.value.trim();
  if (!texto) return;

  try {
    mostrarLoading();

    await criarComentario({
      chamadoFirestoreId: chamadoAtual.id,
      protocolo: chamadoAtual.protocolo,
      actorType: "USUARIO",
      origem: "MANUAL_USUARIO",
      mensagem: texto
    });

    userNewCommentTextarea.value = "";
  } catch (err) {
    console.error("Erro ao enviar comentário do usuário:", err);
    mostrarAcompAlert(
      "Erro",
      "Não foi possível enviar sua mensagem. Tente novamente."
    );
  } finally {
    ocultarLoading();
  }
});
