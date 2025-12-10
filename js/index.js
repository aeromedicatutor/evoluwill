// js/index.js
// ---------------------------------------------------
// Lógica da página de abertura de chamado (usuário).
// - Captura do formulário
// - Conversão do anexo em base64
// - Criação do documento na coleção "chamados"
// - Exibição de modal de sucesso/erro
// - Uso de loading global em operações assíncronas
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
  converterArquivoParaBase64,
  mostrarLoading,
  ocultarLoading
} from "./common.js";

const form = document.getElementById("chamadoForm");
const anexoInput = document.getElementById("anexo");
const anexoNomeSpan = document.getElementById("anexoNome");
// botão estilizado
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
// MODAIS SIMPLES
// -----------------------

function mostrarAlertaSimples(titulo, mensagem) {
  if (!simpleAlertModal) {
    alert(mensagem);
    return;
  }
  simpleAlertTitle.textContent = titulo;
  simpleAlertMessage.textContent = mensagem;
  simpleAlertModal.classList.remove("hidden");
}

function fecharAlertaSimples() {
  simpleAlertModal?.classList.add("hidden");
}

simpleAlertCloseBtn?.addEventListener("click", fecharAlertaSimples);

function mostrarFeedbackSucesso(protocolo) {
  if (!feedbackModal) return;
  feedbackIcon.textContent = "✔️";
  feedbackTitle.textContent = "Chamado enviado com sucesso!";
  feedbackMessage.innerHTML =
    'Seu protocolo é <strong id="feedbackProtocolo"></strong>. ' +
    "Guarde este número para acompanhar o chamado.";
  feedbackProtocoloSpan.textContent = protocolo;
  feedbackModal.classList.remove("hidden");
}

function mostrarFeedbackErro(msg) {
  if (!feedbackModal) {
    alert(msg);
    return;
  }
  feedbackIcon.textContent = "❌";
  feedbackTitle.textContent = "Erro ao enviar chamado";
  feedbackMessage.textContent = msg;
  feedbackProtocoloSpan.textContent = "";
  feedbackModal.classList.remove("hidden");
}

feedbackCloseBtn?.addEventListener("click", () => {
  feedbackModal?.classList.add("hidden");
});

// -----------------------
// ENVIO DO FORMULÁRIO
// -----------------------
form?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const nome = form.nome.value.trim();
  const categoria = form.categoria.value;
  const assunto = form.assunto.value.trim();
  const urgencia = form.urgencia.value;
  const descricao = form.descricao.value.trim();

  if (!nome || !categoria || !assunto || !urgencia || !descricao) {
    mostrarAlertaSimples(
      "Campos obrigatórios",
      "Preencha todos os campos antes de enviar."
    );
    return;
  }

  let anexoBase64 = null;
  let anexoNome = null;
  let anexoTipo = null;

  try {
    mostrarLoading();

    // Converte anexo se existir
    if (arquivoSelecionado) {
      anexoBase64 = await converterArquivoParaBase64(arquivoSelecionado);
      anexoNome = arquivoSelecionado.name;
      anexoTipo = arquivoSelecionado.type;
    }

    // Gera protocolo legível
    const protocolo = await gerarProtocolo();

    const chamado = {
      nome,
      categoria,
      assunto,
      urgencia,
      descricao,
      protocolo,
      status: "Em Espera",
      createdAt: serverTimestamp(),
      anexoBase64: anexoBase64 || null,
      anexoNome: anexoNome || null,
      anexoTipo: anexoTipo || null
    };

    console.log("[CREATE_CHAMADO] Enviando chamado:", chamado);

    const docRef = await addDoc(collection(db, "chamados"), chamado);

    console.log("[CREATE_CHAMADO] Criado com ID:", docRef.id);

    await criarLog({
      type: "CREATE_CHAMADO",
      chamadoId: protocolo,
      actorType: "USUARIO",
      details: `Chamado criado pelo usuário. Nome: ${nome}, Categoria: ${categoria}, Urgência: ${urgencia}, Status inicial: Em Espera.`
    });

    mostrarFeedbackSucesso(protocolo);

    // Limpa formulário e anexo
    form.reset();
    arquivoSelecionado = null;
    if (anexoInput) anexoInput.value = "";
    if (anexoNomeSpan) anexoNomeSpan.textContent = "Nenhum arquivo selecionado";
  } catch (err) {
    console.error("Erro ao criar chamado:", err);

    await criarLog({
      type: "ERROR_CREATE_CHAMADO",
      chamadoId: null,
      actorType: "USUARIO",
      details: `Erro ao criar chamado: ${err.message}`
    });

    mostrarFeedbackErro(
      "Não foi possível enviar seu chamado no momento. Tente novamente em instantes."
    );
  } finally {
    ocultarLoading();
  }
});
