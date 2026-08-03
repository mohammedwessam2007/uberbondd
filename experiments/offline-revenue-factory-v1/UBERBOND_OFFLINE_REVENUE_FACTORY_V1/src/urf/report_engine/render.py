"""Render a Report record to Markdown, HTML, JSON, and a CSV evidence index.

PDF rendering is intentionally not implemented: no offline, dependency-free
PDF writer is available in this stdlib-only build. Mission Phase 8 marks
PDF as "optional if available offline" — it is not available here, and
that limitation is recorded rather than silently skipped (see
16_LIMITATION_REGISTER.md and docs/14_LIMITATION_REGISTER.md).
"""
from __future__ import annotations

import csv
import html
import io
import json
from pathlib import Path

from . import templates as tmpl


def _section(title: str, items) -> str:
    if not items:
        return f"## {title}\n\n_None recorded._\n"
    lines = [f"## {title}", ""]
    for item in items:
        lines.append(f"- {item}")
    lines.append("")
    return "\n".join(lines)


def render_markdown(report: dict, *, strip_branding: bool = False) -> str:
    sections = tmpl.sections_for(report["template"])
    lines = [f"# {report['lane']} — {report['template'].replace('_', ' ').title()} Report", ""]
    lines.append(f"Report ID: `{report['report_id']}`  ")
    lines.append(f"Run ID: `{report['run_id']}`  ")
    lines.append(f"Generated: {report['generated_at']}  ")
    lines.append("")
    lines.append("## Executive Summary")
    lines.append("")
    lines.append(report["executive_summary"])
    lines.append("")
    lines.append(_section("Scope", report["scope"]))
    lines.append(_section("Exclusions", report["exclusions"]))
    lines.append(_section("Inputs", report["inputs"]))
    if sections["methods"]:
        lines.append(_section("Methods", report["methods"]))
    lines.append(_section("Findings (by ID — see evidence index for detail)", report["findings"]))
    if sections["evidence_refs"]:
        lines.append(_section("Evidence References", report["evidence_refs"]))
    lines.append(_section("Unknowns", report["unknowns"]))
    lines.append(_section("Blocked Conclusions", report["blocked_conclusions"]))
    lines.append(_section("Human Review Requirements", report["human_review_requirements"]))
    lines.append(_section("Limitations", report["limitations"]))
    if sections["run_manifest"]:
        lines.append(f"Run manifest reference: `{report['run_manifest_ref']}`\n")
    if sections["checksum"] and report.get("checksum"):
        lines.append(f"Checksum: `{report['checksum']}`\n")
    text = "\n".join(lines)
    if strip_branding or sections.get("strip_branding"):
        text = tmpl.strip_branding(text)
    return text


def render_html(report: dict, *, strip_branding: bool = False) -> str:
    md = render_markdown(report, strip_branding=strip_branding)
    body_lines = []
    for raw_line in md.splitlines():
        line = html.escape(raw_line)
        if line.startswith("## "):
            body_lines.append(f"<h2>{line[3:]}</h2>")
        elif line.startswith("# "):
            body_lines.append(f"<h1>{line[2:]}</h1>")
        elif line.startswith("- "):
            body_lines.append(f"<li>{line[2:]}</li>")
        elif line.strip() == "":
            body_lines.append("<br/>")
        else:
            body_lines.append(f"<p>{line}</p>")
    body = "\n".join(body_lines)
    title = html.escape(f"{report['lane']} — {report['template']} report")
    return (
        "<!doctype html>\n<html lang=\"en\"><head><meta charset=\"utf-8\">"
        f"<title>{title}</title></head><body>\n{body}\n</body></html>\n"
    )


def render_json(report: dict) -> str:
    return json.dumps(report, indent=2, sort_keys=True, ensure_ascii=True) + "\n"


def render_evidence_index_csv(evidence_items: list) -> str:
    fieldnames = [
        "evidence_id", "lane", "source_type", "source_path", "source_hash",
        "collected_at", "data_classification", "parser", "parser_version",
        "confidence", "human_review_required",
    ]
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=fieldnames, extrasaction="ignore")
    writer.writeheader()
    for item in evidence_items:
        writer.writerow(item)
    return buf.getvalue()


def write_all(report: dict, evidence_items: list, out_dir: Path, *, strip_branding: bool = False) -> dict:
    out_dir.mkdir(parents=True, exist_ok=True)
    paths = {
        "markdown": out_dir / "report.md",
        "html": out_dir / "report.html",
        "json": out_dir / "report.json",
        "evidence_index_csv": out_dir / "evidence_index.csv",
    }
    paths["markdown"].write_text(render_markdown(report, strip_branding=strip_branding), encoding="utf-8")
    paths["html"].write_text(render_html(report, strip_branding=strip_branding), encoding="utf-8")
    paths["json"].write_text(render_json(report), encoding="utf-8")
    paths["evidence_index_csv"].write_text(render_evidence_index_csv(evidence_items), encoding="utf-8")
    return {k: str(v) for k, v in paths.items()}
