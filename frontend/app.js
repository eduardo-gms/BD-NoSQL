// SOS Abrigos - interface web (Integrante 6)
// Consome a API FastAPI dos módulos 1, 2 e 3 (relatórios / Data Analyst).

// Configuração da API
const DEFAULT_API =
  location.protocol.startsWith("http") && location.pathname.startsWith("/app")
    ? location.origin // servido pelo próprio FastAPI em /app
    : "http://localhost:8000";

let API = localStorage.getItem("apiUrl") || DEFAULT_API;

const state = {
  abrigos: [],
  pessoas: [],      // todas (para o painel)
  pessoasView: [],  // filtradas (aba Pessoas)
  doacoes: [],
  mantimentos: [],
  escassez: [],
  relatorios: {
    medicas: [],
    escassez: [],
    ocupacao: [],
    triagem: null,
  },
  highlight: null,
  view: "painel",
  logCount: 0,
};

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

// Utilidades
function esc(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function jsonHTML(obj) {
  const s = esc(JSON.stringify(obj, null, 2));
  return s.replace(
    /(&quot;(?:\\.|[^&]|&(?!quot;))*?&quot;)(\s*:)?|\b(true|false)\b|\bnull\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
    (m, str, colon, bool, num) => {
      if (str) return colon ? `<span class="j-key">${str}</span>${colon}` : `<span class="j-str">${str}</span>`;
      if (bool) return `<span class="j-bool">${m}</span>`;
      if (num) return `<span class="j-num">${m}</span>`;
      return `<span class="j-null">${m}</span>`;
    }
  );
}

function fmtDate(v) {
  if (!v) return "—";
  const d = new Date(v);
  if (isNaN(d)) return esc(v);
  return d.toLocaleDateString("pt-BR") + (String(v).length > 10 ? " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "");
}

function nomePessoa(p) {
  return p.nome || p.nome_completo || p.nome_conhecido || (p.foto ? "Sem nome (identificada por foto)" : "Sem identificação");
}

function nomeAbrigo(id) {
  if (!id) return null;
  const a = state.abrigos.find((x) => x.id === id);
  return a ? a.nome : `Abrigo ${id.slice(-6)}`;
}

function capacidade(a) {
  return a.capacidade_maxima ?? a.capacidade_estimada ?? null;
}

function qtdDoacao(d) {
  const q = d.quantidade ?? d.quantidade_exata ?? d.quantidade_estimada;
  if (q == null) return "—";
  const tipo = d.quantidade != null ? "" : d.quantidade_exata != null ? " (exata)" : " (estimada)";
  return `${q}${d.unidade ? " " + esc(d.unidade) : ""}<span class="muted small">${tipo}</span>`;
}

function fieldsChips(doc) {
  return `<div class="tags fields-chips">${Object.keys(doc)
    .filter((k) => k !== "id")
    .map((k) => `<span class="tag">${esc(k)}</span>`)
    .join("")}</div>`;
}

function abrigoOptions(selected = "", { incluirVazio = true, vazioLabel = "Nenhum", excluir = null } = {}) {
  const escassos = new Set(state.escassez.map((e) => e.abrigo.id));
  return (
    (incluirVazio ? `<option value="">${vazioLabel}</option>` : "") +
    state.abrigos
      .filter((a) => a.id !== excluir)
      .map((a) => `<option value="${a.id}" ${a.id === selected ? "selected" : ""}>${esc(a.nome)}${escassos.has(a.id) ? " (em escassez)" : ""}</option>`)
      .join("")
  );
}

function parseExtras(txt) {
  txt = (txt || "").trim();
  if (!txt) return {};
  const obj = JSON.parse(txt); // lança erro se inválido
  if (typeof obj !== "object" || Array.isArray(obj)) throw new Error("Campos extras devem ser um objeto JSON { }");
  return obj;
}

function compact(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === "" || v == null || (Array.isArray(v) && !v.length)) continue;
    out[k] = v;
  }
  return out;
}

// Toasts
function toast(msg, type = "success") {
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.innerHTML = msg;
  $("#toasts").appendChild(el);
  setTimeout(() => { el.classList.add("hide"); setTimeout(() => el.remove(), 300); }, type === "error" ? 6000 : 3500);
}

// Cliente HTTP + console de requisições
function errorMessage(data, status) {
  const d = data?.detail ?? data;
  if (Array.isArray(d)) return d.map((e) => `${(e.loc || []).slice(1).join(".") || "body"}: ${e.msg}`).join("<br>");
  if (typeof d === "string") return d;
  return `Erro HTTP ${status}`;
}

async function api(method, path, body, { log = true } = {}) {
  const t0 = performance.now();
  let res, data;
  try {
    res = await fetch(API + path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  } catch (e) {
    if (log) addLog(method, path, body, "ERR", { erro: "Falha de rede. A API está rodando?" }, performance.now() - t0);
    setOnline(false);
    throw new Error("Não foi possível conectar à API em " + esc(API));
  }
  if (log) addLog(method, path, body, res.status, data, performance.now() - t0);
  if (!res.ok) {
    const err = new Error(errorMessage(data, res.status));
    err.status = res.status;
    throw err;
  }
  return data;
}

function addLog(method, path, body, status, data, ms) {
  state.logCount++;
  const badge = $("#badge-console");
  badge.textContent = state.logCount;
  badge.dataset.zero = "0";
  const ok = typeof status === "number" && status < 400;
  const li = document.createElement("li");
  li.innerHTML = `
    <details class="log">
      <summary>
        <span class="method m-${method}">${method}</span>
        <span class="path" title="${esc(path)}">${esc(path)}</span>
        <span class="status ${ok ? "ok" : "err"}">${status}</span>
        <span class="ms">${Math.round(ms)}ms</span>
      </summary>
      ${body ? `<div class="muted small" style="padding:0 10px 4px">Corpo enviado:</div><pre class="json">${jsonHTML(body)}</pre>` : ""}
      <div class="muted small" style="padding:0 10px 4px">Resposta:</div>
      <pre class="json">${jsonHTML(Array.isArray(data) && data.length > 5 ? [...data.slice(0, 5), `… +${data.length - 5} documentos`] : data)}</pre>
    </details>`;
  $("#console-list").prepend(li);
}

// Status de conexão
function setOnline(on, texto) {
  const el = $("#api-status");
  el.classList.toggle("online", on);
  el.classList.toggle("offline", !on);
  $("span", el).textContent = texto || (on ? "Conectado" : "API fora do ar");
}

async function checkHealth() {
  try {
    const h = await api("GET", "/health", null, { log: false });
    setOnline(true, `Banco conectado (${h.banco})`);
    return true;
  } catch (err) {
    // 503 = a API respondeu, mas não conseguiu falar com o MongoDB
    setOnline(false, err.status === 503 ? "Sem conexão com o banco" : "API fora do ar");
    return false;
  }
}

// Modal
function openModal(title, html, onMount) {
  $("#modal-title").textContent = title;
  $("#modal-body").innerHTML = html;
  $("#modal-backdrop").classList.add("open");
  onMount?.($("#modal-body"));
  setTimeout(() => $("#modal-body input, #modal-body select, #modal-body textarea")?.focus(), 60);
}
function closeModal() { $("#modal-backdrop").classList.remove("open"); }

function showJSON(title, doc) {
  openModal(title, `
    <div class="hint">Documento exatamente como está armazenado no MongoDB (o <code>_id</code> é convertido para <code>id</code> pela API).</div>
    ${fieldsChips(doc)}
    <pre class="json">${jsonHTML(doc)}</pre>`);
}

/** Envolve submit de formulário com tratamento de erro padrão. */
function bindForm(form, handler) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("button[type=submit]", form);
    btn.disabled = true;
    try {
      await handler(new FormData(form));
    } catch (err) {
      toast(`<strong>Erro${err.status ? " " + err.status : ""}:</strong><br>${err.message}`, "error");
    } finally {
      btn.disabled = false;
    }
  });
}

// ---------- Navegação ----------
const VIEWS = {
  painel: ["Painel geral", "Resumo da operação"],
  pessoas: ["Pessoas resgatadas", "Cadastro e vínculo com abrigos"],
  abrigos: ["Abrigos", "Status, lotação e necessidades"],
  doacoes: ["Doações", "Itens recebidos"],
  mantimentos: ["Mantimentos", "Estoque por abrigo"],
  escassez: ["Escassez", "Abrigos que precisam de reposição"],
  relatorios: ["Relatório", "Indicadores para a operação"],
};

function go(view) {
  state.view = view;
  $$(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
  $$(".view").forEach((v) => v.classList.toggle("active", v.id === "view-" + view));
  $("#view-title").textContent = VIEWS[view][0];
  $("#view-subtitle").textContent = VIEWS[view][1];
}

// ---------- Carregamento de dados ----------
async function loadAll() {
  const online = await checkHealth();
  if (!online) {
    renderOffline();
    toast(`Não foi possível carregar os dados de <code>${esc(API)}</code>. Verifique se a API está rodando e se o banco está acessível.`, "error");
    return;
  }
  const [abrigos, pessoas, doacoes, mantimentos, escassez] = await Promise.allSettled([
    api("GET", "/abrigos/"),
    api("GET", "/pessoas/"),
    api("GET", "/doacoes/"),
    api("GET", "/mantimentos/"),
    api("GET", "/mantimentos/abrigos-escassez"),
  ]);
  state.abrigos = abrigos.value || [];
  state.pessoas = pessoas.value || [];
  state.doacoes = doacoes.value || [];
  state.mantimentos = mantimentos.value || [];
  state.escassez = escassez.value || [];
  if (abrigos.status === "rejected") toast("Falha ao listar abrigos: " + abrigos.reason.message, "error");

  fillAbrigoSelects();
  await loadPessoas();
  await loadRelatorios();
  renderAll();
}

async function loadRelatorios() {
  const [medicas, escassez, ocupacao, triagem] = await Promise.allSettled([
    api("GET", "/relatorios/necessidades-medicas"),
    api("GET", "/relatorios/escassez-suprimentos"),
    api("GET", "/relatorios/ocupacao-abrigos"),
    api("GET", "/relatorios/triagem-cadastros"),
  ]);
  state.relatorios.medicas = medicas.status === "fulfilled" ? medicas.value || [] : [];
  state.relatorios.escassez = escassez.status === "fulfilled" ? escassez.value || [] : [];
  state.relatorios.ocupacao = ocupacao.status === "fulfilled" ? ocupacao.value || [] : [];
  state.relatorios.triagem = triagem.status === "fulfilled" ? triagem.value || null : null;
  const falhas = [
    ["necessidades médicas", medicas],
    ["escassez", escassez],
    ["ocupação", ocupacao],
    ["triagem", triagem],
  ].filter(([, r]) => r.status === "rejected");
  if (falhas.length) {
    toast("Falha em relatório(s): " + falhas.map(([n, r]) => `${n} (${r.reason.message})`).join("; "), "error");
  }
}

async function reload(kind) {
  // Recarrega coleções afetadas e re-renderiza tudo (dados interligados)
  const tasks = [];
  if (kind.includes("abrigos")) tasks.push(api("GET", "/abrigos/").then((d) => (state.abrigos = d)));
  if (kind.includes("pessoas")) tasks.push(api("GET", "/pessoas/").then((d) => (state.pessoas = d)));
  if (kind.includes("doacoes")) tasks.push(loadDoacoes());
  if (kind.includes("mantimentos")) tasks.push(loadMantimentos());
  tasks.push(api("GET", "/mantimentos/abrigos-escassez").then((d) => (state.escassez = d)));
  await Promise.allSettled(tasks);
  if (kind.includes("pessoas") || kind.includes("abrigos")) await loadPessoas();
  fillAbrigoSelects();
  renderAll();
}

async function loadPessoas() {
  const f = $("#pessoas-filtro").value;
  state.pessoasView = f ? await api("GET", `/pessoas/?abrigo_atual=${encodeURIComponent(f)}`) : state.pessoas;
}

async function loadDoacoes() {
  const qs = new URLSearchParams(compact({
    item: $("#doacoes-item").value.trim(),
    doador: $("#doacoes-doador").value.trim(),
    categoria: $("#doacoes-categoria").value.trim(),
  }));
  state.doacoes = await api("GET", `/doacoes/${qs.toString() ? "?" + qs : ""}`);
}

async function loadMantimentos() {
  const qs = new URLSearchParams(compact({
    abrigo_id: $("#mant-abrigo").value,
    item: $("#mant-item").value.trim(),
    estoque_baixo: $("#mant-baixo").checked ? "true" : "",
  }));
  state.mantimentos = await api("GET", `/mantimentos/${qs.toString() ? "?" + qs : ""}`);
}

function fillAbrigoSelects() {
  const pf = $("#pessoas-filtro");
  const pv = pf.value;
  pf.innerHTML = `<option value="">Todas as pessoas</option><option value="null">Sem abrigo</option>` +
    state.abrigos.map((a) => `<option value="${a.id}">${esc(a.nome)}</option>`).join("");
  pf.value = pv;

  const ma = $("#mant-abrigo");
  const mv = ma.value;
  ma.innerHTML = abrigoOptions(mv, { vazioLabel: "Todos os abrigos" });
  ma.value = mv;

  const af = $("#abrigos-filtro");
  const av = af.value;
  const statuses = [...new Set(state.abrigos.map((a) => a.status).filter(Boolean))];
  af.innerHTML = `<option value="">Todos os status</option><option value="__sem">Sem status</option>` +
    statuses.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join("");
  af.value = av;
}

function renderAll() {
  renderPainel();
  renderPessoas();
  renderAbrigos();
  renderDoacoes();
  renderMantimentos();
  renderEscassez();
  renderRelatorios();
  const b = $("#badge-escassez");
  b.textContent = state.escassez.length;
  b.dataset.zero = state.escassez.length ? "0" : "1";
}

function renderOffline() {
  const msg = `<div class="empty">Sem resposta de <code>${esc(API)}</code>.<br><br>
    Inicie o backend com <code>uvicorn backend.main:app --reload</code> e clique em <b>Atualizar</b>.</div>`;
  ["#stats", "#pessoas-list", "#abrigos-list", "#mant-list", "#escassez-list", "#relatorios-stats", "#rel-ocupacao", "#rel-triagem"].forEach((s) => ($(s).innerHTML = msg));
  $("#doacoes-list").innerHTML = `<tr><td colspan="8">${msg}</td></tr>`;
  $("#rel-medicas").innerHTML = `<tr><td colspan="3">${msg}</td></tr>`;
  $("#rel-escassez").innerHTML = `<tr><td colspan="2">${msg}</td></tr>`;
  $("#ocupacao-list").innerHTML = "";
  $("#schema-profiles").innerHTML = "";
}

function empty(text) {
  return `<div class="empty">${text}</div>`;
}

function markNew(container) {
  if (!state.highlight) return;
  const el = $(`[data-id="${state.highlight}"]`, container);
  if (el) {
    el.classList.add("new");
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => el.classList.remove("new"), 4000);
  }
}

// ---------- Painel ----------
function renderPainel() {
  const semAbrigo = state.pessoas.filter((p) => !p.abrigo_atual).length;
  const baixo = state.mantimentos.filter((m) => m.quantidade_minima != null && m.quantidade < m.quantidade_minima).length;
  const stats = [
    [state.pessoas.length, "Pessoas resgatadas", "var(--blue)", "pessoas"],
    [semAbrigo, "Sem abrigo", "var(--amber)", "pessoas"],
    [state.abrigos.length, "Abrigos", "var(--green)", "abrigos"],
    [state.doacoes.length, "Doações", "var(--primary)", "doacoes"],
    [state.mantimentos.length, `Itens em estoque${baixo ? ` (${baixo} baixo)` : ""}`, "var(--muted)", "mantimentos"],
    [state.escassez.length, "Abrigos em escassez", "var(--red)", "escassez"],
  ];
  $("#stats").innerHTML = stats.map(([v, l, c, view]) => `
    <div class="stat" style="--c:${c}" data-go="${view}">
      <div class="value">${v}</div><div class="label">${l}</div>
    </div>`).join("");
  $$("#stats .stat").forEach((s) => s.addEventListener("click", () => {
    if (s.dataset.go === "pessoas" && s.querySelector(".label").textContent === "Sem abrigo") {
      $("#pessoas-filtro").value = "null";
      loadPessoas().then(renderPessoas);
    }
    go(s.dataset.go);
  }));

  // Ocupação
  const comCap = state.abrigos
    .map((a) => ({ a, cap: capacidade(a), oc: a.ocupacao_atual || 0 }))
    .filter((x) => x.cap)
    .sort((x, y) => y.oc / y.cap - x.oc / x.cap);
  $("#ocupacao-legend").textContent = `${comCap.length} abrigos com capacidade informada`;
  $("#ocupacao-list").innerHTML = comCap.length ? comCap.map(({ a, cap, oc }) => {
    const pct = Math.round((oc / cap) * 100);
    const cls = pct >= 100 ? "full" : pct >= 75 ? "warn" : "";
    return `<div class="ocupacao-row">
      <div class="top"><span>${esc(a.nome)} ${a.status ? `<span class="tag ${statusClass(a.status)}">${esc(a.status)}</span>` : ""}</span>
      <span>${oc}/${cap}${a.capacidade_maxima == null ? " (estim.)" : ""}, ${pct}%</span></div>
      <div class="bar ${cls}"><i style="width:${Math.min(pct, 100)}%"></i></div></div>`;
  }).join("") : empty("Nenhum abrigo com capacidade cadastrada.");

  // Perfis de schema (heterogeneidade)
  const perfis = (docs, label) => {
    const map = new Map();
    docs.forEach((d) => {
      const k = Object.keys(d).filter((x) => x !== "id").sort().join(",");
      map.set(k, (map.get(k) || 0) + 1);
    });
    return { label, total: docs.length, perfis: [...map.entries()].sort((a, b) => b[1] - a[1]) };
  };
  const grupos = [perfis(state.pessoas, "Pessoas"), perfis(state.abrigos, "Abrigos"), perfis(state.doacoes, "Doações")];
  $("#schema-profiles").innerHTML = grupos.map((g) => `
    <div class="profile">
      <div class="profile-head"><strong>${g.label}</strong><span class="tag blue">${g.perfis.length} formatos / ${g.total} docs</span></div>
      ${g.perfis.slice(0, 3).map(([keys, n]) => `
        <div style="margin:6px 0"><span class="muted small">${n}x </span>
        <span class="tags fields-chips" style="display:inline-flex">${keys.split(",").filter(Boolean).map((k) => `<span class="tag">${esc(k)}</span>`).join("")}</span></div>`).join("")}
    </div>`).join("");
}

function statusClass(s) {
  s = (s || "").toLowerCase();
  if (s.includes("super") || s.includes("lotado")) return "red";
  if (s.includes("fechado")) return "";
  if (s.includes("aberto")) return "green";
  return "amber";
}

// ---------- Pessoas ----------
function renderPessoas() {
  const q = $("#pessoas-busca").value.trim().toLowerCase();
  const list = state.pessoasView.filter((p) => !q || JSON.stringify(p).toLowerCase().includes(q));
  $("#pessoas-count").textContent = `${list.length} pessoa(s) exibida(s)`;
  $("#pessoas-list").innerHTML = list.length ? list.map((p) => {
    const abrigo = nomeAbrigo(p.abrigo_atual);
    const meds = p.condicoes_saude?.medicacao_continua;
    return `<article class="item" data-id="${p.id}">
      <div class="item-head">
        <div>
          <div class="item-title">${esc(nomePessoa(p))}</div>
          <div class="item-sub">${p.nome_conhecido && !p.nome_completo ? "Nome conhecido (apelido)" : p.idade ? `${p.idade} anos` : ""}</div>
        </div>
        ${abrigo ? `<span class="tag green">Abrigada</span>` : `<span class="tag amber">Sem abrigo</span>`}
      </div>
      <dl class="kv">
        ${abrigo ? `<dt>Abrigo</dt><dd>${esc(abrigo)}</dd>` : ""}
        ${p.local_resgate ? `<dt>Resgate</dt><dd>${esc(p.local_resgate)}</dd>` : ""}
        ${p.data_resgate ? `<dt>Data</dt><dd>${fmtDate(p.data_resgate)}</dd>` : ""}
        ${p.tipo_sanguineo ? `<dt>Sangue</dt><dd><span class="tag red">${esc(p.tipo_sanguineo)}</span></dd>` : ""}
        ${p.cpf ? `<dt>CPF</dt><dd>${esc(p.cpf)}</dd>` : ""}
        ${meds ? `<dt>Medicação</dt><dd>${meds.map((m) => `<span class="tag blue">${esc(m)}</span>`).join(" ")}</dd>` : ""}
        ${p.contatos_emergencia?.length ? `<dt>Contato</dt><dd>${esc(p.contatos_emergencia[0].nome)}, ${esc(p.contatos_emergencia[0].telefone || "")}</dd>` : ""}
      </dl>
      ${fieldsChips(p)}
      <div class="item-actions">
        <button class="btn btn-teal btn-sm" data-act="vincular">${abrigo ? "Transferir" : "Vincular a abrigo"}</button>
        ${abrigo ? `<button class="btn btn-sm" data-act="desvincular">Desvincular</button>` : ""}
        <button class="btn btn-sm" data-act="editar">Editar</button>
        <button class="btn btn-sm" data-act="json">JSON</button>
      </div>
      <span class="id-chip" data-copy="${p.id}" title="Copiar ID">#${p.id}</span>
    </article>`;
  }).join("") : empty("Nenhuma pessoa encontrada.");
  markNew($("#pessoas-list"));
}

const PESSOA_PRESETS = {
  rapido: { nome_conhecido: "Seu Zé", local_resgate: "Rua das Flores, 120 (telhado)" },
  completo: {
    nome_completo: "Maria Aparecida dos Santos", idade: 67, cpf: "12345678900", tipo_sanguineo: "O-",
    local_resgate: "Bairro Sarandi, resgate de barco", medicacao: "Insulina, Losartana",
    contato_nome: "João dos Santos (filho)", contato_tel: "(51) 99999-0000",
  },
  foto: { foto: "https://exemplo.org/fotos/crianca-01.jpg", local_resgate: "Ginásio, encontrada sozinha", extras: [["idade_aparente", "5 a 7 anos"], ["roupa", "camiseta azul"]] },
  invalido: { local_resgate: "Sem identificação nenhuma" },
};

// campos que o formulário de pessoa já trata; o resto aparece em "Outras informações"
const PESSOA_CAMPOS_FORM = ["id", "abrigo_atual", "nome_conhecido", "nome_completo", "foto", "idade", "cpf",
  "tipo_sanguineo", "data_resgate", "local_resgate", "condicoes_saude", "contatos_emergencia"];

function paraDataInput(v) {
  const m = String(v || "").match(/^\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : "";
}

// converte o texto digitado de volta para o tipo que o campo tinha
function valorExtra(row, texto) {
  texto = texto.trim();
  if (row.tipo === "lista") return texto.split(",").map((x) => x.trim()).filter(Boolean);
  if (row.tipo === "numero" || (!row.original && /^-?\d+([.,]\d+)?$/.test(texto))) {
    const n = Number(texto.replace(",", "."));
    return isNaN(n) ? texto : n;
  }
  return texto;
}

// p = null cadastra; com p, edita a pessoa existente
function formPessoa(p = null) {
  const novo = !p;
  p = p || {};
  const contato = p.contatos_emergencia?.[0] || {};
  const extras = Object.entries(p)
    .filter(([k]) => !PESSOA_CAMPOS_FORM.includes(k))
    .map(([chave, v]) => {
      const tipo = typeof v === "number" ? "numero"
        : typeof v === "string" ? "texto"
        : Array.isArray(v) && v.every((x) => typeof x !== "object") ? "lista"
        : "outro";
      const texto = tipo === "lista" ? v.join(", ") : tipo === "outro" ? JSON.stringify(v) : String(v);
      return { chave, texto, tipo, original: true, removido: false };
    });
  const val = (k) => esc(p[k] ?? "");

  openModal(novo ? "Cadastrar pessoa resgatada" : `Editar ${nomePessoa(p)}`, `
    ${novo ? `<div class="presets">
      <span class="muted small">Preencher com exemplo:</span>
      <button type="button" class="btn btn-sm" data-preset="rapido">Resgate rápido</button>
      <button type="button" class="btn btn-sm" data-preset="completo">Cadastro completo</button>
      <button type="button" class="btn btn-sm" data-preset="foto">Só foto</button>
      <button type="button" class="btn btn-danger btn-sm" data-preset="invalido">Inválido</button>
    </div>` : ""}
    <div class="hint">É obrigatório informar algum nome (apelido ou nome completo) ou uma foto. Os demais campos são opcionais.${novo ? "" : " Campos apagados são removidos do cadastro."}</div>
    <form id="f-pessoa" class="form-grid" autocomplete="off">
      <div class="field"><label>Nome conhecido / apelido</label><input name="nome_conhecido" value="${val("nome_conhecido")}" /></div>
      <div class="field"><label>Nome completo</label><input name="nome_completo" value="${val("nome_completo")}" /></div>
      <div class="field full"><label>Foto (URL)</label><input name="foto" placeholder="https://" value="${val("foto")}" /></div>
      <div class="field"><label>Idade</label><input name="idade" type="number" min="0" max="130" value="${val("idade")}" /></div>
      <div class="field"><label>CPF</label><input name="cpf" value="${val("cpf")}" /></div>
      <div class="field"><label>Tipo sanguíneo</label><select name="tipo_sanguineo"><option value=""></option>${["A+","A-","B+","B-","AB+","AB-","O+","O-"].map((t) => `<option ${t === p.tipo_sanguineo ? "selected" : ""}>${t}</option>`).join("")}</select></div>
      <div class="field"><label>Data do resgate</label><input name="data_resgate" type="date" value="${paraDataInput(p.data_resgate)}" /></div>
      <div class="field full"><label>Local do resgate</label><input name="local_resgate" value="${val("local_resgate")}" /></div>
      <div class="field full"><label>Medicação contínua (separar por vírgula)</label><input name="medicacao" value="${esc((p.condicoes_saude?.medicacao_continua || []).join(", "))}" /></div>
      <div class="field"><label>Contato de emergência</label><input name="contato_nome" placeholder="Nome" value="${esc(contato.nome || "")}" /></div>
      <div class="field"><label>Telefone do contato</label><input name="contato_tel" value="${esc(contato.telefone || "")}" /></div>
      ${novo
        ? `<div class="field full"><label>Abrigo</label><select name="abrigo_atual">${abrigoOptions()}</select></div>`
        : `<p class="muted small" style="grid-column: 1 / -1">Abrigo: <b>${esc(nomeAbrigo(p.abrigo_atual) || "nenhum")}</b>. Para mudar, use Vincular ou Transferir no card.</p>`}
      <div class="field full"><label>Outras informações</label>
        <div class="extras" id="extras-lista"></div>
        <div class="extras-add">
          <input class="input" id="extra-chave" placeholder="Campo (ex: alergias)" />
          <input class="input" id="extra-valor" placeholder="Valor" />
          <button type="button" class="btn" id="extra-add">Adicionar</button>
        </div>
      </div>
      <div class="form-actions field full"><button type="button" class="btn" data-close>Cancelar</button><button type="submit" class="btn btn-primary">${novo ? "Cadastrar" : "Salvar"}</button></div>
    </form>`, (root) => {
    const form = $("#f-pessoa", root);
    const lista = $("#extras-lista", root);

    // guarda o que foi digitado antes de redesenhar a lista
    const lerExtras = () => $$("[data-extra]", lista).forEach((inp) => (extras[+inp.dataset.extra].texto = inp.value));
    const desenhar = () => {
      const visiveis = extras.map((r, i) => [r, i]).filter(([r]) => !r.removido);
      lista.innerHTML = visiveis.length ? visiveis.map(([r, i]) => `
        <div class="extra-row">
          <label for="extra-${i}">${esc(r.chave.replace(/_/g, " "))}</label>
          <input class="input" id="extra-${i}" data-extra="${i}" value="${esc(r.texto)}" ${r.tipo === "outro" ? "disabled title='Valor composto, não editável aqui'" : ""} />
          <button type="button" class="btn btn-sm btn-danger" data-rm="${i}" title="Remover campo">Remover</button>
        </div>`).join("") : `<span class="muted small">Nenhuma.</span>`;
    };
    const adicionar = (chave, texto) => {
      chave = chave.trim().toLowerCase().replace(/\s+/g, "_");
      if (!chave || !texto.trim()) return;
      if (PESSOA_CAMPOS_FORM.includes(chave) || extras.some((r) => r.chave === chave && !r.removido)) {
        return toast(`O campo <b>${esc(chave)}</b> já existe no formulário.`, "error");
      }
      lerExtras();
      extras.push({ chave, texto, tipo: "texto", original: false, removido: false });
      desenhar();
    };
    $("#extra-add", root).addEventListener("click", () => {
      adicionar($("#extra-chave", root).value, $("#extra-valor", root).value);
      $("#extra-chave", root).value = $("#extra-valor", root).value = "";
      $("#extra-chave", root).focus();
    });
    $("#extra-valor", root).addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); $("#extra-add", root).click(); } });
    lista.addEventListener("click", (e) => {
      const rm = e.target.closest("[data-rm]");
      if (!rm) return;
      lerExtras();
      const r = extras[+rm.dataset.rm];
      if (r.original) r.removido = true; else extras.splice(+rm.dataset.rm, 1);
      desenhar();
    });
    desenhar();

    $$("[data-preset]", root).forEach((b) => b.addEventListener("click", () => {
      form.reset();
      extras.length = 0;
      const preset = PESSOA_PRESETS[b.dataset.preset];
      Object.entries(preset).forEach(([k, v]) => k !== "extras" && (form.elements[k].value = v));
      (preset.extras || []).forEach(([k, v]) => extras.push({ chave: k, texto: v, tipo: "texto", original: false, removido: false }));
      desenhar();
    }));

    bindForm(form, async (fd) => {
      lerExtras();
      const v = Object.fromEntries(fd);
      const campos = {
        nome_conhecido: v.nome_conhecido.trim(),
        nome_completo: v.nome_completo.trim(),
        foto: v.foto.trim(),
        idade: v.idade !== "" ? +v.idade : "",
        cpf: v.cpf.trim(),
        tipo_sanguineo: v.tipo_sanguineo,
        data_resgate: v.data_resgate,
        local_resgate: v.local_resgate.trim(),
      };
      const meds = v.medicacao.split(",").map((x) => x.trim()).filter(Boolean);
      const contatoNome = v.contato_nome.trim();
      const contatoTel = v.contato_tel.trim();

      if (novo) {
        const payload = compact({ ...campos, abrigo_atual: v.abrigo_atual });
        if (meds.length) payload.condicoes_saude = { medicacao_continua: meds };
        if (contatoNome) payload.contatos_emergencia = [compact({ nome: contatoNome, telefone: contatoTel })];
        extras.forEach((r) => { if (r.texto.trim()) payload[r.chave] = valorExtra(r, r.texto); });
        const criada = await api("POST", "/pessoas/", payload);
        closeModal();
        toast(`<b>${esc(nomePessoa(criada))}</b> cadastrada.`);
        state.highlight = criada.id;
        $("#pessoas-filtro").value = "";
        $("#pessoas-busca").value = "";
        await reload(["pessoas", "abrigos"]);
        go("pessoas");
        return;
      }

      // edição: envia só o que mudou; campo esvaziado vai como null e é removido
      const body = {};
      for (const [k, novoValor] of Object.entries(campos)) {
        const antes = k === "data_resgate" ? paraDataInput(p[k]) : (p[k] ?? "");
        if (String(novoValor) !== String(antes)) body[k] = novoValor === "" ? null : novoValor;
      }

      const medsAntes = p.condicoes_saude?.medicacao_continua || [];
      if (meds.join("|") !== medsAntes.join("|")) {
        const saude = { ...(p.condicoes_saude || {}) };
        if (meds.length) saude.medicacao_continua = meds; else delete saude.medicacao_continua;
        body.condicoes_saude = Object.keys(saude).length ? saude : null;
      }

      if (contatoNome !== (contato.nome || "") || contatoTel !== (contato.telefone || "")) {
        const contatos = [...(p.contatos_emergencia || [])];
        if (contatoNome) {
          const c = { ...(contatos[0] || {}), nome: contatoNome, telefone: contatoTel };
          if (!contatoTel) delete c.telefone;
          contatos[0] = c;
        } else {
          contatos.shift();
        }
        body.contatos_emergencia = contatos.length ? contatos : null;
      }

      for (const r of extras) {
        if (r.removido) body[r.chave] = null;
        else if (r.tipo === "outro") continue;
        else if (!r.original || r.texto !== (r.tipo === "lista" ? p[r.chave].join(", ") : String(p[r.chave]))) {
          body[r.chave] = r.texto.trim() ? valorExtra(r, r.texto) : null;
        }
      }

      if (!Object.keys(body).length) {
        closeModal();
        return toast("Nada foi alterado.", "info");
      }
      const salva = await api("PATCH", `/pessoas/${p.id}`, body);
      closeModal();
      toast(`Cadastro de <b>${esc(nomePessoa(salva))}</b> atualizado.`);
      state.highlight = p.id;
      await reload(["pessoas"]);
    });
  });
}

function formVincular(p) {
  openModal(`Vincular ${nomePessoa(p)} a um abrigo`, `
    <div class="hint">A ocupação do abrigo de destino aumenta em 1. Em caso de transferência, a do abrigo anterior diminui.</div>
    ${p.abrigo_atual ? `<p class="muted">Abrigo atual: <b>${esc(nomeAbrigo(p.abrigo_atual))}</b></p>` : ""}
    <form id="f-vinc" class="form-grid">
      <div class="field full"><label>Abrigo de destino <b>*</b></label><select name="abrigo_atual" required>${abrigoOptions("", { vazioLabel: "Selecione", excluir: p.abrigo_atual })}</select></div>
      <div class="form-actions field full"><button type="button" class="btn" data-close>Cancelar</button><button type="submit" class="btn btn-primary">Confirmar</button></div>
    </form>`, (root) => bindForm($("#f-vinc", root), async (fd) => {
    await api("PATCH", `/pessoas/${p.id}/vincular-abrigo`, { abrigo_atual: fd.get("abrigo_atual") });
    closeModal();
    toast(`Vinculada a <b>${esc(nomeAbrigo(fd.get("abrigo_atual")))}</b>.`);
    state.highlight = p.id;
    await reload(["pessoas", "abrigos"]);
  }));
}

function formEditarJSON({ titulo, doc, path, exemplo, kinds, hint }) {
  openModal(titulo, `
    <div class="hint">${hint || "Só os campos enviados são alterados. Campos novos são adicionados ao documento."}</div>
    <form id="f-json" class="form-grid">
      <div class="field full"><label>Campos a atualizar (JSON)</label><textarea name="json" style="min-height:140px">${esc(JSON.stringify(exemplo, null, 2))}</textarea></div>
      <details class="field full"><summary class="muted small" style="cursor:pointer">Ver documento atual</summary><pre class="json" style="margin-top:8px">${jsonHTML(doc)}</pre></details>
      <div class="form-actions field full"><button type="button" class="btn" data-close>Cancelar</button><button type="submit" class="btn btn-primary">Salvar</button></div>
    </form>`, (root) => bindForm($("#f-json", root), async (fd) => {
    const body = parseExtras(fd.get("json"));
    await api("PATCH", path, body);
    closeModal();
    toast("Documento atualizado.");
    state.highlight = doc.id;
    await reload(kinds);
  }));
}

$("#pessoas-list").addEventListener("click", async (e) => {
  const copy = e.target.closest("[data-copy]");
  if (copy) return copyId(copy.dataset.copy);
  const btn = e.target.closest("[data-act]");
  if (!btn) return;
  const p = state.pessoasView.find((x) => x.id === btn.closest("[data-id]").dataset.id);
  const act = btn.dataset.act;
  if (act === "json") showJSON(nomePessoa(p), p);
  if (act === "vincular") formVincular(p);
  if (act === "editar") formPessoa(p);
  if (act === "desvincular") {
    try {
      await api("DELETE", `/pessoas/${p.id}/vincular-abrigo`);
      toast("Pessoa desvinculada do abrigo.", "info");
      state.highlight = p.id;
      await reload(["pessoas", "abrigos"]);
    } catch (err) { toast(err.message, "error"); }
  }
});

// ---------- Abrigos ----------
function renderAbrigos() {
  const q = $("#abrigos-busca").value.trim().toLowerCase();
  const f = $("#abrigos-filtro").value;
  const escassos = new Set(state.escassez.map((e) => e.abrigo.id));
  const list = state.abrigos.filter((a) =>
    (!q || JSON.stringify(a).toLowerCase().includes(q)) &&
    (!f || (f === "__sem" ? !a.status : a.status === f)));
  $("#abrigos-list").innerHTML = list.length ? list.map((a) => {
    const cap = capacidade(a);
    const oc = a.ocupacao_atual || 0;
    const pct = cap ? Math.round((oc / cap) * 100) : null;
    const nPessoas = state.pessoas.filter((p) => p.abrigo_atual === a.id).length;
    const nMant = state.mantimentos.filter((m) => m.abrigo_id === a.id).length;
    return `<article class="item" data-id="${a.id}">
      <div class="item-head">
        <div><div class="item-title">${esc(a.nome)}</div><div class="item-sub">${esc(a.endereco || "Endereço não informado")}</div></div>
        <div class="tags">${a.status ? `<span class="tag ${statusClass(a.status)}">${esc(a.status)}</span>` : ""}${escassos.has(a.id) ? `<span class="tag red">Escassez</span>` : ""}</div>
      </div>
      ${cap ? `<div><div class="ocupacao-row"><div class="top"><span class="muted small">Ocupação</span><span>${oc}/${cap}${a.capacidade_maxima == null ? " (estimada)" : ""}, ${pct}%</span></div>
        <div class="bar ${pct >= 100 ? "full" : pct >= 75 ? "warn" : ""}"><i style="width:${Math.min(pct, 100)}%"></i></div></div></div>` : `<span class="muted small">Capacidade não informada</span>`}
      <dl class="kv">
        ${a.coordenador ? `<dt>Coordenação</dt><dd>${esc(a.coordenador)}</dd>` : ""}
        <dt>Pessoas</dt><dd>${nPessoas} vinculada(s) no sistema</dd>
        <dt>Estoque</dt><dd>${nMant} item(ns) de mantimento</dd>
      </dl>
      ${a.necessidades_urgentes?.length ? `<div class="tags">${a.necessidades_urgentes.map((n) => `<span class="tag red">${esc(n)}</span>`).join("")}</div>` : ""}
      ${fieldsChips(a)}
      <div class="item-actions">
        <button class="btn btn-teal btn-sm" data-act="editar">Editar</button>
        <button class="btn btn-sm" data-act="pessoas">Pessoas</button>
        <button class="btn btn-sm" data-act="estoque">Estoque</button>
        <button class="btn btn-sm" data-act="json">JSON</button>
        <button class="btn btn-danger btn-sm" data-act="excluir">Excluir</button>
      </div>
      <span class="id-chip" data-copy="${a.id}" title="Copiar ID">#${a.id}</span>
    </article>`;
  }).join("") : empty("Nenhum abrigo encontrado.");
  markNew($("#abrigos-list"));
}

// a = null cadastra um abrigo novo; com a, edita o existente
function formAbrigo(a = null) {
  const novo = !a;
  a = a || { status: "aberto" };
  const opts = ["aberto", "lotado", "Superlotado", "fechado"];
  if (a.status && !opts.includes(a.status)) opts.push(a.status);
  let necessidades = [...(a.necessidades_urgentes || [])];

  openModal(novo ? "Cadastrar abrigo" : `Editar ${a.nome}`, `
    ${novo ? "" : `<div class="hint">A ocupação (${a.ocupacao_atual || 0}) não é editada aqui: ela muda ao vincular ou desvincular pessoas.</div>`}
    <form id="f-abrigo" class="form-grid" autocomplete="off">
      <div class="field full"><label>Nome <b>*</b></label><input name="nome" value="${esc(a.nome || "")}" required /></div>
      <div class="field full"><label>Endereço</label><input name="endereco" value="${esc(a.endereco || "")}" /></div>
      <div class="field"><label>Coordenador(a)</label><input name="coordenador" value="${esc(a.coordenador || "")}" /></div>
      <div class="field"><label>Status</label><select name="status"><option value="">Sem status</option>${opts.map((o) => `<option ${o === a.status ? "selected" : ""}>${esc(o)}</option>`).join("")}</select></div>
      <div class="field"><label>Capacidade máxima</label><input name="capacidade_maxima" type="number" min="1" value="${a.capacidade_maxima ?? ""}" placeholder="${a.capacidade_estimada ? "estimada: " + a.capacidade_estimada : ""}" /></div>
      <div class="field full"><label>Necessidades urgentes</label>
        <div class="tags" id="nec-lista"></div>
        <div class="api-row"><input class="input" id="nec-nova" placeholder="Ex: Colchões" list="lista-necessidades" style="flex:1" /><button type="button" class="btn" id="nec-add">Adicionar</button></div>
        <datalist id="lista-necessidades"><option>Água potável</option><option>Colchões</option><option>Fraldas</option><option>Soro fisiológico</option><option>Cobertores</option><option>Kit higiene</option></datalist>
      </div>
      <div class="form-actions field full"><button type="button" class="btn" data-close>Cancelar</button><button type="submit" class="btn btn-primary">${novo ? "Cadastrar" : "Salvar"}</button></div>
    </form>`, (root) => {
    const form = $("#f-abrigo", root);
    const desenhar = () => {
      $("#nec-lista", root).innerHTML = necessidades.length
        ? necessidades.map((n, i) => `<span class="tag red">${esc(n)}<button type="button" class="tag-x" data-rm="${i}" title="Remover">x</button></span>`).join("")
        : `<span class="muted small">Nenhuma.</span>`;
    };
    const adicionar = () => {
      const v = $("#nec-nova", root).value.trim();
      if (v && !necessidades.some((n) => n.toLowerCase() === v.toLowerCase())) necessidades.push(v);
      $("#nec-nova", root).value = "";
      desenhar();
    };
    $("#nec-add", root).addEventListener("click", adicionar);
    $("#nec-nova", root).addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); adicionar(); } });
    $("#nec-lista", root).addEventListener("click", (e) => {
      const rm = e.target.closest("[data-rm]");
      if (rm) { necessidades.splice(+rm.dataset.rm, 1); desenhar(); }
    });
    desenhar();

    bindForm(form, async (fd) => {
      const v = Object.fromEntries(fd);
      const campos = {
        nome: v.nome.trim(),
        endereco: v.endereco.trim(),
        coordenador: v.coordenador.trim(),
        status: v.status,
        capacidade_maxima: v.capacidade_maxima ? +v.capacidade_maxima : "",
        necessidades_urgentes: necessidades,
      };
      let salvo;
      if (novo) {
        salvo = await api("POST", "/abrigos/", compact(campos));
      } else {
        // envia só o que mudou; campo esvaziado vai como null e é removido do documento
        const body = {};
        for (const [k, val] of Object.entries(campos)) {
          const antes = a[k] ?? "";
          const vazio = val === "" || (Array.isArray(val) && !val.length);
          if (JSON.stringify(val) === JSON.stringify(antes) || (vazio && (antes === "" || (Array.isArray(antes) && !antes.length)))) continue;
          body[k] = vazio ? null : val;
        }
        salvo = await api("PATCH", `/abrigos/${a.id}`, body);
      }
      closeModal();
      toast(`Abrigo <b>${esc(salvo.nome)}</b> ${novo ? "cadastrado" : "atualizado"}.`);
      state.highlight = salvo.id;
      await reload(["abrigos"]);
      go("abrigos");
    });
  });
}

$("#abrigos-list").addEventListener("click", async (e) => {
  const copy = e.target.closest("[data-copy]");
  if (copy) return copyId(copy.dataset.copy);
  const btn = e.target.closest("[data-act]");
  if (!btn) return;
  const a = state.abrigos.find((x) => x.id === btn.closest("[data-id]").dataset.id);
  const act = btn.dataset.act;
  if (act === "json") {
    try { showJSON(a.nome, await api("GET", `/abrigos/${a.id}`)); } catch (err) { toast(err.message, "error"); }
  }
  if (act === "editar") formAbrigo(a);
  if (act === "excluir") {
    if (!confirm(`Excluir o abrigo "${a.nome}"?`)) return;
    try {
      await api("DELETE", `/abrigos/${a.id}`);
      toast(`Abrigo <b>${esc(a.nome)}</b> excluído.`, "info");
      await reload(["abrigos"]);
    } catch (err) { toast(err.message, "error"); }
  }
  if (act === "pessoas") {
    $("#pessoas-filtro").value = a.id;
    await loadPessoas(); renderPessoas(); go("pessoas");
  }
  if (act === "estoque") {
    $("#mant-abrigo").value = a.id;
    await loadMantimentos(); renderMantimentos(); go("mantimentos");
  }
});

// ---------- Doações ----------
function renderDoacoes() {
  $("#doacoes-count").textContent = `${state.doacoes.length} doação(ões)`;
  $("#doacoes-list").innerHTML = state.doacoes.length ? state.doacoes.map((d) => `
    <tr data-id="${d.id}">
      <td><b>${esc(d.item)}</b><div class="id-chip" data-copy="${d.id}">#${d.id.slice(-8)}</div></td>
      <td>${d.categoria ? `<span class="tag blue">${esc(d.categoria)}</span>` : "<span class='muted'>—</span>"}</td>
      <td>${qtdDoacao(d)}</td>
      <td>${d.doador ? esc(d.doador) : "<span class='muted'>Anônimo</span>"}</td>
      <td>${d.lote ? `<code>${esc(d.lote)}</code><br>` : ""}${d.validade ? `<span class="small muted">val. ${fmtDate(d.validade)}</span>` : d.lote ? "" : "<span class='muted'>—</span>"}</td>
      <td>${fieldsChips(d)}</td>
      <td>${d.destinacao
        ? `<span class="tag green">Enviada</span><div class="small">${esc(nomeAbrigo(d.destinacao.abrigo_id))}</div>`
        : `<button class="btn btn-teal btn-sm" data-act="destinar">Destinar</button>`}</td>
      <td class="actions">
        <button class="btn btn-sm" data-act="json">JSON</button>
        <button class="btn btn-sm" data-act="editar">Editar</button>
        <button class="btn btn-danger btn-sm" data-act="excluir">Excluir</button>
      </td>
    </tr>`).join("") : `<tr><td colspan="8">${empty("Nenhuma doação encontrada com esses filtros.")}</td></tr>`;
  markNew($("#doacoes-list"));
}

const DOACAO_PRESETS = {
  anonima: { item: "Água Mineral 5L", quantidade: 40, unidade: "galões" },
  medicamento: { item: "Amoxicilina 500mg", categoria: "Medicamentos", quantidade: 30, unidade: "caixas", lote: "AMX2026B", validade: "2027-08-31", doador: "Farmácia Popular Centro" },
  institucional: { item: "Cestas básicas", categoria: "Alimentos", quantidade: 200, unidade: "unidades", doador: "Cruz Vermelha", extras: '{ "transportadora": "Exército", "nota_fiscal": "NF-55821", "destino_sugerido": "Ginásio" }' },
};

function formDoacao() {
  openModal("Registrar doação", `
    <div class="presets">
      <span class="muted small">Preencher com exemplo:</span>
      <button type="button" class="btn btn-sm" data-preset="anonima">Anônima</button>
      <button type="button" class="btn btn-sm" data-preset="medicamento">Medicamento com lote</button>
      <button type="button" class="btn btn-sm" data-preset="institucional">Institucional</button>
    </div>
    <div class="hint">Só o item é obrigatório. Sem data de recebimento, a data do registro é salva automaticamente.</div>
    <form id="f-doacao" class="form-grid" autocomplete="off">
      <div class="field full"><label>Item <b>*</b></label><input name="item" /></div>
      <div class="field"><label>Categoria</label><input name="categoria" list="lista-categorias" /></div>
      <div class="field"><label>Doador</label><input name="doador" placeholder="vazio = anônimo" /></div>
      <div class="field"><label>Quantidade</label><input name="quantidade" type="number" min="1" /></div>
      <div class="field"><label>Unidade</label><input name="unidade" placeholder="kg, caixas, litros" /></div>
      <div class="field"><label>Lote</label><input name="lote" /></div>
      <div class="field"><label>Validade</label><input name="validade" type="date" /></div>
      <div class="field"><label>Data de recebimento</label><input name="data_recebimento" type="date" /></div>
      <div class="field"><label>Observações</label><input name="observacoes" /></div>
      <div class="field full"><label>Campos extras (JSON)</label><textarea name="extras"></textarea></div>
      <div class="form-actions field full"><button type="button" class="btn" data-close>Cancelar</button><button type="submit" class="btn btn-primary">Registrar</button></div>
    </form>`, (root) => {
    const form = $("#f-doacao", root);
    $$("[data-preset]", root).forEach((b) => b.addEventListener("click", () => {
      form.reset();
      Object.entries(DOACAO_PRESETS[b.dataset.preset]).forEach(([k, v]) => (form.elements[k].value = v));
    }));
    bindForm(form, async (fd) => {
      const v = Object.fromEntries(fd);
      const payload = compact({
        item: v.item.trim(), categoria: v.categoria.trim(), doador: v.doador.trim(),
        quantidade: v.quantidade ? +v.quantidade : null, unidade: v.unidade.trim(), lote: v.lote.trim(),
        validade: v.validade, data_recebimento: v.data_recebimento, observacoes: v.observacoes.trim(),
      });
      Object.assign(payload, parseExtras(v.extras));
      const d = await api("POST", "/doacoes/", payload);
      closeModal();
      toast(`Doação de <b>${esc(d.item)}</b> registrada.`);
      state.highlight = d.id;
      ["#doacoes-item", "#doacoes-doador", "#doacoes-categoria"].forEach((s) => ($(s).value = ""));
      await reload(["doacoes"]);
    });
  });
}

function formDestinar(d) {
  const qtd = d.quantidade ?? d.quantidade_exata ?? d.quantidade_estimada;
  openModal(`Destinar doação: ${d.item}`, `
    <div class="hint">O item entra no estoque do abrigo escolhido. Se o abrigo já tiver esse item, a quantidade é somada. A doação fica marcada como enviada.</div>
    <form id="f-destinar" class="form-grid">
      <div class="field full"><label>Abrigo <b>*</b></label><select name="abrigo_id" required>${abrigoOptions("", { vazioLabel: "Selecione" })}</select></div>
      <div class="field"><label>Quantidade <b>*</b></label><input name="quantidade" type="number" min="1" value="${qtd ?? ""}" required /></div>
      <div class="field"><label>Unidade</label><input value="${esc(d.unidade || "")}" disabled /></div>
      <div class="form-actions field full"><button type="button" class="btn" data-close>Cancelar</button><button type="submit" class="btn btn-primary">Enviar para o abrigo</button></div>
    </form>`, (root) => bindForm($("#f-destinar", root), async (fd) => {
    const r = await api("PATCH", `/doacoes/${d.id}/destinar`, { abrigo_id: fd.get("abrigo_id"), quantidade: +fd.get("quantidade") });
    closeModal();
    toast(`<b>${esc(d.item)}</b> enviado para <b>${esc(nomeAbrigo(r.mantimento.abrigo_id))}</b>. Estoque do item: ${r.mantimento.quantidade}.`);
    state.highlight = d.id;
    await reload(["doacoes", "mantimentos"]);
  }));
}

$("#doacoes-list").addEventListener("click", async (e) => {
  const copy = e.target.closest("[data-copy]");
  if (copy) return copyId(copy.dataset.copy);
  const btn = e.target.closest("[data-act]");
  if (!btn) return;
  const d = state.doacoes.find((x) => x.id === btn.closest("[data-id]").dataset.id);
  const act = btn.dataset.act;
  if (act === "json") {
    try { showJSON(d.item, await api("GET", `/doacoes/${d.id}`)); } catch (err) { toast(err.message, "error"); }
  }
  if (act === "editar") formEditarJSON({
    titulo: `Editar doação: ${d.item}`, doc: d, path: `/doacoes/${d.id}`, kinds: ["doacoes"],
    exemplo: { status_triagem: "Conferida", conferido_por: "Voluntária Ana" },
  });
  if (act === "destinar") formDestinar(d);
  if (act === "excluir") {
    if (!confirm(`Excluir a doação "${d.item}"?`)) return;
    try {
      await api("DELETE", `/doacoes/${d.id}`);
      toast(`Doação <b>${esc(d.item)}</b> excluída.`, "info");
      await reload(["doacoes"]);
    } catch (err) { toast(err.message, "error"); }
  }
});

// ---------- Mantimentos ----------
function renderMantimentos() {
  $("#mant-count").textContent = `${state.mantimentos.length} item(ns) de estoque`;
  $("#mant-list").innerHTML = state.mantimentos.length ? state.mantimentos.map((m) => {
    const min = m.quantidade_minima;
    const baixo = min != null && m.quantidade < min;
    const pct = min ? Math.min(Math.round((m.quantidade / (min * 2)) * 100), 100) : 100;
    return `<article class="item" data-id="${m.id}">
      <div class="item-head">
        <div><div class="item-title">${esc(m.item)}</div><div class="item-sub">${esc(nomeAbrigo(m.abrigo_id))}</div></div>
        ${baixo ? `<span class="tag red">Estoque baixo</span>` : m.quantidade === 0 ? `<span class="tag red">Zerado</span>` : `<span class="tag green">OK</span>`}
      </div>
      <div style="display:flex;align-items:baseline;gap:8px"><span style="font-size:1.6rem;font-weight:700">${m.quantidade}</span><span class="muted">${esc(m.unidade || "un.")}${min != null ? `, mínimo ${min}` : ""}</span></div>
      ${min != null ? `<div class="bar ${baixo ? "full" : pct < 75 ? "warn" : ""}"><i style="width:${pct}%"></i></div>` : ""}
      <div class="tags">${m.categoria ? `<span class="tag blue">${esc(m.categoria)}</span>` : ""}<span class="tag">${(m.historico || []).length} movimentações</span></div>
      <div class="item-actions">
        <button class="btn btn-sm" data-act="entrada">Entrada</button>
        <button class="btn btn-danger btn-sm" data-act="saida">Saída</button>
        <button class="btn btn-teal btn-sm" data-act="redistribuir">Redistribuir</button>
        <button class="btn btn-sm" data-act="historico">Histórico</button>
        <button class="btn btn-sm" data-act="json">JSON</button>
      </div>
      <span class="id-chip" data-copy="${m.id}" title="Copiar ID">#${m.id}</span>
    </article>`;
  }).join("") : empty("Nenhum mantimento em estoque. Use <b>Entrada de estoque</b> para cadastrar.");
  markNew($("#mant-list"));
}

function formMantimento(abrigoId = "") {
  openModal("Entrada de mantimento no estoque", `
    <div class="presets">
      <span class="muted small">Preencher com exemplo:</span>
      <button type="button" class="btn btn-sm" data-preset="agua">Água (estoque baixo)</button>
      <button type="button" class="btn btn-sm" data-preset="arroz">Arroz (estoque alto)</button>
    </div>
    <div class="hint">Item, quantidade e abrigo são obrigatórios. Se o abrigo já tiver esse item, a quantidade é somada ao estoque existente. Abaixo do mínimo, o abrigo passa a aparecer em Escassez.</div>
    <form id="f-mant" class="form-grid" autocomplete="off">
      <div class="field full"><label>Item <b>*</b></label><input name="item" required /></div>
      <div class="field"><label>Quantidade <b>*</b></label><input name="quantidade" type="number" min="0" required /></div>
      <div class="field"><label>Quantidade mínima (alerta)</label><input name="quantidade_minima" type="number" min="0" /></div>
      <div class="field"><label>Unidade</label><input name="unidade" /></div>
      <div class="field"><label>Categoria</label><input name="categoria" list="lista-categorias" /></div>
      <div class="field full"><label>Abrigo <b>*</b></label><select name="abrigo_id" required>${abrigoOptions(abrigoId, { vazioLabel: "Selecione" })}</select></div>
      <div class="field full"><label>Observações</label><input name="observacoes" /></div>
      <div class="form-actions field full"><button type="button" class="btn" data-close>Cancelar</button><button type="submit" class="btn btn-primary">Dar entrada</button></div>
    </form>`, (root) => {
    const form = $("#f-mant", root);
    const presets = {
      agua: { item: "Água potável", quantidade: 15, quantidade_minima: 100, unidade: "litros", categoria: "Alimentos" },
      arroz: { item: "Arroz 5kg", quantidade: 300, quantidade_minima: 50, unidade: "pacotes", categoria: "Alimentos" },
    };
    $$("[data-preset]", root).forEach((b) => b.addEventListener("click", () => {
      const ab = form.elements.abrigo_id.value;
      form.reset();
      form.elements.abrigo_id.value = ab;
      Object.entries(presets[b.dataset.preset]).forEach(([k, v]) => (form.elements[k].value = v));
    }));
    bindForm(form, async (fd) => {
      const v = Object.fromEntries(fd);
      const payload = compact({
        item: v.item.trim(), quantidade: +v.quantidade, abrigo_id: v.abrigo_id,
        quantidade_minima: v.quantidade_minima !== "" ? +v.quantidade_minima : null,
        unidade: v.unidade.trim(), categoria: v.categoria.trim(), observacoes: v.observacoes.trim(),
      });
      if (payload.quantidade === undefined) payload.quantidade = 0;
      const m = await api("POST", "/mantimentos/", payload);
      closeModal();
      toast(m.historico.length > 1
        ? `${payload.quantidade} somado ao estoque de <b>${esc(m.item)}</b>. Total: ${m.quantidade} ${esc(m.unidade || "")}.`
        : `Entrada de <b>${m.quantidade} ${esc(m.unidade || "")} ${esc(m.item)}</b> registrada.`);
      state.highlight = m.id;
      $("#mant-baixo").checked = false;
      $("#mant-item").value = "";
      await reload(["mantimentos"]);
      go("mantimentos");
    });
  });
}

function formEntrada(m) {
  openModal(`Entrada de estoque: ${m.item}`, `
    <p>Estoque atual: <b>${m.quantidade} ${esc(m.unidade || "")}</b> em ${esc(nomeAbrigo(m.abrigo_id))}</p>
    <form id="f-entrada" class="form-grid">
      <div class="field"><label>Quantidade recebida <b>*</b></label><input name="quantidade" type="number" min="1" required /></div>
      <div class="field"><label>Origem</label><input name="origem" placeholder="Prefeitura, compra..." /></div>
      <div class="form-actions field full"><button type="button" class="btn" data-close>Cancelar</button><button type="submit" class="btn btn-primary">Registrar entrada</button></div>
    </form>`, (root) => bindForm($("#f-entrada", root), async (fd) => {
    const r = await api("POST", "/mantimentos/", compact({
      item: m.item, abrigo_id: m.abrigo_id, quantidade: +fd.get("quantidade"), origem: fd.get("origem").trim(),
    }));
    closeModal();
    toast(`Entrada registrada. Estoque atual: <b>${r.quantidade}</b>`);
    state.highlight = m.id;
    await reload(["mantimentos"]);
  }));
}

function formSaida(m) {
  openModal(`Saída de estoque: ${m.item}`, `
    <p>Disponível: <b>${m.quantidade} ${esc(m.unidade || "")}</b> em ${esc(nomeAbrigo(m.abrigo_id))}</p>
    <div class="hint">Não é possível retirar mais do que o disponível.</div>
    <form id="f-saida" class="form-grid">
      <div class="field"><label>Quantidade <b>*</b></label><input name="quantidade" type="number" min="1" required /></div>
      <div class="field"><label>Motivo</label><input name="motivo" placeholder="Distribuição para famílias" /></div>
      <div class="form-actions field full"><button type="button" class="btn" data-close>Cancelar</button><button type="submit" class="btn btn-danger">Registrar saída</button></div>
    </form>`, (root) => bindForm($("#f-saida", root), async (fd) => {
    const r = await api("PATCH", `/mantimentos/${m.id}/saida`, compact({ quantidade: +fd.get("quantidade"), motivo: fd.get("motivo").trim() }));
    closeModal();
    toast(`Saída registrada. Estoque atual: <b>${r.quantidade}</b>`, "info");
    state.highlight = m.id;
    await reload(["mantimentos"]);
  }));
}

function formRedistribuir(m, destinoFixo = null) {
  openModal(`Redistribuir ${m.item}`, `
    <p>Origem: <b>${esc(nomeAbrigo(m.abrigo_id))}</b> (disponível: <b>${m.quantidade} ${esc(m.unidade || "")}</b>)</p>
    <div class="hint">A quantidade sai deste abrigo e entra no estoque do destino. A movimentação fica no histórico dos dois.</div>
    <form id="f-redis" class="form-grid">
      <div class="field full"><label>Abrigo de destino <b>*</b></label><select name="destino" required>${abrigoOptions(destinoFixo || "", { vazioLabel: "Selecione", excluir: m.abrigo_id })}</select></div>
      <div class="field"><label>Quantidade <b>*</b></label><input name="quantidade" type="number" min="1" max="${m.quantidade}" required /></div>
      <div class="field"><label>Motivo</label><input name="motivo" placeholder="Abrigo em escassez" /></div>
      <div class="form-actions field full"><button type="button" class="btn" data-close>Cancelar</button><button type="submit" class="btn btn-teal">Redistribuir</button></div>
    </form>`, (root) => bindForm($("#f-redis", root), async (fd) => {
    const destino = fd.get("destino");
    await api("PATCH", `/mantimentos/${m.id}/associar-abrigo`, compact({
      abrigo_destino_id: destino, quantidade: +fd.get("quantidade"), motivo: fd.get("motivo").trim(),
    }));
    closeModal();
    toast(`${fd.get("quantidade")} ${esc(m.unidade || "")} de <b>${esc(m.item)}</b> enviados para <b>${esc(nomeAbrigo(destino))}</b>.`);
    state.highlight = m.id;
    await reload(["mantimentos"]);
  }));
}

function showHistorico(m) {
  const label = { entrada: "Entrada", saida: "Saída", redistribuicao_saida: "Enviado", redistribuicao_entrada: "Recebido" };
  const h = [...(m.historico || [])].reverse();
  openModal(`Histórico: ${m.item}`, `
    <p class="muted small">Movimentações mais recentes primeiro.</p>
    <ul class="timeline">${h.map((x) => {
      const ent = x.tipo.includes("entrada");
      const outro = x.abrigo_destino ? `para ${esc(nomeAbrigo(x.abrigo_destino))}` : x.abrigo_origem ? `vindo de ${esc(nomeAbrigo(x.abrigo_origem))}` : "";
      return `<li><span class="tag ${ent ? "green" : "red"}">${label[x.tipo] || esc(x.tipo)}</span>
        <span>${esc(x.descricao || "")} ${outro ? `<span class="muted small">${outro}</span>` : ""}<br><span class="muted small">${fmtDate(x.data)}</span></span>
        <span class="qty ${ent ? "in" : "out"}">${ent ? "+" : "-"}${x.quantidade}</span></li>`;
    }).join("") || "<li>Sem movimentações.</li>"}</ul>`);
}

$("#mant-list").addEventListener("click", async (e) => {
  const copy = e.target.closest("[data-copy]");
  if (copy) return copyId(copy.dataset.copy);
  const btn = e.target.closest("[data-act]");
  if (!btn) return;
  let m = state.mantimentos.find((x) => x.id === btn.closest("[data-id]").dataset.id);
  const act = btn.dataset.act;
  if (act === "entrada") formEntrada(m);
  if (act === "saida") formSaida(m);
  if (act === "redistribuir") formRedistribuir(m);
  if (act === "historico" || act === "json") {
    try { m = await api("GET", `/mantimentos/${m.id}`); } catch (err) { return toast(err.message, "error"); }
    act === "historico" ? showHistorico(m) : showJSON(m.item, m);
  }
});

// ---------- Escassez ----------
function renderEscassez() {
  $("#escassez-list").innerHTML = state.escassez.length ? state.escassez.map((e) => `
    <article class="item alerta" data-id="${e.abrigo.id}">
      <div class="item-head">
        <div><div class="item-title">${esc(e.abrigo.nome)}</div><div class="item-sub">${esc(e.abrigo.endereco || "")}</div></div>
        ${e.abrigo.status ? `<span class="tag ${statusClass(e.abrigo.status)}">${esc(e.abrigo.status)}</span>` : ""}
      </div>
      ${e.necessidades_urgentes?.length ? `<div><div class="muted small" style="margin-bottom:6px">Necessidades urgentes</div>
        <div class="tags">${e.necessidades_urgentes.map((n) => `<span class="tag red">${esc(n)}</span>`).join("")}</div></div>` : ""}
      ${e.mantimentos_em_falta?.length ? `<div><div class="muted small" style="margin-bottom:6px">Estoque abaixo do mínimo</div>
        ${e.mantimentos_em_falta.map((m) => `<div class="ocupacao-row" style="margin-bottom:8px"><div class="top"><span>${esc(m.item)}</span><span>${m.quantidade}/${m.quantidade_minima} ${esc(m.unidade || "")}</span></div>
        <div class="bar full"><i style="width:${Math.min(Math.round((m.quantidade / m.quantidade_minima) * 100), 100)}%"></i></div></div>`).join("")}</div>` : ""}
      <div class="item-actions">
        <button class="btn btn-teal btn-sm" data-act="enviar">Enviar suprimentos</button>
        <button class="btn btn-sm" data-act="entrada">Entrada direta</button>
        <button class="btn btn-sm" data-act="estoque">Ver estoque</button>
      </div>
    </article>`).join("") : empty("Nenhum abrigo em escassez no momento.");
}

async function formEnviarSuprimentos(entry) {
  const destino = entry.abrigo.id;
  const todos = await api("GET", "/mantimentos/");
  const procurados = [...(entry.necessidades_urgentes || []), ...(entry.mantimentos_em_falta || []).map((m) => m.item)].map((s) => s.toLowerCase());
  const match = (item) => procurados.some((p) => item.toLowerCase().includes(p.split(" ")[0]) || p.includes(item.toLowerCase().split(" ")[0]));
  const fontes = todos.filter((m) => m.abrigo_id !== destino && m.quantidade > 0).sort((a, b) => match(b.item) - match(a.item));
  if (!fontes.length) return toast("Nenhum outro abrigo tem estoque disponível para enviar.", "info");
  openModal(`Enviar suprimentos para ${entry.abrigo.nome}`, `
    <div class="hint">Escolha um item do estoque de outro abrigo. Os que batem com as necessidades aparecem primeiro, marcados com *.</div>
    <form id="f-enviar" class="form-grid">
      <div class="field full"><label>Origem (item / abrigo / disponível) <b>*</b></label>
        <select name="origem" required>${fontes.map((m) => `<option value="${m.id}">${match(m.item) ? "* " : ""}${esc(m.item)} / ${esc(nomeAbrigo(m.abrigo_id))} / ${m.quantidade} ${esc(m.unidade || "")}</option>`).join("")}</select></div>
      <div class="field"><label>Quantidade <b>*</b></label><input name="quantidade" type="number" min="1" required /></div>
      <div class="field"><label>Motivo</label><input name="motivo" value="Abrigo em escassez" /></div>
      <div class="form-actions field full"><button type="button" class="btn" data-close>Cancelar</button><button type="submit" class="btn btn-teal">Enviar</button></div>
    </form>`, (root) => bindForm($("#f-enviar", root), async (fd) => {
    const m = fontes.find((x) => x.id === fd.get("origem"));
    await api("PATCH", `/mantimentos/${m.id}/associar-abrigo`, compact({ abrigo_destino_id: destino, quantidade: +fd.get("quantidade"), motivo: fd.get("motivo").trim() }));
    closeModal();
    toast(`${fd.get("quantidade")} de <b>${esc(m.item)}</b> enviados para <b>${esc(entry.abrigo.nome)}</b>.`);
    await reload(["mantimentos"]);
  }));
}

$("#escassez-list").addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-act]");
  if (!btn) return;
  const entry = state.escassez.find((x) => x.abrigo.id === btn.closest("[data-id]").dataset.id);
  const act = btn.dataset.act;
  try {
    if (act === "enviar") await formEnviarSuprimentos(entry);
    if (act === "entrada") formMantimento(entry.abrigo.id);
    if (act === "estoque") {
      $("#mant-abrigo").value = entry.abrigo.id;
      await loadMantimentos(); renderMantimentos(); go("mantimentos");
    }
  } catch (err) { toast(err.message, "error"); }
});

// ---------- Relatórios (Data Analyst / Aggregation) ----------
function labelAbrigoRelatorio(abrigoRef) {
  if (!abrigoRef || abrigoRef === "Sem abrigo vinculado") return "Sem abrigo vinculado";
  return nomeAbrigo(abrigoRef) || String(abrigoRef);
}

function renderRelatorios() {
  const { medicas, escassez, ocupacao, triagem } = state.relatorios;
  const totalMed = medicas.reduce((s, r) => s + (r.quantidade_pessoas || 0), 0);
  const totalCriticos = ocupacao.length;
  const incompletos = triagem
    ? (triagem.sem_nome_completo || 0) + (triagem.sem_contato_emergencia || 0)
    : 0;

  $("#relatorios-stats").innerHTML = [
    [totalMed, "Demandas de medicação", "var(--blue)"],
    [escassez.length, "Tipos de item em falta", "var(--amber)"],
    [totalCriticos, "Abrigos críticos", "var(--red)"],
    [triagem?.total_resgatados ?? "—", "Total de resgatados", "var(--green)"],
    [incompletos, "Sinais de cadastro incompleto", "var(--primary)"],
  ].map(([v, l, c]) => `
    <div class="stat" style="--c:${c};cursor:default">
      <div class="value">${v}</div><div class="label">${l}</div>
    </div>`).join("");

  $("#rel-medicas").innerHTML = medicas.length
    ? medicas.map((r) => `<tr>
        <td>${esc(labelAbrigoRelatorio(r.abrigo))}</td>
        <td><span class="tag blue">${esc(r.medicamento)}</span></td>
        <td><strong>${r.quantidade_pessoas}</strong></td>
      </tr>`).join("")
    : `<tr><td colspan="3">${empty("Nenhuma necessidade médica agregada.")}</td></tr>`;

  $("#rel-escassez").innerHTML = escassez.length
    ? escassez.map((r) => `<tr>
        <td>${esc(r.item_necessario)}</td>
        <td><strong>${r.abrigos_solicitantes}</strong> abrigo(s)</td>
      </tr>`).join("")
    : `<tr><td colspan="2">${empty("Nenhuma necessidade urgente agregada.")}</td></tr>`;

  $("#rel-ocupacao").innerHTML = ocupacao.length
    ? ocupacao.map((a) => {
      const pct = Math.round(a.taxa_ocupacao_percentual ?? 0);
      const cls = pct >= 100 ? "full" : pct >= 90 ? "warn" : "";
      return `<div class="ocupacao-row">
        <div class="top"><span>${esc(a.nome)} ${a.status ? `<span class="tag ${statusClass(a.status)}">${esc(a.status)}</span>` : ""}</span>
        <span>${a.ocupacao_atual}/${a.capacidade_maxima} · ${pct}%</span></div>
        <div class="bar ${cls}"><i style="width:${Math.min(pct, 100)}%"></i></div>
      </div>`;
    }).join("")
    : empty("Nenhum abrigo crítico no momento.");

  if (!triagem) {
    $("#rel-triagem").innerHTML = empty("Triagem indisponível.");
    return;
  }
  const total = triagem.total_resgatados || 0;
  const semNome = triagem.sem_nome_completo || 0;
  const semContato = triagem.sem_contato_emergencia || 0;
  const pct = (n) => (total ? Math.round((n / total) * 100) : 0);
  $("#rel-triagem").innerHTML = `
    <div class="triagem-grid">
      <div class="triagem-card">
        <div class="value">${semNome}</div>
        <div class="label">Sem nome completo</div>
        <div class="bar warn"><i style="width:${pct(semNome)}%"></i></div>
        <div class="muted small">${pct(semNome)}% dos ${total} resgatados</div>
      </div>
      <div class="triagem-card">
        <div class="value">${semContato}</div>
        <div class="label">Sem contato de emergência</div>
        <div class="bar full"><i style="width:${pct(semContato)}%"></i></div>
        <div class="muted small">${pct(semContato)}% dos ${total} resgatados</div>
      </div>
    </div>`;
}

// ---------- Eventos globais ----------
function copyId(id) {
  navigator.clipboard?.writeText(id);
  toast(`ID copiado: <code>${id}</code>`, "info");
}

function debounce(fn, ms = 250) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

$$(".nav-item").forEach((b) => b.addEventListener("click", () => go(b.dataset.view)));
$("#btn-refresh").addEventListener("click", () => { state.highlight = null; loadAll(); });
$("#btn-console").addEventListener("click", () => $("#console").classList.toggle("open"));
$("#btn-close-console").addEventListener("click", () => $("#console").classList.remove("open"));
$("#btn-clear-console").addEventListener("click", () => {
  $("#console-list").innerHTML = "";
  state.logCount = 0;
  $("#badge-console").dataset.zero = "1";
});

$("#modal-close").addEventListener("click", closeModal);
$("#modal-backdrop").addEventListener("click", (e) => {
  if (e.target.id === "modal-backdrop" || e.target.closest("[data-close]")) closeModal();
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

$("#btn-nova-pessoa").addEventListener("click", () => formPessoa());
$("#btn-nova-doacao").addEventListener("click", formDoacao);
$("#btn-novo-abrigo").addEventListener("click", () => formAbrigo());
$("#btn-novo-mant").addEventListener("click", () => formMantimento($("#mant-abrigo").value));

$("#pessoas-busca").addEventListener("input", debounce(renderPessoas));
$("#pessoas-filtro").addEventListener("change", async () => {
  try { await loadPessoas(); renderPessoas(); } catch (err) { toast(err.message, "error"); }
});
$("#abrigos-busca").addEventListener("input", debounce(renderAbrigos));
$("#abrigos-filtro").addEventListener("change", renderAbrigos);

const filtrarDoacoes = async () => { try { await loadDoacoes(); renderDoacoes(); } catch (err) { toast(err.message, "error"); } };
$("#btn-filtrar-doacoes").addEventListener("click", filtrarDoacoes);
["#doacoes-item", "#doacoes-doador", "#doacoes-categoria"].forEach((s) => $(s).addEventListener("keydown", (e) => e.key === "Enter" && filtrarDoacoes()));

const filtrarMant = async () => { try { await loadMantimentos(); renderMantimentos(); } catch (err) { toast(err.message, "error"); } };
$("#btn-filtrar-mant").addEventListener("click", filtrarMant);
$("#mant-abrigo").addEventListener("change", filtrarMant);
$("#mant-baixo").addEventListener("change", filtrarMant);
$("#mant-item").addEventListener("keydown", (e) => e.key === "Enter" && filtrarMant());

// Configuração da URL da API
$("#api-url").value = API;
$("#docs-link").href = API + "/docs";
$("#btn-save-api").addEventListener("click", () => {
  API = $("#api-url").value.trim().replace(/\/+$/, "") || DEFAULT_API;
  localStorage.setItem("apiUrl", API);
  $("#api-url").value = API;
  $("#docs-link").href = API + "/docs";
  loadAll();
});

// Inicialização
$("#stats").innerHTML = Array(6).fill('<div class="skeleton"></div>').join("");
loadAll();
setInterval(checkHealth, 15000);
