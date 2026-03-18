#!/usr/bin/env python3
"""Manage role-scoped agent sessions and headless execution for this repo."""

from __future__ import annotations

import argparse
import contextlib
import os
import json
import re
import selectors
import shutil
import subprocess
import sys
import time
from collections import deque
from concurrent.futures import FIRST_COMPLETED, Future, ThreadPoolExecutor, wait
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4


REPO_ROOT = Path(__file__).resolve().parent.parent
AGENTS_DIR = REPO_ROOT / "agents"
STATE_DIR = REPO_ROOT / ".agent-manager"
DEFAULT_STATE_FILE = STATE_DIR / "state.json"
LOCKS_DIR = STATE_DIR / "locks"

HOT_PATHS = [
    "src/main.ts",
    "src/plans",
    "src/tasks",
    "src/spawner",
]

CORE_ROLES = [
    "technical-architect",
    "economy-engineer",
    "operations-engineer",
]


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {"current_session": None, "sessions": {}}
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def save_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, sort_keys=True)
        handle.write("\n")


def discover_roles() -> list[str]:
    roles: list[str] = []
    for entry in sorted(AGENTS_DIR.iterdir()):
        if entry.is_dir() and (entry / "role.md").exists():
            roles.append(entry.name)
    return roles


def parse_bullet_items(path: Path) -> list[str]:
    return [content for content, _, _ in parse_bullet_blocks(path)]


def parse_bullet_blocks(path: Path) -> list[tuple[str, int, int]]:
    if not path.exists():
        return []
    lines = path.read_text(encoding="utf-8").splitlines()
    return parse_bullet_blocks_from_lines(lines)


def parse_bullet_blocks_from_lines(lines: list[str]) -> list[tuple[str, int, int]]:
    blocks: list[tuple[str, int, int]] = []
    current_start: int | None = None
    current_parts: list[str] = []

    def flush(end_index: int) -> None:
        nonlocal current_start, current_parts
        if current_start is None:
            return
        value = " ".join(part.strip() for part in current_parts if part.strip()).strip()
        if value and value.lower() != "none":
            blocks.append((value, current_start, end_index))
        current_start = None
        current_parts = []

    for index, raw_line in enumerate(lines):
        stripped = raw_line.strip()
        if raw_line.startswith("- "):
            flush(index)
            current_start = index
            current_parts = [raw_line[2:].strip()]
            continue
        if current_start is not None:
            if stripped:
                current_parts.append(stripped)
            else:
                current_parts.append("")
    flush(len(lines))
    return blocks


def remove_bullet_item(path: Path, value: str) -> str | None:
    if not path.exists():
        return None

    lines = path.read_text(encoding="utf-8").splitlines()
    blocks = parse_bullet_blocks(path)
    target: tuple[int, int, str] | None = None
    for content, start, end in blocks:
        if content == value:
            target = (start, end, content)
            break
    if target is None:
        return None

    start, end, content = target
    remaining_lines = lines[:start] + lines[end:]
    while remaining_lines and remaining_lines[-1] == "":
        remaining_lines.pop()
    body = "\n".join(remaining_lines).rstrip()
    if parse_bullet_blocks_from_lines(remaining_lines):
        path.write_text(body + "\n", encoding="utf-8")
    else:
        prefix = body if body else "# Inbox"
        path.write_text(prefix + "\n\n- none\n", encoding="utf-8")
    return content
def archive_done_item(role: str, value: str) -> None:
    done_path = role_dir(role) / "done.md"
    if done_path.exists():
        current = done_path.read_text(encoding="utf-8").rstrip()
    else:
        current = "# Done"
    entry = f"- {utc_now()}: {value}"
    done_path.write_text(f"{current}\n\n{entry}\n", encoding="utf-8")


def parse_task_board_ready_now(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}

    ready: dict[str, str] = {}
    in_ready_section = False
    current_role: str | None = None
    current_parts: list[str] = []

    def flush() -> None:
        nonlocal current_role, current_parts
        if current_role and current_parts:
            ready[current_role] = " ".join(part.strip() for part in current_parts if part.strip())
        current_role = None
        current_parts = []

    role_names = set(discover_roles())
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        stripped = raw_line.strip()
        if stripped == "## Ready now":
            in_ready_section = True
            continue
        if in_ready_section and stripped.startswith("## "):
            flush()
            break
        if not in_ready_section:
            continue
        if stripped.startswith("- "):
            flush()
            body = stripped[2:].strip()
            match = re.match(r"([a-z0-9-]+):\s*(.+)", body)
            if match and match.group(1) in role_names:
                current_role = match.group(1)
                current_parts.append(match.group(2))
            continue
        if current_role and stripped:
            current_parts.append(stripped)
    flush()
    return ready


def role_dir(role: str) -> Path:
    path = AGENTS_DIR / role
    if not (path / "role.md").exists():
        available = ", ".join(discover_roles())
        raise SystemExit(f"Unknown role '{role}'. Available roles: {available}")
    return path


def create_session_name(prefix: str | None = None) -> str:
    base = datetime.now().strftime("%Y%m%d-%H%M%S")
    suffix = uuid4().hex[:6]
    if prefix:
        return f"{prefix}-{base}-{suffix}"
    return f"session-{base}-{suffix}"


def ensure_session(state: dict[str, Any], requested: str | None, prefix: str | None = None) -> tuple[str, bool]:
    if requested:
        if requested not in state["sessions"]:
            raise SystemExit(f"Session '{requested}' does not exist.")
        state["current_session"] = requested
        return requested, False

    current = state.get("current_session")
    if current and current in state["sessions"]:
        return current, False

    session_id = create_session_name(prefix)
    state["current_session"] = session_id
    state["sessions"][session_id] = {
        "created_at": utc_now(),
        "assignments": {},
    }
    return session_id, True


@dataclass
class Assignment:
    role: str
    task: str
    assigned_at: str
    source: str
    status: str
    last_launch_at: str | None = None
    last_run: dict[str, Any] | None = None


@dataclass
class RunResult:
    role: str
    provider: str
    exit_code: int
    prompt_path: Path
    output_path: Path
    meta_path: Path
    dry_run: bool = False
    provider_session_id: str | None = None

    @property
    def status(self) -> str:
        if self.dry_run:
            return "dry-run"
        return "completed" if self.exit_code == 0 else "failed"


@dataclass
class RoleLock:
    role: str
    path: Path

    def release(self) -> None:
        if self.path.exists():
            self.path.unlink()


def get_assignment(state: dict[str, Any], session_id: str, role: str) -> Assignment | None:
    raw = state["sessions"][session_id]["assignments"].get(role)
    if not raw:
        return None
    return Assignment(
        role=role,
        task=raw["task"],
        assigned_at=raw["assigned_at"],
        source=raw.get("source", "manual"),
        status=raw.get("status", "queued"),
        last_launch_at=raw.get("last_launch_at"),
        last_run=raw.get("last_run"),
    )


def put_assignment(state: dict[str, Any], session_id: str, role: str, task: str, source: str) -> Assignment:
    current = state["sessions"][session_id]["assignments"].get(role, {})
    assignment = {
        "task": task.strip(),
        "assigned_at": utc_now(),
        "last_launch_at": current.get("last_launch_at"),
        "last_run": current.get("last_run"),
        "source": source,
        "status": "queued",
    }
    state["sessions"][session_id]["assignments"][role] = assignment
    return Assignment(
        role=role,
        task=assignment["task"],
        assigned_at=assignment["assigned_at"],
        source=assignment["source"],
        status=assignment["status"],
        last_launch_at=assignment["last_launch_at"],
        last_run=assignment["last_run"],
    )


def update_assignment_status(
    state: dict[str, Any],
    session_id: str,
    role: str,
    *,
    status: str,
    run_data: dict[str, Any] | None = None,
    launched: bool = False,
) -> None:
    item = state["sessions"][session_id]["assignments"][role]
    item["status"] = status
    if run_data is not None:
        item["last_run"] = run_data
    if launched:
        item["last_launch_at"] = utc_now()


def build_prompt(role: str, task: str, extra_files: list[str], active_roles: list[str] | None = None) -> str:
    agent_path = role_dir(role)
    foundational_paths = [
        REPO_ROOT / "README.md",
        REPO_ROOT / "AGENTS.md",
        REPO_ROOT / "docs" / "agents" / "REPO_MAP.md",
        REPO_ROOT / "docs" / "agents" / "SCREEPS_PRIMER.md",
        REPO_ROOT / "docs" / "agent-workflow.md",
        AGENTS_DIR / "orchestrator.md",
        agent_path / "role.md",
        agent_path / "backlog.md",
        agent_path / "history.md",
    ]

    preloaded_context = ""
    for path in foundational_paths:
        if path.exists():
            rel_path = path.relative_to(REPO_ROOT)
            content = path.read_text(encoding="utf-8")
            preloaded_context += f"\n--- FILE: {rel_path} ---\n{content}\n"

    resolved_extras = []
    extra_context = ""
    for path_str in extra_files:
        path = REPO_ROOT / path_str
        if path.exists():
            resolved_extras.append(str(path.resolve()))
            rel_path = path.relative_to(REPO_ROOT)
            content = path.read_text(encoding="utf-8")
            extra_context += f"\n--- EXTRA FILE: {rel_path} ---\n{content}\n"

    concurrency_context = ""
    if active_roles and len(active_roles) > 1:
        others = sorted([r for r in active_roles if r != role])
        concurrency_context = (
            "\n# CONCURRENCY ADVISORY\n"
            f"You are running in parallel with these other agents: {', '.join(others)}.\n"
            "Be extremely cautious when modifying shared files. Use surgical edits and verify that your changes do not conflict with concurrent work.\n"
        )

    hot_path_list = "\n".join([f"- {path}" for path in HOT_PATHS])
    hot_path_context = (
        "\n# SHARED HOT PATHS\n"
        "The following paths are considered high-conflict areas. Avoid modifying them unless your task explicitly requires it:\n"
        f"{hot_path_list}\n"
    )

    return f"""You are the {role} agent for the Screeps AI workspace.

# SYSTEM CONTEXT
- Repository Root: {REPO_ROOT}
- Role Directory: {agent_path}
- Runtime: You are executing headlessly via the Gemini CLI in autonomous mode.
- Tooling: You have access to standard filesystem and shell tools. Use absolute paths for all file operations to ensure correctness across the repo.
- Persistence: Treat {agent_path} as your long-term memory. Record history, assumptions, and state there.

# PRE-LOADED CONTEXT
The following foundational files have been provided to you directly in this prompt. Use them to understand your role, the repository structure, and the system workflows:
{preloaded_context}
{extra_context}
{concurrency_context}
{hot_path_context}

# TASK
{task}

# CONSTRAINTS & BEHAVIOR
- **Action-First**: Your goal is to deliver functional, verified code. Do not just discuss or plan; implement the changes. You are a senior engineer with full autonomy to modify files in your ownership area.
- **End-to-End Delivery**: Work the task end to end, making the repo edits or doc updates that your role owns.
- **Source of Truth**: Keep shared design truth in docs/ and structured content in data/ when the task requires updates there.
- **Persistence**: Do not overwrite another agent's history.md. Record decisions, assumptions, and follow-ups in your own role files.
- **Collaboration**: If you need another role to act, draft a concrete request in that role's inbox.md using the 'inbox draft' command format if possible, or just edit the file.
- **Completion**: End with a concise completion summary that states what changed, what is still open, and whether a handoff was created.
"""


def acquire_role_lock(role: str, session_id: str) -> RoleLock:
    LOCKS_DIR.mkdir(parents=True, exist_ok=True)
    path = LOCKS_DIR / f"{role}.lock"
    payload = {
        "role": role,
        "session_id": session_id,
        "locked_at": utc_now(),
        "pid": os.getpid(),
    }
    try:
        fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    except FileExistsError as exc:
        details = ""
        try:
            current = json.loads(path.read_text(encoding="utf-8"))
            details = (
                f" Existing lock session={current.get('session_id')} "
                f"pid={current.get('pid')} locked_at={current.get('locked_at')}."
            )
        except Exception:
            details = ""
        raise SystemExit(
            f"Role '{role}' is already running in another process.{details}"
        ) from exc

    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=2, sort_keys=True)
            handle.write("\n")
    except Exception:
        if path.exists():
            path.unlink()
        raise
    return RoleLock(role=role, path=path)


@contextlib.contextmanager
def held_role_lock(role: str, session_id: str) -> Any:
    lock = acquire_role_lock(role, session_id)
    try:
        yield lock
    finally:
        lock.release()


def resolve_auto_task(role: str) -> tuple[str, str]:
    inbox_items = parse_bullet_items(role_dir(role) / "inbox.md")
    if inbox_items:
        return f"inbox:{role}", inbox_items[0]

    ready_now = parse_task_board_ready_now(AGENTS_DIR / "task-board.md")
    if role in ready_now:
        return "task-board", ready_now[role]

    backlog_items = parse_bullet_items(role_dir(role) / "backlog.md")
    if backlog_items:
        return f"backlog:{role}", backlog_items[0]

    raise SystemExit(f"No inbox, task-board, or backlog work found for role '{role}'.")


def try_resolve_auto_task(role: str) -> tuple[str, str] | None:
    try:
        return resolve_auto_task(role)
    except SystemExit:
        return None


def resolve_provider(name: str) -> str:
    if name != "auto":
        return name
    if shutil.which("gemini"):
        return "gemini"
    if shutil.which("codex"):
        return "codex"
    if shutil.which("claude"):
        return "claude"
    raise SystemExit("No supported agent CLI found. Install gemini, codex or claude.")


def run_dir_for(session_id: str, role: str) -> Path:
    return STATE_DIR / "runs" / session_id / role


def write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def git_status_paths() -> set[str]:
    completed = subprocess.run(
        ["git", "status", "--short"],
        cwd=REPO_ROOT,
        text=True,
        capture_output=True,
        check=True,
    )
    paths: set[str] = set()
    for line in completed.stdout.splitlines():
        if not line.strip():
            continue
        body = line[3:] if len(line) > 3 else line
        if " -> " in body:
            body = body.split(" -> ", 1)[1]
        paths.add(body.strip())
    return paths


def make_commit_message(role: str, task: str) -> str:
    normalized = " ".join(task.strip().split())
    if len(normalized) > 72:
        normalized = normalized[:69].rstrip() + "..."
    return f"agent({role}): {normalized}"


def auto_commit_task(role: str, task: str, before_paths: set[str]) -> dict[str, Any]:
    after_paths = git_status_paths()
    new_paths = sorted(after_paths - before_paths)
    overlapped_paths = sorted(after_paths & before_paths)

    if not new_paths:
        return {
            "status": "skipped",
            "reason": "no-new-paths",
            "paths": [],
            "overlap": overlapped_paths,
        }

    if overlapped_paths:
        return {
            "status": "skipped",
            "reason": "preexisting-dirty-paths",
            "paths": new_paths,
            "overlap": overlapped_paths,
        }

    add_command = ["git", "add", "--"] + new_paths
    subprocess.run(add_command, cwd=REPO_ROOT, check=True, text=True, capture_output=True)

    message = make_commit_message(role, task)
    commit = subprocess.run(
        ["git", "commit", "-m", message],
        cwd=REPO_ROOT,
        text=True,
        capture_output=True,
    )
    if commit.returncode != 0:
        return {
            "status": "failed",
            "reason": "git-commit-failed",
            "paths": new_paths,
            "message": message,
            "stdout": commit.stdout,
            "stderr": commit.stderr,
        }

    return {
        "status": "committed",
        "paths": new_paths,
        "message": message,
        "stdout": commit.stdout,
    }


def build_codex_exec_command(
    role: str,
    prompt: str,
    output_path: Path,
    model: str | None,
    provider_session_id: str,
) -> list[str]:
    command = [
        "codex",
        "exec",
        "--cd",
        str(role_dir(role)),
        "--add-dir",
        str(REPO_ROOT),
        "--sandbox",
        "workspace-write",
        "--full-auto",
        "--ephemeral",
        "--output-last-message",
        str(output_path),
    ]
    if model:
        command.extend(["--model", model])
    command.append(prompt)
    return command


def build_claude_exec_command(
    role: str,
    prompt: str,
    output_path: Path,
    model: str | None,
    provider_session_id: str,
) -> list[str]:
    command = [
        "claude",
        "--print",
        "--output-format",
        "stream-json",
        "--include-partial-messages",
        "--permission-mode",
        "acceptEdits",
        "--no-session-persistence",
        "--session-id",
        provider_session_id,
        "--add-dir",
        str(REPO_ROOT),
    ]
    if model:
        command.extend(["--model", model])
    command.append(prompt)
    return command


def build_gemini_exec_command(
    role: str,
    prompt: str,
    output_path: Path,
    model: str | None,
    provider_session_id: str,
) -> list[str]:
    command = [
        "gemini",
        "--prompt",
        prompt,
        "--approval-mode",
        "yolo",
        "--include-directories",
        str(REPO_ROOT),
        "--output-format",
        "text",
    ]
    if model:
        command.extend(["--model", model])
    return command


def stream_process_output(role: str, process: subprocess.Popen[str], output_path: Path) -> str:
    selector = selectors.DefaultSelector()
    assert process.stdout is not None
    selector.register(process.stdout, selectors.EVENT_READ)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    chunks: list[str] = []
    last_activity = time.monotonic()
    heartbeat_after = 20.0

    with output_path.open("w", encoding="utf-8") as handle:
        while True:
            events = selector.select(timeout=1.0)
            if events:
                for key, _ in events:
                    line = key.fileobj.readline()
                    if line == "":
                        selector.unregister(key.fileobj)
                        break
                    chunks.append(line)
                    handle.write(line)
                    handle.flush()
                    sys.stdout.write(f"[{role}] {line}")
                    sys.stdout.flush()
                    last_activity = time.monotonic()
            if process.poll() is not None and not selector.get_map():
                break
            if time.monotonic() - last_activity >= heartbeat_after:
                heartbeat = f"[{role}] still running...\n"
                handle.write(heartbeat)
                handle.flush()
                sys.stdout.write(heartbeat)
                sys.stdout.flush()
                last_activity = time.monotonic()

    return "".join(chunks)


def execute_assignment(
    *,
    session_id: str,
    role: str,
    task: str,
    provider: str,
    extra_files: list[str],
    model: str | None,
    dry_run: bool,
    active_roles: list[str] | None = None,
) -> RunResult:
    prompt = build_prompt(role, task, extra_files, active_roles=active_roles)
    run_dir = run_dir_for(session_id, role)
    prompt_path = run_dir / "prompt.txt"
    output_path = run_dir / "output.txt"
    stream_path = run_dir / "stream.log"
    meta_path = run_dir / "meta.json"
    provider_session_id = str(uuid4())
    write_text(prompt_path, prompt)

    if provider == "codex":
        command = build_codex_exec_command(role, prompt, output_path, model, provider_session_id)
        cwd = REPO_ROOT
    elif provider == "claude":
        command = build_claude_exec_command(role, prompt, output_path, model, provider_session_id)
        cwd = role_dir(role)
    elif provider == "gemini":
        command = build_gemini_exec_command(role, prompt, output_path, model, provider_session_id)
        cwd = REPO_ROOT
    else:
        raise SystemExit(f"Unsupported provider '{provider}'.")

    meta = {
        "role": role,
        "provider": provider,
        "started_at": utc_now(),
        "command": command,
        "cwd": str(cwd),
        "prompt_path": str(prompt_path),
        "output_path": str(output_path),
        "stream_path": str(stream_path),
        "provider_session_id": provider_session_id,
    }

    if dry_run:
        meta["dry_run"] = True
        write_text(output_path, "")
        write_text(stream_path, "")
        write_text(meta_path, json.dumps(meta, indent=2, sort_keys=True) + "\n")
        return RunResult(
            role=role,
            provider=provider,
            exit_code=0,
            prompt_path=prompt_path,
            output_path=output_path,
            meta_path=meta_path,
            dry_run=True,
            provider_session_id=provider_session_id,
        )

    run_dir.mkdir(parents=True, exist_ok=True)
    process = subprocess.Popen(
        command,
        cwd=cwd,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        bufsize=1,
    )
    streamed_output = stream_process_output(role, process, stream_path)
    completed = process.wait()
    meta["streamed_output"] = streamed_output
    if provider in {"claude", "gemini"} and not output_path.exists():
        write_text(output_path, streamed_output)
    if provider == "codex" and not output_path.exists():
        write_text(output_path, "")

    meta["completed_at"] = utc_now()
    meta["exit_code"] = completed
    write_text(meta_path, json.dumps(meta, indent=2, sort_keys=True) + "\n")
    return RunResult(
        role=role,
        provider=provider,
        exit_code=completed,
        prompt_path=prompt_path,
        output_path=output_path,
        meta_path=meta_path,
        provider_session_id=provider_session_id,
    )


def summarize_output(path: Path, limit: int = 400) -> str:
    if not path.exists():
        return ""
    content = path.read_text(encoding="utf-8").strip()
    if len(content) <= limit:
        return content
    return content[:limit].rstrip() + "..."


def build_run_data(result: RunResult) -> dict[str, Any]:
    return {
        "provider": result.provider,
        "provider_session_id": result.provider_session_id,
        "exit_code": result.exit_code,
        "status": result.status,
        "completed_at": utc_now(),
        "output_path": str(result.output_path),
        "stream_path": str(result.output_path.parent / "stream.log"),
        "prompt_path": str(result.prompt_path),
        "meta_path": str(result.meta_path),
    }


def complete_assignment_queue_item(role: str, assignment: Assignment, dry_run: bool, exit_code: int) -> None:
    if dry_run or exit_code != 0:
        return
    if not assignment.source.startswith("inbox:"):
        return
    removed = remove_bullet_item(role_dir(role) / "inbox.md", assignment.task)
    if removed:
        archive_done_item(role, removed)


def ensure_assignment(
    state: dict[str, Any],
    session_id: str,
    role: str,
    selected_task: str | None,
    selected_source: str | None,
    force: bool,
) -> Assignment:
    assignment = get_assignment(state, session_id, role)
    if selected_task:
        if assignment and not force:
            raise SystemExit(
                f"Role '{role}' already has a task in session '{session_id}'. "
                "Use --force to replace it."
            )
        assignment = put_assignment(state, session_id, role, selected_task, selected_source or "manual")
    if not assignment:
        raise SystemExit(
            f"Role '{role}' has no assigned task in session '{session_id}'. "
            "Pass --task or --auto to assign one before launch."
        )
    return assignment


def refresh_auto_assignment(
    state: dict[str, Any],
    session_id: str,
    role: str,
    assignment: Assignment | None,
) -> tuple[Assignment | None, bool]:
    if assignment and assignment.status in {"queued", "running"}:
        return assignment, False

    resolved = try_resolve_auto_task(role)
    if not resolved:
        return assignment, False

    source, task = resolved
    if assignment and assignment.task == task and assignment.source == source:
        return assignment, False

    updated = put_assignment(state, session_id, role, task, source)
    return updated, True


def print_assignment_list(state: dict[str, Any], session_id: str) -> None:
    session = state["sessions"][session_id]
    assignments = session.get("assignments", {})
    if not assignments:
        print("Assignments: none")
        return
    print("Assignments:")
    for role in sorted(assignments):
        item = assignments[role]
        print(f"- {role}")
        print(f"  task: {item['task']}")
        print(f"  source: {item.get('source', 'manual')}")
        print(f"  status: {item.get('status', 'queued')}")
        print(f"  assigned_at: {item['assigned_at']}")
        if item.get("last_launch_at"):
            print(f"  last_launch_at: {item['last_launch_at']}")
        if item.get("last_run"):
            run = item["last_run"]
            print(f"  provider: {run.get('provider')}")
            if run.get("provider_session_id"):
                print(f"  provider_session_id: {run.get('provider_session_id')}")
            print(f"  exit_code: {run.get('exit_code')}")
            print(f"  output: {run.get('output_path')}")
            if run.get("stream_path"):
                print(f"  stream: {run.get('stream_path')}")
            if run.get("commit"):
                commit = run["commit"]
                print(f"  commit_status: {commit.get('status')}")
                if commit.get("message"):
                    print(f"  commit_message: {commit.get('message')}")


def cmd_roles(_: argparse.Namespace) -> int:
    for role in discover_roles():
        print(role)
    return 0


def cmd_queue(args: argparse.Namespace) -> int:
    state = load_json(args.state_file)
    session_id, created = ensure_session(state, args.session, prefix="auto")
    actionable: list[tuple[str, str, str, bool]] = []

    for role in discover_roles():
        existing = get_assignment(state, session_id, role)
        assignment, refreshed = refresh_auto_assignment(state, session_id, role, existing)
        if not assignment:
            continue
        actionable.append((role, assignment.source, assignment.task, refreshed or existing is None))

    save_json(args.state_file, state)

    print(f"{'Created' if created else 'Using'} session {session_id}")
    if not actionable:
        print("No actionable jobs found.")
        return 0

    print("Queue:")
    for role, source, task, is_new in actionable:
        status = "new" if is_new else "existing"
        print(f"- {role} [{status} via {source}]")
        print(f"  {task}")
    return 0


def cmd_pick(args: argparse.Namespace) -> int:
    role_dir(args.role)
    source, task = resolve_auto_task(args.role)
    print(f"Role: {args.role}")
    print(f"Source: {source}")
    print(f"Task: {task}")
    return 0


def append_inbox_item(target_role: str, message: str) -> None:
    inbox_path = role_dir(target_role) / "inbox.md"
    current = inbox_path.read_text(encoding="utf-8").rstrip()
    if current.endswith("- none"):
        current = current[: -len("- none")].rstrip()
    new_text = f"{current}\n\n- {message.strip()}\n"
    inbox_path.write_text(new_text, encoding="utf-8")


def cmd_inbox_draft(args: argparse.Namespace) -> int:
    role_dir(args.from_role)
    role_dir(args.to_role)
    message = f"From {args.from_role}: {args.message.strip()}"
    append_inbox_item(args.to_role, message)
    print(f"Drafted inbox item for {args.to_role}")
    return 0


def cmd_session_new(args: argparse.Namespace) -> int:
    state = load_json(args.state_file)
    session_id = create_session_name(args.name)
    state["current_session"] = session_id
    state["sessions"][session_id] = {"created_at": utc_now(), "assignments": {}}
    save_json(args.state_file, state)
    print(session_id)
    return 0


def cmd_session_status(args: argparse.Namespace) -> int:
    state = load_json(args.state_file)
    session_id, created = ensure_session(state, args.session)
    if created:
        save_json(args.state_file, state)
    print(f"Session: {session_id}")
    print(f"Created: {state['sessions'][session_id]['created_at']}")
    print_assignment_list(state, session_id)
    return 0


def cmd_assign(args: argparse.Namespace) -> int:
    role_dir(args.role)
    state = load_json(args.state_file)
    session_id, created = ensure_session(state, args.session)
    existing = get_assignment(state, session_id, args.role)
    selected_task = args.task
    selected_source = "manual"
    if args.auto and not selected_task:
        selected_source, selected_task = resolve_auto_task(args.role)
    if existing and not args.force:
        raise SystemExit(
            f"Role '{args.role}' already has a task in session '{session_id}'. "
            "Use --force to replace it."
        )
    assignment = put_assignment(state, session_id, args.role, selected_task, selected_source)
    save_json(args.state_file, state)
    if created:
        print(f"Created session {session_id}")
    print(f"Assigned {assignment.role} in {session_id}")
    return 0


def cmd_launch(args: argparse.Namespace) -> int:
    state = load_json(args.state_file)
    session_id, created = ensure_session(state, args.session)

    selected_task = args.task
    selected_source = "manual"
    if args.auto and not selected_task:
        selected_source, selected_task = resolve_auto_task(args.role)

    assignment = ensure_assignment(state, session_id, args.role, selected_task, selected_source, args.force)
    provider = resolve_provider(args.provider)
    with held_role_lock(args.role, session_id):
        pre_run_paths = git_status_paths() if args.auto_commit and not args.dry_run else set()
        update_assignment_status(state, session_id, args.role, status="running", launched=True)
        save_json(args.state_file, state)

        result = execute_assignment(
            session_id=session_id,
            role=args.role,
            task=assignment.task,
            provider=provider,
            extra_files=args.file or [],
            model=args.model,
            dry_run=args.dry_run,
            active_roles=[args.role],
        )

        run_data = build_run_data(result)
        if args.auto_commit and result.exit_code == 0 and not args.dry_run:
            run_data["commit"] = auto_commit_task(args.role, assignment.task, pre_run_paths)
        update_assignment_status(state, session_id, args.role, status=result.status, run_data=run_data)
        save_json(args.state_file, state)

    if created:
        print(f"Created session {session_id}")
    print(f"Session: {session_id}")
    print(f"Role: {args.role}")
    print(f"Provider: {provider}")
    print(f"Status: {result.status}")
    print(f"Exit code: {result.exit_code}")
    print(f"Output: {result.output_path}")
    print(f"Stream: {result.output_path.parent / 'stream.log'}")
    print(f"Provider session: {result.provider_session_id}")
    summary = summarize_output(result.output_path)
    if summary:
        print("Summary:")
        print(summary)
    if run_data.get("commit"):
        print("Commit:")
        print(json.dumps(run_data["commit"], indent=2, sort_keys=True))
    return 0 if result.exit_code == 0 else result.exit_code


def cmd_process(args: argparse.Namespace) -> int:
    if args.max_parallel < 1:
        raise SystemExit("--max-parallel must be at least 1.")

    state = load_json(args.state_file)
    session_id, created = ensure_session(state, args.session, prefix="auto")

    queued_roles: list[str] = []
    for role in discover_roles():
        if args.roles and role not in args.roles:
            continue
        assignment = get_assignment(state, session_id, role)
        assignment, _ = refresh_auto_assignment(state, session_id, role, assignment)
        if not assignment:
            continue
        if assignment.status == "completed" and not args.rerun_completed:
            continue
        queued_roles.append(role)

    save_json(args.state_file, state)
    print(f"{'Created' if created else 'Using'} session {session_id}")
    if not queued_roles:
        print("No roles to process.")
        return 0

    core_running = [r for r in queued_roles if r in CORE_ROLES]
    if args.max_parallel > 1 and len(core_running) > 1:
        print(f"\n!!! WARNING: Multiple core roles running in parallel: {', '.join(core_running)}")
        print("!!! This may lead to race conditions in high-conflict areas like src/main.ts.")
        if not args.dry_run:
            print("!!! Consider using --dry-run first to verify the plan.")

    if args.max_parallel > 1 and args.auto_commit:
        raise SystemExit("Parallel processing requires --no-auto-commit to avoid cross-role git races.")

    provider = resolve_provider(args.provider)
    failures = 0
    assignments: dict[str, Assignment] = {}
    with contextlib.ExitStack() as stack:
        for role in queued_roles:
            stack.enter_context(held_role_lock(role, session_id))
            assignment = get_assignment(state, session_id, role)
            assert assignment is not None
            assignments[role] = assignment

        if args.max_parallel <= 1:
            pending_roles = deque(queued_roles)
            while pending_roles:
                role = pending_roles.popleft()
                assignment = assignments[role]
                print(f"\n==> {role} [{provider}]")
                print(assignment.task)
                pre_run_paths = git_status_paths() if args.auto_commit and not args.dry_run else set()
                update_assignment_status(state, session_id, role, status="running", launched=True)
                save_json(args.state_file, state)

                result = execute_assignment(
                    session_id=session_id,
                    role=role,
                    task=assignment.task,
                    provider=provider,
                    extra_files=args.file or [],
                    model=args.model,
                    dry_run=args.dry_run,
                    active_roles=queued_roles,
                )

                run_data = build_run_data(result)
                if args.auto_commit and result.exit_code == 0 and not args.dry_run:
                    run_data["commit"] = auto_commit_task(role, assignment.task, pre_run_paths)
                update_assignment_status(state, session_id, role, status=result.status, run_data=run_data)
                complete_assignment_queue_item(role, assignment, args.dry_run, result.exit_code)
                refreshed_assignment, refreshed = refresh_auto_assignment(
                    state, session_id, role, get_assignment(state, session_id, role)
                )
                save_json(args.state_file, state)

                print(f"Status: {result.status} (exit {result.exit_code})")
                print(f"Output: {result.output_path}")
                print(f"Stream: {result.output_path.parent / 'stream.log'}")
                print(f"Provider session: {result.provider_session_id}")
                summary = summarize_output(result.output_path)
                if summary:
                    print(summary)
                if run_data.get("commit"):
                    print(json.dumps(run_data["commit"], indent=2, sort_keys=True))

                if refreshed and refreshed_assignment is not None:
                    assignments[role] = refreshed_assignment
                    pending_roles.append(role)

                if result.exit_code != 0:
                    failures += 1
                    if not args.continue_on_error:
                        print("Stopping on first failure.")
                        return result.exit_code
        else:
            print(f"Running up to {args.max_parallel} roles in parallel.")
            pending_roles = deque(queued_roles)
            futures: dict[Future[RunResult], str] = {}
            with ThreadPoolExecutor(max_workers=args.max_parallel) as executor:
                while pending_roles or futures:
                    while pending_roles and len(futures) < args.max_parallel:
                        role = pending_roles.popleft()
                        assignment = assignments[role]
                        print(f"\n==> {role} [{provider}]")
                        print(assignment.task)
                        update_assignment_status(state, session_id, role, status="running", launched=True)
                        future = executor.submit(
                            execute_assignment,
                            session_id=session_id,
                            role=role,
                            task=assignment.task,
                            provider=provider,
                            extra_files=args.file or [],
                            model=args.model,
                            dry_run=args.dry_run,
                            active_roles=queued_roles,
                        )
                        futures[future] = role
                    save_json(args.state_file, state)

                    if not futures:
                        continue

                    done, _ = wait(list(futures), return_when=FIRST_COMPLETED)
                    for future in done:
                        role = futures.pop(future)
                        assignment = assignments[role]
                        result = future.result()
                        run_data = build_run_data(result)
                        update_assignment_status(state, session_id, role, status=result.status, run_data=run_data)
                        complete_assignment_queue_item(role, assignment, args.dry_run, result.exit_code)
                        refreshed_assignment, refreshed = refresh_auto_assignment(
                            state, session_id, role, get_assignment(state, session_id, role)
                        )
                        save_json(args.state_file, state)

                        print(f"Status: {role} {result.status} (exit {result.exit_code})")
                        print(f"Output: {result.output_path}")
                        print(f"Stream: {result.output_path.parent / 'stream.log'}")
                        print(f"Provider session: {result.provider_session_id}")
                        summary = summarize_output(result.output_path)
                        if summary:
                            print(summary)

                        if refreshed and refreshed_assignment is not None:
                            assignments[role] = refreshed_assignment
                            pending_roles.append(role)

                        if result.exit_code != 0:
                            failures += 1
                            if not args.continue_on_error:
                                for pending in futures:
                                    pending.cancel()
                                print("Stopping on first failure.")
                                return result.exit_code

    print(f"\nProcessed {len(queued_roles)} role(s). Failures: {failures}")
    return 0 if failures == 0 else 1


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--state-file",
        type=Path,
        default=DEFAULT_STATE_FILE,
        help=f"Session state file path (default: {DEFAULT_STATE_FILE})",
    )
    subparsers = parser.add_subparsers(dest="command")

    roles_parser = subparsers.add_parser("roles", help="List available agent roles")
    roles_parser.set_defaults(func=cmd_roles)

    queue_parser = subparsers.add_parser("queue", help="Build the current session queue from agent files")
    queue_parser.add_argument("--session", help="Session id to use")
    queue_parser.set_defaults(func=cmd_queue)

    process_parser = subparsers.add_parser("process", help="Run assigned roles headlessly")
    process_parser.add_argument("--session", help="Session id to use")
    process_parser.add_argument(
        "--provider",
        choices=["auto", "codex", "claude", "gemini"],
        default="auto",
        help="Agent CLI to use for headless execution",
    )
    process_parser.add_argument("--model", help="Provider model override")
    process_parser.add_argument("--continue-on-error", action="store_true", help="Keep going after a failed role")
    process_parser.add_argument("--rerun-completed", action="store_true", help="Process roles already marked completed")
    process_parser.add_argument("--dry-run", action="store_true", help="Write prompts and logs without invoking the CLI")
    process_parser.add_argument(
        "--max-parallel",
        type=int,
        default=1,
        help="Maximum number of distinct roles to run at once (default: 1)",
    )
    process_parser.add_argument(
        "--auto-commit",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Commit cleanly isolated task changes after each successful role",
    )
    process_parser.add_argument("--roles", nargs="+", choices=discover_roles(), help="Only process these roles")
    process_parser.add_argument("--file", action="append", help="Repo-relative file to include for every role")
    process_parser.set_defaults(func=cmd_process)

    pick_parser = subparsers.add_parser("pick", help="Resolve the current automatic task for a role")
    pick_parser.add_argument("role", choices=discover_roles())
    pick_parser.set_defaults(func=cmd_pick)

    session_parser = subparsers.add_parser("session", help="Manage assignment sessions")
    session_subparsers = session_parser.add_subparsers(dest="session_command", required=True)

    session_new = session_subparsers.add_parser("new", help="Create a new current session")
    session_new.add_argument("--name", help="Optional session name prefix")
    session_new.set_defaults(func=cmd_session_new)

    session_status = session_subparsers.add_parser("status", help="Show current or selected session")
    session_status.add_argument("--session", help="Session id to inspect")
    session_status.set_defaults(func=cmd_session_status)

    assign_parser = subparsers.add_parser("assign", help="Assign a task to a role once per session")
    assign_parser.add_argument("role", choices=discover_roles())
    assign_parser.add_argument("task", nargs="?", help="Task to assign")
    assign_parser.add_argument("--session", help="Session id to use")
    assign_parser.add_argument("--force", action="store_true", help="Replace an existing assignment")
    assign_parser.add_argument("--auto", action="store_true", help="Assign the current inferred task")
    assign_parser.set_defaults(func=cmd_assign)

    launch_parser = subparsers.add_parser("launch", help="Run one role headlessly")
    launch_parser.add_argument("role", choices=discover_roles())
    launch_parser.add_argument("--session", help="Session id to use")
    launch_parser.add_argument("--task", help="Assign this task before launch")
    launch_parser.add_argument("--auto", action="store_true", help="Assign the current inferred task when needed")
    launch_parser.add_argument("--force", action="store_true", help="Replace an existing assignment")
    launch_parser.add_argument("--file", action="append", help="Repo-relative file to include in the initial read list")
    launch_parser.add_argument("--model", help="Provider model override")
    launch_parser.add_argument(
        "--provider",
        choices=["auto", "codex", "claude", "gemini"],
        default="auto",
        help="Agent CLI to use",
    )
    launch_parser.add_argument("--dry-run", action="store_true", help="Write prompt and metadata without invoking the CLI")
    launch_parser.add_argument(
        "--auto-commit",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Commit cleanly isolated task changes after success",
    )
    launch_parser.set_defaults(func=cmd_launch)

    inbox_parser = subparsers.add_parser("inbox", help="Draft cross-agent inbox items")
    inbox_subparsers = inbox_parser.add_subparsers(dest="inbox_command", required=True)

    inbox_draft = inbox_subparsers.add_parser("draft", help="Append a drafted request to another agent inbox")
    inbox_draft.add_argument("from_role", choices=discover_roles())
    inbox_draft.add_argument("to_role", choices=discover_roles())
    inbox_draft.add_argument("message", help="Concrete request to append")
    inbox_draft.set_defaults(func=cmd_inbox_draft)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    if args.command is None:
        args.command = "process"
        args.session = None
        args.provider = "auto"
        args.model = None
        args.continue_on_error = False
        args.rerun_completed = False
        args.dry_run = False
        args.max_parallel = 1
        args.auto_commit = False
        args.roles = None
        args.file = None
        args.func = cmd_process
    if args.command == "assign" and not args.task and not args.auto:
        parser.error("assign requires a task or --auto")
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
