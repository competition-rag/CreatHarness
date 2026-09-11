"use client";

export default function InspectorDrawer({
  open,
  inspectorResizing,
  inspectorWidth,
  startInspectorResize,
  onClose,
  selectedNode,
  selectedNodeRule,
  codeDraft,
  setCodeDraft,
  saveNodeCode,
  codeSaving,
  deleteNode,
  systemUserInputId,
  describeIOConfig,
  nodeValidationErrors,
  incomingCount,
  outgoingCount,
  hasUnsavedCode,
}) {
  if (!open) return null;

  return (
    <aside
      className={`inspector-drawer inspector-drawer-open ${inspectorResizing ? "is-resizing" : ""}`}
      style={{ "--inspector-width": `${inspectorWidth}px` }}
    >
      <button
        className="inspector-resize-handle"
        type="button"
        aria-label="调整节点详情抽屉宽度"
        title="拖动调整宽度"
        onPointerDown={startInspectorResize}
      >
        <span />
      </button>
      <div className="section-head compact">
        <h2>节点详情</h2>
        <button className="icon-btn" onClick={onClose}>
          ×
        </button>
      </div>
      {selectedNode ? (
        <>
          {nodeValidationErrors.length ? (
            <div className="node-validation-card">
              <div className="run-summary-title">当前节点问题</div>
              <div className="validation-list">
                {nodeValidationErrors.map((message, index) => (
                  <div className="validation-item" key={`${message}-${index}`}>
                    {message}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <div className="detail-row">
            <label>
              名称
              <input value={selectedNode.name} readOnly />
            </label>
          </div>
          <div className="detail-two-col">
            <div className="detail-row">
              <label>
                类型
                <input value={selectedNode.type} readOnly />
              </label>
            </div>
            <div className="detail-row">
              <label>
                连接统计
                <input value={`输入 ${incomingCount} / 输出 ${outgoingCount}`} readOnly />
              </label>
            </div>
          </div>
          <div className="detail-row">
            <label>
              Handler
              <input value={selectedNode.handler || ""} readOnly />
            </label>
          </div>
          <div className="detail-two-col">
            <div className="detail-row">
              <label>
                输入
                <input
                  value={`${describeIOConfig(selectedNode.input)}${selectedNode.input?.type ? ` (${selectedNode.input.type})` : ""}`}
                  readOnly
                />
              </label>
            </div>
            <div className="detail-row">
              <label>
                输出
                <input
                  value={`${describeIOConfig(selectedNode.output)}${selectedNode.output?.type ? ` (${selectedNode.output.type})` : ""}`}
                  readOnly
                />
              </label>
            </div>
          </div>
          <div className="detail-row">
            <label>
              说明
              <textarea rows="4" value={selectedNode.description || ""} readOnly />
            </label>
          </div>
          {selectedNodeRule ? (
            <>
              <div className="detail-row">
                <label>
                  对应组件文件
                  <input value={selectedNodeRule.toolPath || "未找到实现文件"} readOnly />
                </label>
              </div>
              <div className="detail-row">
                <label>
                  组件完整代码
                  <textarea
                    className="code-editor"
                    rows="18"
                    value={codeDraft}
                    onChange={(event) => setCodeDraft(event.target.value)}
                    spellCheck={false}
                  />
                </label>
              </div>
              <div className="detail-row detail-actions detail-actions-inline">
                {hasUnsavedCode ? <span className="unsaved-chip">有未保存修改</span> : null}
                <button className="primary-btn" onClick={saveNodeCode} disabled={codeSaving}>
                  {codeSaving ? "保存中..." : "保存组件代码"}
                </button>
              </div>
            </>
          ) : (
            <div className="detail-row">
              <p className="muted">该节点没有匹配到组件实现文件。</p>
            </div>
          )}
          <div className="detail-row">
            <button
              className="secondary-btn"
              onClick={() => deleteNode(selectedNode.id)}
              disabled={selectedNode.id === systemUserInputId}
            >
              删除节点
            </button>
          </div>
        </>
      ) : (
        <p className="muted">请选择一个节点。</p>
      )}
    </aside>
  );
}
