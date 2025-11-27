// js/acompanhamento.js
// ---------------------------------------------------
// Página de acompanhamento do chamado (usuário final)
// - Busca por protocolo
// - Exibe card simplificado do chamado
// - Modal somente leitura com detalhes
// - Usuário pode CANCELAR o chamado (UPDATE de status)
// - Gera logs em Firestore (coleção "logs")
// ---------------------------------------------------

import {
  db,
  collection,
  query,
  where,
  getDocs,
  doc,
  updateDoc
} from "./firebase-config.js";
import {
  criarLog,
  calcularTempoAbertura,
  formatarDataHora,
  aplicarClasseStatus
} from "./common.js";

// ELEMENTOS DA PÁGINA
const protocoloInput = document.getElementById("protocoloInput");
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

// Modal de alerta simples
const acompAlertModal = document.getElementById("acompAlertModal");
const acompAlertTitle = document.getElementById("acompAlertTitle");
const acompAlertMessage = document.getElementById("acompAlertMessage");
const acompAlertCloseBtn = document.getElementById("acompAlertCloseBtn");

// Estado local: último chamado encontrado
let chamadoAtual = null;

// -----------------------
// BUSCA POR PROTOCOLO
// -----------------------
buscarChamadoBtn?.addEventListener("click", () => {
  buscarChamadoPorProtocolo();
});

protocoloInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    buscarChamadoPorProtocolo();
  }
});

/**
 * Busca um chamado na coleção "chamados" pelo campo "protocolo".
 * Mostra um card simplificado caso encontrado.
 */
async function buscarChamadoPorProtocolo() {
  let protocolo = protocoloInput.value.trim();
  if (!protocolo) {
    mostrarAcompAlert("Atenção", "Digite um número de protocolo para buscar.");
    return;
  }

  // Normaliza protocolo (maiúsculas) para evitar diferença de digitação.
  protocolo = protocolo.toUpperCase();

  console.log("Buscando chamado com protocolo:", protocolo);

  acompanhamentoResultado.innerHTML =
    '<p class="small muted">Buscando chamado...</p>';

  try {
    const chamadosRef = collection(db, "chamados");
    const q = query(chamadosRef, where("protocolo", "==", protocolo));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      console.log("Nenhum chamado encontrado para o protocolo:", protocolo);
      acompanhamentoResultado.innerHTML =
        '<p class="small muted">Nenhum chamado encontrado para este protocolo.</p>';

      // Log de tentativa de consulta sem resultado
      await criarLog({
        type: "READ_CHAMADO_NOT_FOUND",
        chamadoId: protocolo,
        actorType: "USUARIO",
        details: "Usuário tentou consultar um protocolo inexistente ou não encontrado."
      });

      return;
    }

    // Consideramos que cada protocolo é único: usamos o primeiro resultado.
    const docSnap = snapshot.docs[0];
    chamadoAtual = {
      id: docSnap.id,
      ...docSnap.data()
    };

    console.log("Chamado encontrado:", chamadoAtual);

    // Log de leitura bem-sucedida
    await criarLog({
      type: "READ_CHAMADO",
      chamadoId: chamadoAtual.protocolo,
      actorType: "USUARIO",
      details: "Usuário consultou o status do chamado com sucesso."
    });

    renderizarCardChamado(chamadoAtual);
  } catch (err) {
    console.error("Erro ao buscar chamado por protocolo:", err);
    acompanhamentoResultado.innerHTML =
      '<p class="small muted">Não foi possível buscar o chamado. Tente novamente mais tarde.</p>';

    await criarLog({
      type: "ERROR_READ_CHAMADO",
      chamadoId: protocolo,
      actorType: "USUARIO",
      details: `Erro ao buscar chamado: ${err.message}`
    });

    mostrarAcompAlert(
      "Erro ao buscar chamado",
      "Ocorreu um erro ao consultar o protocolo. Tente novamente em alguns instantes."
    );
  }
}

/**
 * Cria um card simples na área de resultados com dados básicos do chamado.
 * Ao clicar no card, abre o modal de acompanhamento (somente visualização).
 */
function renderizarCardChamado(chamado) {
  if (!chamado) return;

  acompanhamentoResultado.innerHTML = "";

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
}

// -----------------------
// MODAL DE ACOMPANHAMENTO
// -----------------------

function abrirModalAcompanhamento(chamado) {
  if (!chamado) return;

  acompModalProtocoloSpan.textContent = chamado.protocolo || "";
  acompanharDataAberturaSpan.textContent = formatarDataHora(chamado.createdAt);
  acompanharTempoAberturaSpan.textContent = calcularTempoAbertura(chamado.createdAt);

  aplicarClasseStatus(acompanharStatusSpan, chamado.status);
  acompanharStatusSpan.textContent = chamado.status || "-";

  acompanharNomeSpan.textContent = chamado.nome || "-";
  acompanharTelefoneSpan.textContent = chamado.telefone || "-";
  acompanharAssuntoSpan.textContent = chamado.assunto || "-";
  acompanharDescricaoDiv.textContent = chamado.descricao || "-";

  // Estrategia de anexo:
  //  - O arquivo foi convertido para base64 (data URL) e salvo no Firestore.
  //  - Aqui apenas exibimos nome/tipo e um link "Abrir anexo" apontando para o data URL.
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

  // Caso já esteja resolvido ou cancelado, apenas informa ao usuário.
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

    // Atualiza estado local e UI
    chamadoAtual.status = "Cancelado";
    aplicarClasseStatus(acompanharStatusSpan, chamadoAtual.status);
    acompanharStatusSpan.textContent = chamadoAtual.status;

    // Registra log da ação de cancelamento
    await criarLog({
      type: "CANCEL_CHAMADO_USUARIO",
      chamadoId: chamadoAtual.protocolo,
      actorType: "USUARIO",
      details: "Usuário solicitou cancelamento do chamado. Status alterado para 'Cancelado'."
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
