// js/common.js
// ---------------------------------------------------
// Funções utilitárias compartilhadas.
// ---------------------------------------------------

import {
  db,
  collection,
  addDoc,
  serverTimestamp,
  doc,
  runTransaction
} from "./firebase-config.js";

/**
 * Cria um log na coleção "logs".
 * Campos:
 *  - type: string (ex: CREATE_CHAMADO, UPDATE_STATUS, DELETE_CHAMADO)
 *  - chamadoId: ID do documento ou protocolo
 *  - actorType: "USUARIO" | "ADM"
 *  - details: descrição textual da ação
 */
export async function criarLog({ type, chamadoId = null, actorType, details }) {
  const log = {
    type,
    chamadoId,
    actorType,
    details,
    createdAt: serverTimestamp()
  };

  console.log("[LOG]", log);

  try {
    await addDoc(collection(db, "logs"), log);
  } catch (err) {
    console.error("Erro ao salvar log no Firestore:", err);
  }
}

/**
 * Cria um comentário na coleção "comentarios".
 * Usado para:
 *  - Registrar mudança de status
 *  - Mensagens ADM/Usuário
 *  - Motivos de finalização/cancelamento
 *
 * Estrutura sugerida da collection "comentarios":
 *  - chamadoId: ID do doc na coleção "chamados"
 *  - protocolo: protocolo legível (CH-AAAA-XXXX)
 *  - autorTipo: "ADM" | "USUARIO"
 *  - origem: string curta ("STATUS_CHANGE", "CANCELAMENTO_USUARIO", etc.)
 *  - mensagem: texto do comentário
 *  - createdAt: serverTimestamp()
 *  - lidoPeloUsuario: bool (false quando ADM comenta algo novo)
 *  - lidoPeloAdm: bool (false quando USUARIO comenta algo novo)
 */
export async function criarComentario({
  chamadoFirestoreId,
  protocolo,
  actorType,
  mensagem,
  origem = "MANUAL"
}) {
  if (!chamadoFirestoreId || !mensagem) return;

  const isAdm = actorType === "ADM";

  const comentario = {
    chamadoId: chamadoFirestoreId,
    protocolo: protocolo || null,
    autorTipo: actorType,
    origem,
    mensagem,
    createdAt: serverTimestamp(),
    lidoPeloUsuario: isAdm ? false : true,
    lidoPeloAdm: isAdm ? true : false
  };

  console.log("[COMENTARIO]", comentario);

  try {
    await addDoc(collection(db, "comentarios"), comentario);
  } catch (err) {
    console.error("Erro ao salvar comentário no Firestore:", err);
  }
}

/**
 * Converte um Firestore Timestamp ou Date para string dd/mm/aaaa hh:mm
 */
export function formatarDataHora(ts) {
  if (!ts) return "-";
  const date = ts.toDate ? ts.toDate() : ts;
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const y = date.getFullYear();
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${d}/${m}/${y} ${hh}:${mm}`;
}

/**
 * Retorna string tipo "Aberto há 2h 35min" ou "Aberto há 3 dias".
 */
export function calcularTempoAbertura(ts) {
  if (!ts) return "-";
  const start = ts.toDate ? ts.toDate() : ts;
  const diffMs = Date.now() - start.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHoras = Math.floor(diffMin / 60);
  const diffDias = Math.floor(diffHoras / 24);

  if (diffDias > 0) {
    return `Aberto há ${diffDias} dia${diffDias > 1 ? "s" : ""}`;
  }
  if (diffHoras > 0) {
    const restMin = diffMin % 60;
    return `Aberto há ${diffHoras}h ${restMin}min`;
  }
  return `Aberto há ${diffMin}min`;
}

/**
 * Gera um ID de protocolo legível:
 *   CH-AAAA-XXXX
 *
 * Compatível com o contador antigo:
 *  - Se existir config/contadorChamados-AAAA → usa esse (novo padrão por ano)
 *  - Se NÃO existir, tenta ler config/contadorChamados (padrão antigo)
 *      - Se existir, começa a partir dele (valor+1) e grava no doc novo do ano
 *      - Se não existir nada, começa em 1
 */
export async function gerarProtocolo() {
  const ano = new Date().getFullYear();
  const docIdAno = `contadorChamados-${ano}`;

  const contadorAnoRef = doc(db, "config", docIdAno);
  const contadorAntigoRef = doc(db, "config", "contadorChamados");

  const novoNumero = await runTransaction(db, async (transaction) => {
    const contadorAnoDoc = await transaction.get(contadorAnoRef);

    // Caso 1: já existe contador do ano atual → segue a vida
    if (contadorAnoDoc.exists()) {
      const data = contadorAnoDoc.data() || {};
      const valorAtual = data.valor || 0;
      const novoValor = valorAtual + 1;

      transaction.update(contadorAnoRef, {
        ano,
        valor: novoValor
      });
      return novoValor;
    }

    // Caso 2: ainda não existe contador do ano atual
    // Tentamos reaproveitar o contador antigo (sem ano) se existir
    const contadorAntigoDoc = await transaction.get(contadorAntigoRef);

    if (contadorAntigoDoc.exists()) {
      const dataAntiga = contadorAntigoDoc.data() || {};
      const valorAntigo = dataAntiga.valor || 0;
      const novoValor = valorAntigo + 1;

      // Criamos o doc do ano atual já começando do último valor antigo + 1
      transaction.set(contadorAnoRef, { ano, valor: novoValor });

      // Opcional: também atualiza o contador antigo para não voltar pra trás
      transaction.update(contadorAntigoRef, { valor: novoValor });

      return novoValor;
    }

    // Caso 3: não existe nem contador antigo nem do ano → primeiro chamado de todos
    transaction.set(contadorAnoRef, { ano, valor: 1 });
    return 1;
  });

  const sequencial = String(novoNumero).padStart(4, "0");
  return `CH-${ano}-${sequencial}`;
}


/**
 * Define classe CSS de status para o elemento (pill).
 * Gera nomes de classe sem espaços, ex:
 *  "Em Espera"      -> status-em-espera
 *  "Em Atendimento" -> status-em-atendimento
 */
export function aplicarClasseStatus(element, status) {
  element.className = "status-pill";
  if (!status) return;

  const classSuffix = status
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .toLowerCase()
    .replace(/\s+/g, "-"); // troca espaços por "-"

  element.classList.add(`status-${classSuffix}`);
}

/**
 * Limite de tamanho para o anexo em bytes (~700KB).
 */
export const LIMITE_ANEXO_BYTES = 700 * 1024;

/**
 * Converte arquivo para base64, retornando objeto com dados.
 * Usado para salvar o anexo diretamente no Firestore.
 */
export function converterArquivoParaBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = function (e) {
      resolve(e.target.result); // base64 (data URL)
    };
    reader.onerror = function (err) {
      reject(err);
    };
    reader.readAsDataURL(file);
  });
}
