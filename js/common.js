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
 * Helpers internos para cálculo de tempo útil (SLA)
 * - Considera apenas dias úteis (segunda a sexta)
 * - Apenas janela 09:00 às 18:00
 * - Se aberto em fim de semana, começa a contar apenas na segunda às 09h
 * - Se aberto fora do horário comercial, começa no próximo dia útil às 09h
 */

// Retorna se é sábado (6) ou domingo (0)
function ehFinalDeSemana(date) {
  const dia = date.getDay();
  return dia === 0 || dia === 6;
}

// Avança para o próximo dia útil às 09:00
function proximoDiaUtilAs9(date) {
  const d = new Date(date);
  d.setSeconds(0, 0);

  let dia = d.getDay(); // 0=Dom, 6=Sab

  if (dia === 6) {
    // Sábado -> segunda
    d.setDate(d.getDate() + 2);
    d.setHours(9, 0, 0, 0);
  } else if (dia === 0) {
    // Domingo -> segunda
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
  } else {
    // Dia útil
    if (d.getHours() < 9) {
      d.setHours(9, 0, 0, 0);
    } else if (d.getHours() >= 18) {
      // Vai para o próximo dia útil às 9h
      let add = 1;
      if (dia === 5) {
        // sexta -> segunda
        add = 3;
      }
      d.setDate(d.getDate() + add);
      d.setHours(9, 0, 0, 0);
    }
  }

  return d;
}

/**
 * Calcula a quantidade de minutos úteis (09h–18h, dias úteis)
 * entre duas datas.
 */
function calcularMinutosUteisEntre(startDate, endDate) {
  if (endDate <= startDate) return 0;

  let totalMin = 0;
  let atual = new Date(startDate);

  while (atual < endDate) {
    // Se final de semana, pula direto pro próximo dia útil às 9h
    if (ehFinalDeSemana(atual)) {
      atual = proximoDiaUtilAs9(atual);
      continue;
    }

    // Define janela do dia atual [09:00, 18:00]
    const inicioDia = new Date(atual);
    inicioDia.setHours(9, 0, 0, 0);

    const fimDia = new Date(atual);
    fimDia.setHours(18, 0, 0, 0);

    // Se ainda não chegou em 09h, ajusta
    if (atual < inicioDia) {
      atual = new Date(inicioDia);
    }

    // Se já passou das 18h, pula para próximo dia útil
    if (atual >= fimDia) {
      atual = proximoDiaUtilAs9(atual);
      continue;
    }

    // Janela efetiva deste dia: [atual, fimDia] limitado ao endDate
    const limite = endDate < fimDia ? endDate : fimDia;
    const diffMs = limite.getTime() - atual.getTime();
    if (diffMs > 0) {
      totalMin += Math.floor(diffMs / 60000);
    }

    // Avança para próximo dia útil
    atual = proximoDiaUtilAs9(fimDia);
  }

  return totalMin;
}

/**
 * Retorna string tipo:
 *  - "Aberto há 2 dias"
 *  - "Aberto há 3h 15min"
 *  - "Aberto há 10min"
 *
 * Usando apenas tempo útil (segunda–sexta, 09h–18h).
 */
export function calcularTempoAbertura(ts) {
  if (!ts) return "-";

  const created = ts.toDate ? ts.toDate() : ts;
  const agora = new Date();

  // Ponto inicial do SLA ajustado
  const inicioSla = proximoDiaUtilAs9(created);

  if (agora <= inicioSla) {
    return "Aberto há 0min (aguardando início do SLA)";
  }

  const minutosUteis = calcularMinutosUteisEntre(inicioSla, agora);
  if (minutosUteis <= 0) {
    return "Aberto há 0min";
  }

  const horas = Math.floor(minutosUteis / 60);
  const dias = Math.floor(horas / 9); // 9h de janela por dia útil
  const restoHoras = horas % 9;
  const restoMin = minutosUteis % 60;

  if (dias > 0) {
    return `Aberto há ${dias} dia${dias > 1 ? "s" : ""}`;
  }

  if (horas > 0) {
    return `Aberto há ${horas}h ${restoMin}min`;
  }

  return `Aberto há ${minutosUteis}min`;
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
 *  "Verificando com a GTI" -> status-verificando-com-a-gti
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

/**
 * LOADING GLOBAL
 * - Usa o elemento #globalLoading presente em TODAS as páginas.
 * - Aparece sobre a tela inteira e bloqueia cliques.
 */
export function mostrarLoading() {
  const overlay = document.getElementById("globalLoading");
  if (!overlay) return;
  overlay.classList.remove("hidden");
  overlay.classList.add("active");
}

export function ocultarLoading() {
  const overlay = document.getElementById("globalLoading");
  if (!overlay) return;
  overlay.classList.remove("active");
  // pequeno delay para animação, opcional
  setTimeout(() => {
    overlay.classList.add("hidden");
  }, 180);
}
