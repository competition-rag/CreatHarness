"""Run the assembled Agent."""

import contextlib
import json
from os import environ
from pathlib import Path
import sys
from uuid import uuid4

from graph_runtime import build_graph


def _sanitize_text(value: str) -> str:
    """Replace invalid UTF-16 surrogate code points before network/file I/O."""
    return "".join(
        character if not 0xD800 <= ord(character) <= 0xDFFF else "\ufffd"
        for character in str(value)
    )


def _load_project_env() -> None:
    env_path = Path(__file__).resolve().parents[2] / ".env"
    if not env_path.is_file():
        return
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key:
            environ.setdefault(key, value)


def _run_once(graph, user_input: str):
    return graph._runtime_manager.invoke(
        graph,
        {"input_text": user_input},
    )


def _worker() -> None:
    """Keep one compiled graph alive and serve newline-delimited JSON requests."""
    _load_project_env()
    lifecycle_path = Path(__file__).parent / "lifecycle.yaml"
    graph = None
    graph_signature = None

    stdin = getattr(sys.stdin, "buffer", sys.stdin)
    for raw_line in stdin:
        if isinstance(raw_line, bytes):
            line = raw_line.decode("utf-8", errors="replace").strip()
        else:
            line = raw_line.strip()
        if not line:
            continue

        try:
            request = json.loads(line)
            request_id = request.get("id")
            user_input = _sanitize_text(request.get("input") or "").strip()
            if not user_input:
                raise ValueError("请输入要发送的内容。")

            current_signature = lifecycle_path.stat().st_mtime_ns
            if graph is None or graph_signature != current_signature:
                print("[生命周期] 初始化 LangGraph", file=sys.stderr, flush=True)
                with contextlib.redirect_stdout(sys.stderr):
                    graph = build_graph(lifecycle_path)
                graph_signature = current_signature

            with contextlib.redirect_stdout(sys.stderr):
                result = _run_once(graph, user_input)

            print(
                json.dumps(
                    {
                        "id": request_id,
                        "ok": True,
                        "answer": result.get("final_answer", result),
                    },
                    # Escape non-ASCII characters so unpaired surrogates cannot
                    # break UTF-8 encoding on the worker protocol stream.
                    ensure_ascii=True,
                ),
                flush=True,
            )
        except Exception as error:
            print(
                json.dumps(
                    {
                        "id": request.get("id") if "request" in locals() else None,
                        "ok": False,
                        "error": _sanitize_text(error),
                    },
                    ensure_ascii=True,
                ),
                flush=True,
            )


def main() -> None:
    _load_project_env()
    if "--worker" in sys.argv:
        _worker()
        return

    user_input = " ".join(sys.argv[1:]).strip()
    if not user_input:
        user_input = input("请输入问题：").strip()

    print("[生命周期] 开始", flush=True)
    graph = build_graph(Path(__file__).parent / "lifecycle.yaml")
    result = _run_once(graph, user_input)
    print("[生命周期] 结束", flush=True)
    print(result.get("final_answer", result))


if __name__ == "__main__":
    main()
