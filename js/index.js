// js/index.js
// ---------------------------------------------------
// Lógica da página de abertura de chamado (usuário).
// - Captura do formulário
// - Conversão do anexo em base64
// - Criação do documento na coleção "chamados"
// - Exibição de modal de sucesso/erro
// ---------------------------------------------------

import {
  db,
  collection,
  addDoc,
  serverTimestamp
} from "./firebase-config.js";
import {
  criarLog,
  gerarProtocolo,
  LIMITE_ANEXO_BYTES,
  converterArquivoParaBase64
} from "./common.js";

const form = document.getElementById("chamadoForm");
const anexoInput = document.getElementById("anexo");
const anexoNomeSpan = document.getElementById("anexoNome");
// NOVO: botão estilizado e nome clicável
const anexoLabel = document.querySelector(".file-label");

const feedbackModal = document.getElementById("feedbackModal");
const feedbackIcon = document.getElementById("feedbackIcon");
const feedbackTitle = document.getElementById("feedbackTitle");
const feedbackMessage = document.getElementById("feedbackMessage");
const feedbackProtocoloSpan = document.getElementById("feedbackProtocolo");
const feedbackCloseBtn = document.getElementById("feedbackCloseBtn");

const simpleAlertModal = document.getElementById("simpleAlertModal");
const simpleAlertTitle = document.getElementById("simpleAlertTitle");
const simpleAlertMessage = document.getElementById("simpleAlertMessage");
const simpleAlertCloseBtn = document.getElementById("simpleAlertCloseBtn");

let arquivoSelecionado = null;

// -----------------------
// INPUT DE ANEXO
// -----------------------

// Deixa o botão estilizado realmente abrindo o seletor de arquivo
anexoLabel?.addEventListener("click", () => {
  anexoInput?.click();
});

// Também permite clicar no texto do nome do arquivo
anexoNomeSpan?.addEventListener("click", () => {
  anexoInput?.click();
});

// Mostra nome do arquivo no input estilizado
anexoInput?.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) {
    anexoNomeSpan.textContent = "Nenhum arquivo selecionado";
    arquivoSelecionado = null;
    return;
  }
  if (file.size > LIMITE_ANEXO_BYTES) {
    mostrarAlertaSimples(
      "Arquivo muito grande",
      "O anexo ultrapassa o limite de ~700KB. Por favor, reduza o tamanho ou envie sem anexo."
    );
    anexoInput.value = "";
    anexoNomeSpan.textContent = "Nenhum arquivo selecionado";
    arquivoSelecionado = null;
    return;
  }
  arquivoSelecionado = file;
  anexoNomeSpan.textContent = file.name;
});

// -----------------------
// ENVIO DO FORMULÁRIO
// -----------------------
form?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const nome = form.nome.value.trim();
  const telefone = form.telefone.value.trim();
  const assunto = form.assunto.value.trim();
  const descricao = form.descricao.value.trim();

  if (!nome || !telefone || !assunto || !descricao) {
    mostrarAlertaSimples("Campos obrigatórios", "Preencha todos os campos antes de enviar.");
    return;
  }

  const protocolo = await gerarProtocolo();
  const createdAt = serverTimestamp();
  const status = "Em Espera";

  let attachmentData = null;

  try {
    // Converte arquivo em base64 se houver
    if (arquivoSelecionado) {
      attachmentData = await converterArquivoParaBase64(arquivoSelecionado);
    }

    const docRef = await addDoc(collection(db, "chamados"), {
      protocolo,
      createdAt,
      updatedAt: createdAt,
      status,
      nome,
      telefone,
      assunto,
      descricao,
      attachmentName: arquivoSelecionado ? arquivoSelecionado.name : null,
      attachmentType: arquivoSelecionado ? arquivoSelecionado.type : null,
      attachmentSize: arquivoSelecionado ? arquivoSelecionado.size : null,
      attachmentData: attachmentData // Base64 (data URL)
    });

    console.log("Chamado criado:", {
      id: docRef.id,
      protocolo,
      nome,
      status,
      horario: new Date().toISOString()
    });

    await criarLog({
      type: "CREATE_CHAMADO",
      chamadoId: protocolo,
      actorType: "USUARIO",
      details: `Chamado criado pelo usuário ${nome} com status inicial "${status}".`
    });

    // Limpa formulário e estado do arquivo
    form.reset();
    arquivoSelecionado = null;
    anexoNomeSpan.textContent = "Nenhum arquivo selecionado";

    // Mostra modal de sucesso com o protocolo
    feedbackIcon.textContent = "✔️";
    feedbackTitle.textContent = "Chamado enviado com sucesso!";
    feedbackProtocoloSpan.textContent = protocolo;
    feedbackMessage.innerHTML =
      `Seu protocolo é <strong>${protocolo}</strong>. ` +
      "Guarde este número para acompanhar o chamado.";
    abrirModal(feedbackModal);
  } catch (err) {
    console.error("Erro ao criar chamado:", err);

    await criarLog({
      type: "ERROR_CREATE_CHAMADO",
      chamadoId: protocolo,
      actorType: "USUARIO",
      details: `Erro ao criar chamado: ${err.message}`
    });

    feedbackIcon.textContent = "❌";
    feedbackTitle.textContent = "Erro ao enviar chamado";
    feedbackProtocoloSpan.textContent = "";
    feedbackMessage.textContent =
      "Ocorreu um erro ao registrar seu chamado. Tente novamente em alguns instantes.";
    abrirModal(feedbackModal);
  }
});

// -----------------------
// MODAIS / ALERTAS
// -----------------------
feedbackCloseBtn?.addEventListener("click", () => fecharModal(feedbackModal));
feedbackModal?.addEventListener("click", (e) => {
  if (e.target === feedbackModal) fecharModal(feedbackModal);
});

simpleAlertCloseBtn?.addEventListener("click", () => fecharModal(simpleAlertModal));
simpleAlertModal?.addEventListener("click", (e) => {
  if (e.target === simpleAlertModal) fecharModal(simpleAlertModal);
});

// Helpers de modal
function abrirModal(modal) {
  if (!modal) return;
  modal.classList.remove("hidden");
}

function fecharModal(modal) {
  if (!modal) return;
  modal.classList.add("hidden");
}

function mostrarAlertaSimples(titulo, mensagem) {
  simpleAlertTitle.textContent = titulo;
  simpleAlertMessage.textContent = mensagem;
  abrirModal(simpleAlertModal);
}
