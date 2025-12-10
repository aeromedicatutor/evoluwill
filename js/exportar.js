import { db, collection, getDocs } from "./firebase-config.js";

function formatarData(timestamp) {
  if (!timestamp || !timestamp.toDate) return null;
  const d = timestamp.toDate();
  // Fica tipo: 08/12/2025 09:37:56
  return d.toLocaleString("pt-BR");
}

async function exportarChamadosCSV() {
  const COL = "chamados";

  console.log("Buscando chamados...");
  const snap = await getDocs(collection(db, COL));

  if (snap.empty) {
    alert("Nenhum chamado encontrado!");
    return;
  }

  // Monta os registros já no formato desejado
  const registros = snap.docs.map(doc => {
    const data = doc.data();

    return {
      id: doc.id,
      protocolo: data.protocolo ?? "",
      assunto: data.assunto ?? "",
      nome: data.nome ?? "",
      categoria: data.categoria ?? "",
      urgencia: data.urgencia ?? "",
      status: data.status ?? "",
      createdAt: formatarData(data.createdAt),
      updatedAt: formatarData(data.updatedAt),
      telefone: data.telefone ?? null,   // se não tiver, fica null
      descricao: data.descricao ?? ""
    };
  });

  // Define as colunas em ordem + rótulo do cabeçalho
  const colunas = [
    { key: "id",         label: "ID" },
    { key: "protocolo",  label: "Protocolo" },
    { key: "assunto",    label: "Assunto" },
    { key: "nome",       label: "Nome" },
    { key: "categoria",  label: "Categoria" },
    { key: "urgencia",   label: "Urgência" },
    { key: "status",     label: "Status" },
    { key: "createdAt",  label: "Criado em" },
    { key: "updatedAt",  label: "Atualizado em" },
    { key: "telefone",   label: "Telefone" },
    { key: "descricao",  label: "Descrição" }
  ];

  // Cabeçalho
  const linhas = [
    colunas.map(c => c.label).join(",")
  ];

  // Linhas de dados
  for (const reg of registros) {
    const linha = colunas
      .map(col => {
        const valor = reg[col.key];

        // deixa null explícito se não tiver telefone
        if (valor === null) return "null";

        // JSON.stringify cuida de aspas, vírgulas etc.
        return JSON.stringify(valor ?? "");
      })
      .join(",");
    linhas.push(linha);
  }

  const csv = linhas.join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "relatorio_chamados.csv";
  a.click();
  URL.revokeObjectURL(url);

  alert(`Exportados ${registros.length} chamados!`);
  console.log("CSV gerado com sucesso!");
}

// Vincula ao botão do admin.html
document
  .getElementById("btnExportar")
  .addEventListener("click", exportarChamadosCSV);
