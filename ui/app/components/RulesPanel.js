"use client";

export default function RulesPanel({
  ruleGroups,
  rulesLoading,
  rulesError,
  selectedRule,
  selectedRuleId,
  setSelectedRuleId,
  setRuleModalOpen,
  deleteRule,
  codeDraft,
  setCodeDraft,
  saveRuleCode,
  codeSaving,
  typeLabelMap,
  ruleSearch,
  setRuleSearch,
  hasUnsavedCode,
}) {
  return (
    <section className="rule-workspace">
      <div className="rule-list-panel">
        <div className="rule-toolbar">
          <div className="panel-title">组件列表</div>
          <button className="secondary-btn" onClick={() => setRuleModalOpen(true)}>
            + 新建规则
          </button>
        </div>
        <div className="filter-toolbar">
          <input
            className="filter-input"
            value={ruleSearch}
            onChange={(event) => setRuleSearch(event.target.value)}
            placeholder="搜索组件名、描述、类型"
          />
        </div>
        {rulesLoading ? <div className="panel-card">正在读取规则...</div> : null}
        {rulesError ? (
          <div className="panel-card" style={{ color: "#ff9aa6" }}>
            {rulesError}
          </div>
        ) : null}
        {ruleGroups.map((group) => (
          <div className="rule-group" key={group.category}>
            <div className="rule-group-title">
              <span>{group.title}</span>
              <span className="rule-group-count">{group.items.length}</span>
            </div>
            <div className="card-list">
              {group.items.length ? (
                group.items.map((rule) => (
                  <div
                    key={rule.id}
                    className={`item-card ${selectedRuleId === rule.id ? "active" : ""}`}
                    onClick={() => setSelectedRuleId(rule.id)}
                  >
                    <div className="item-name-row">
                      <div className="item-name">{rule.name}</div>
                      <div className="item-category-tag">
                        {typeLabelMap[rule.category] || rule.category}
                      </div>
                    </div>
                    <div className="item-description">
                      {rule.protocol?.descript ||
                        rule.protocol?.description ||
                        "暂无组件描述"}
                    </div>
                    <div className="item-meta">
                      {rule.protocol?.input?.type || "str"} {"->"}{" "}
                      {rule.protocol?.output?.type || "str"}
                    </div>
                  </div>
                ))
              ) : (
                <div className="panel-card">当前没有匹配的 {group.title}。</div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="rule-detail-panel">
        {selectedRule ? (
          <div className="detail-card rule-detail">
            <div className="section-head compact">
              <div>
                <div className="detail-kicker">
                  {typeLabelMap[selectedRule.category] || selectedRule.category}
                </div>
                <h2>{selectedRule.name}</h2>
              </div>
              <button className="secondary-btn" onClick={() => deleteRule(selectedRule.id)}>
                删除组件
              </button>
            </div>
            <div className="detail-row">
              <label>
                文件路径
                <input value={selectedRule.toolPath || "未找到实现文件"} readOnly />
              </label>
            </div>
            <div className="detail-row">
              <label>
                函数描述
                <textarea rows="3" value={selectedRule.protocol?.descript || ""} readOnly />
              </label>
            </div>
            <div className="detail-two-col">
              <div className="detail-row">
                <label>
                  输入类型
                  <input value={selectedRule.protocol?.input?.type || ""} readOnly />
                </label>
              </div>
              <div className="detail-row">
                <label>
                  输出类型
                  <input value={selectedRule.protocol?.output?.type || ""} readOnly />
                </label>
              </div>
            </div>
            <div className="detail-two-col">
              <div className="detail-row">
                <label>
                  输入说明
                  <textarea
                    rows="3"
                    value={selectedRule.protocol?.input?.description || ""}
                    readOnly
                  />
                </label>
              </div>
              <div className="detail-row">
                <label>
                  输出说明
                  <textarea
                    rows="3"
                    value={selectedRule.protocol?.output?.description || ""}
                    readOnly
                  />
                </label>
              </div>
            </div>
            <div className="detail-row">
              <label>
                完整协议
                <textarea rows="12" value={JSON.stringify(selectedRule.protocol, null, 2)} readOnly />
              </label>
            </div>
            <div className="detail-row">
              <label>
                组件代码
                <textarea
                  className="code-editor"
                  rows="20"
                  value={codeDraft}
                  onChange={(event) => setCodeDraft(event.target.value)}
                  spellCheck={false}
                />
              </label>
            </div>
            <div className="detail-row detail-actions detail-actions-inline">
              {hasUnsavedCode ? <span className="unsaved-chip">有未保存修改</span> : null}
              <button
                className="primary-btn"
                onClick={saveRuleCode}
                disabled={codeSaving || !selectedRule.toolPath}
              >
                {codeSaving ? "保存中..." : "保存组件代码"}
              </button>
            </div>
          </div>
        ) : (
          <div className="panel-card">请选择一个组件。</div>
        )}
      </div>
    </section>
  );
}
