const state = {
  selectedType: "rule",
  selectedId: "dish_weight_rule",
  rules: [
    {
      id: "dish_weight_rule",
      name: "dish_weight_rule",
      type: "rule",
      status: "active",
      input: "list[str] / 菜品列表",
      output: "str / 重量报告",
      desc: "根据菜单计算总重量并判断是否超限。",
    },
    {
      id: "thecreataget",
      name: "thecreataget",
      type: "agent",
      status: "active",
      input: "str / 用户点餐需求",
      output: "str / 菜品字符串",
      desc: "调用智能体生成菜品列表。",
    },
    {
      id: "qwen_answer_agent",
      name: "qwen_answer_agent",
      type: "agent",
      status: "active",
      input: "str / 汇总上下文",
      output: "str / 用户答案",
      desc: "根据上下文生成最终回复。",
    },
  ],
  agents: [
    {
      id: "main_agent",
      name: "主 Agent",
      desc: "调度生命周期图，串联规则和智能体。",
    },
    {
      id: "adapt_agent",
      name: "Adapt Agent",
      desc: "检查规则输入输出是否可对接。",
    },
  ],
};

const els = {
  ruleList: document.getElementById("ruleList"),
  agentList: document.getElementById("agentList"),
  graphCanvas: document.getElementById("graphCanvas"),
  detailPanel: document.getElementById("detailPanel"),
  previewBox: document.getElementById("previewBox"),
  ruleCount: document.getElementById("ruleCount"),
  agentCount: document.getElementById("agentCount"),
  modal: document.getElementById("modal"),
  modalTitle: document.getElementById("modalTitle"),
  formName: document.getElementById("formName"),
  formType: document.getElementById("formType"),
  formInput: document.getElementById("formInput"),
  formOutput: document.getElementById("formOutput"),
};

function render() {
  els.ruleCount.textContent = `${state.rules.length} 项`;
  els.agentCount.textContent = `${state.agents.length} 项`;
  renderList();
  renderAgents();
  renderGraph();
  renderDetail();
  renderPreview();
}

function renderList() {
  els.ruleList.innerHTML = state.rules
    .map(
      (item) => `
      <div class="item-card ${state.selectedId === item.id ? "active" : ""}" data-id="${item.id}" data-type="${item.type}">
        <div class="item-name">${item.name}</div>
        <div class="item-meta">${item.input}<br />${item.output}</div>
      </div>
    `
    )
    .join("");

  els.ruleList.querySelectorAll(".item-card").forEach((card) => {
    card.addEventListener("click", () => {
      state.selectedId = card.dataset.id;
      state.selectedType = card.dataset.type;
      render();
    });
  });
}

function renderAgents() {
  els.agentList.innerHTML = state.agents
    .map(
      (item) => `
      <div class="item-card ${state.selectedId === item.id ? "active" : ""}" data-id="${item.id}" data-type="agent">
        <div class="item-name">${item.name}</div>
        <div class="item-meta">${item.desc}</div>
      </div>
    `
    )
    .join("");

  els.agentList.querySelectorAll(".item-card").forEach((card) => {
    card.addEventListener("click", () => {
      state.selectedId = card.dataset.id;
      state.selectedType = "agent";
      render();
    });
  });
}

function renderGraph() {
  const nodes = [
    { title: "输入接收", type: "builtin", desc: "接收用户输入，写入 state。" },
    ...state.rules.map((item) => ({
      title: item.name,
      type: item.type,
      desc: item.desc,
    })),
  ];

  els.graphCanvas.innerHTML = nodes
    .map(
      (node) => `
      <div class="graph-node">
        <div class="node-top">
          <strong>${node.title}</strong>
          <span class="pill">${node.type}</span>
        </div>
        <div class="node-desc">${node.desc}</div>
      </div>
    `
    )
    .join("");
}

function renderDetail() {
  const rule = state.rules.find((item) => item.id === state.selectedId);
  const agent = state.agents.find((item) => item.id === state.selectedId);

  if (rule) {
    els.detailPanel.innerHTML = `
      <div class="detail-row">
        <label>名称<input value="${rule.name}" /></label>
      </div>
      <div class="detail-row">
        <label>类型<input value="${rule.type}" /></label>
      </div>
      <div class="detail-row">
        <label>输入<input value="${rule.input}" /></label>
      </div>
      <div class="detail-row">
        <label>输出<input value="${rule.output}" /></label>
      </div>
      <div class="detail-row">
        <label>说明<textarea rows="4">${rule.desc}</textarea></label>
      </div>
      <div class="detail-row">
        <button class="secondary-btn" id="deleteSelected">删除规则</button>
      </div>
    `;
    document.getElementById("deleteSelected").onclick = () => {
      state.rules = state.rules.filter((item) => item.id !== rule.id);
      state.selectedId = state.rules[0]?.id || "";
      render();
    };
    return;
  }

  if (agent) {
    els.detailPanel.innerHTML = `
      <div class="detail-row">
        <label>名称<input value="${agent.name}" /></label>
      </div>
      <div class="detail-row">
        <label>说明<textarea rows="4">${agent.desc}</textarea></label>
      </div>
      <div class="detail-row">
        <button class="secondary-btn" id="deleteSelected">删除智能体</button>
      </div>
    `;
    document.getElementById("deleteSelected").onclick = () => {
      state.agents = state.agents.filter((item) => item.id !== agent.id);
      state.selectedId = state.rules[0]?.id || "";
      render();
    };
    return;
  }

  els.detailPanel.innerHTML = `<p class="muted">请选择一个规则或智能体。</p>`;
}

function renderPreview() {
  els.previewBox.textContent = JSON.stringify(
    {
      lifecycle: [
        "START",
        ...state.rules.map((item) => item.id),
        "END",
      ],
      selected: state.selectedId,
      rules: state.rules.length,
      agents: state.agents.length,
    },
    null,
    2
  );
}

function openModal(type) {
  els.modal.classList.remove("hidden");
  els.modalTitle.textContent = type === "agent" ? "新建智能体" : "新建规则";
  els.formType.value = type;
  els.formName.value = "";
  els.formInput.value = "";
  els.formOutput.value = "";
}

function closeModal() {
  els.modal.classList.add("hidden");
}

document.getElementById("newRuleBtn").onclick = () => openModal("rule");
document.getElementById("addAgentBtn").onclick = () => openModal("agent");
document.getElementById("closeModal").onclick = closeModal;
document.getElementById("cancelModal").onclick = closeModal;
document.getElementById("modal").onclick = (event) => {
  if (event.target.id === "modal") closeModal();
};

document.getElementById("confirmModal").onclick = () => {
  const item = {
    id: els.formName.value.trim() || `item_${Date.now()}`,
    name: els.formName.value.trim() || "unnamed",
    type: els.formType.value,
    status: "draft",
    input: els.formInput.value.trim() || "str / 待填写",
    output: els.formOutput.value.trim() || "str / 待填写",
    desc: "新建条目",
  };

  if (item.type === "agent") {
    state.agents.unshift({ id: item.id, name: item.name, desc: item.desc });
  } else {
    state.rules.unshift(item);
  }

  state.selectedId = item.id;
  state.selectedType = item.type;
  closeModal();
  render();
};

document.getElementById("saveBtn").onclick = () => {
  localStorage.setItem("creatharness-ui-state", JSON.stringify(state));
  alert("已保存草稿");
};

const saved = localStorage.getItem("creatharness-ui-state");
if (saved) {
  try {
    const parsed = JSON.parse(saved);
    Object.assign(state, parsed);
  } catch {}
}

render();
