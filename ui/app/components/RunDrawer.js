"use client";

function formatRunContent(value) {
  if (typeof value === "string") return value;
  if (value == null) return "";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export default function RunDrawer({
  open,
  onClose,
  runPreparing,
  runLoading,
  runReady,
  runMessages,
  runError,
  runInput,
  setRunInput,
  submitRun,
  lastRunSummary,
  validationErrors,
}) {
  if (!open) return null;

  return (
    <aside className="run-drawer">
      <div className="section-head compact">
        <div>
          <div className="run-kicker">LIVE WORKFLOW</div>
          <h2>运行对话</h2>
        </div>
        <button className="icon-btn" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="run-status">
        <span className={`run-status-dot ${runLoading || runPreparing ? "busy" : ""}`} />
        {runPreparing
          ? "正在重新读取图和状态 YAML..."
          : runLoading
            ? "生命周期运行中..."
            : runReady
              ? "已连接当前生命周期"
              : "等待装配当前图"}
      </div>

      {lastRunSummary ? (
        <div className="run-summary-card">
          <div className="run-summary-title">本次图信息</div>
          <div className="run-summary-grid">
            <div className="summary-item">
              <span>入口</span>
              <strong>{lastRunSummary.entryName || lastRunSummary.entrypoint || "-"}</strong>
            </div>
            <div className="summary-item">
              <span>出口</span>
              <strong>{lastRunSummary.exitName || lastRunSummary.exitpoint || "-"}</strong>
            </div>
            <div className="summary-item">
              <span>节点数</span>
              <strong>{lastRunSummary.nodeCount}</strong>
            </div>
            <div className="summary-item">
              <span>连线数</span>
              <strong>{lastRunSummary.edgeCount}</strong>
            </div>
          </div>
          {lastRunSummary.pathPreview?.length ? (
            <div className="run-path-preview">
              <div className="run-summary-subtitle">主链路预览</div>
              <div className="path-chip-list">
                {lastRunSummary.pathPreview.map((name) => (
                  <span key={name} className="path-chip">
                    {name}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {validationErrors.length ? (
        <div className="run-validation-card">
          <div className="run-summary-title">运行前校验</div>
          <div className="validation-list">
            {validationErrors.map((message, index) => (
              <div className="validation-item" key={`${message}-${index}`}>
                {message}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="run-messages">
        {runMessages.length === 0 ? (
          <div className="run-empty">输入一条消息，运行当前编排中的完整节点流程。</div>
        ) : (
          runMessages.map((message, index) => (
            <div className={`run-message ${message.role}`} key={`${message.role}-${index}`}>
              <div className="run-message-role">
                {message.role === "user" ? "你" : "生命周期"}
              </div>
              <div className="run-message-content">{formatRunContent(message.content)}</div>
            </div>
          ))
        )}
      </div>

      {runError ? <div className="run-error">{runError}</div> : null}

      <form
        className="run-composer"
        onSubmit={(event) => {
          event.preventDefault();
          submitRun();
        }}
      >
        <textarea
          value={runInput}
          onChange={(event) => setRunInput(event.target.value)}
          placeholder="例如：我要点毛肚、牛肉和白菜"
          rows="3"
          disabled={runLoading}
        />
        <button
          className="primary-btn"
          type="submit"
          disabled={runLoading || runPreparing || !runReady || !runInput.trim()}
        >
          {runLoading ? "运行中..." : "提交"}
        </button>
      </form>
    </aside>
  );
}
