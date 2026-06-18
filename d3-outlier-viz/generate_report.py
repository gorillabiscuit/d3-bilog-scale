#!/usr/bin/env python3
"""Generate report.md from deep-research JSON results."""

import json
import os
import re
import yaml

RESULTS_DIR = os.path.join(os.path.dirname(__file__), "results")
FIELDS_YAML = os.path.join(os.path.dirname(__file__), "fields.yaml")
OUTPUT_MD = os.path.join(os.path.dirname(__file__), "report.md")

TOC_FIELDS = ["category", "code_complexity", "distribution_driven", "library_dependency"]

CATEGORY_ORDER = ["scale-transform", "visual-encoding", "interaction", "layout"]

INTERNAL_KEYS = {"uncertain", "_source_file"}

def slug(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")

def is_uncertain(val, name, uncertain_list):
    if name in uncertain_list:
        return True
    if val is None or val == "":
        return True
    if isinstance(val, str) and "[uncertain]" in val:
        return True
    return False

def short_value(val, field_name):
    """Return a one-liner summary value for the TOC."""
    if isinstance(val, str):
        # For distribution_driven, take up to the first sentence
        if field_name == "distribution_driven":
            return val.split(".")[0].strip()
        # For library_dependency, take up to first period or 80 chars
        if field_name == "library_dependency":
            short = val.split(".")[0].strip()
            return short[:80] + ("…" if len(short) > 80 else "")
        return val[:80] + ("…" if len(val) > 80 else "")
    if isinstance(val, list):
        return ", ".join(str(x) for x in val[:3])
    return str(val)

def format_value(val):
    """Format a field value for the detail section."""
    if val is None or val == "":
        return "_—_"
    if isinstance(val, list):
        if all(isinstance(x, dict) for x in val):
            lines = []
            for item in val:
                parts = " | ".join(f"**{k}**: {v}" for k, v in item.items())
                lines.append(f"- {parts}")
            return "\n".join(lines)
        if len(val) <= 5:
            return ", ".join(str(x) for x in val)
        return "\n".join(f"- {x}" for x in val)
    if isinstance(val, dict):
        lines = []
        for k, v in val.items():
            lines.append(f"- **{k}**: {v}")
        return "\n".join(lines)
    text = str(val)
    # Wrap long prose into blockquote for readability
    if len(text) > 200:
        return "> " + text.replace("\n", "\n> ")
    return text

def load_results():
    items = []
    for fname in sorted(os.listdir(RESULTS_DIR)):
        if not fname.endswith(".json"):
            continue
        path = os.path.join(RESULTS_DIR, fname)
        with open(path) as f:
            data = json.load(f)
        data["_source_file"] = fname
        items.append(data)
    return items

def load_fields():
    with open(FIELDS_YAML) as f:
        raw = yaml.safe_load(f)
    return [field["name"] for field in raw.get("fields", [])]

def group_by_category(items):
    groups = {c: [] for c in CATEGORY_ORDER}
    groups["other"] = []
    for item in items:
        cat = item.get("category", "other")
        if cat in groups:
            groups[cat].append(item)
        else:
            groups["other"].append(item)
    return groups

def toc_line(n, item):
    name = item.get("technique_name", item["_source_file"])
    anchor = slug(name)
    uncertain = item.get("uncertain", [])
    parts = [f"{n}. [{name}](#{anchor})"]
    for field in TOC_FIELDS:
        val = item.get(field)
        if val and not is_uncertain(val, field, uncertain):
            parts.append(f"**{field}**: {short_value(val, field)}")
    return " | ".join(parts)

def item_section(item, field_names):
    name = item.get("technique_name", item["_source_file"])
    uncertain = item.get("uncertain", [])
    lines = [f"### {name}", ""]

    known_keys = set(field_names) | INTERNAL_KEYS
    extra_keys = [k for k in item if k not in known_keys]

    for field in field_names:
        val = item.get(field)
        if is_uncertain(val, field, uncertain):
            continue
        lines.append(f"**{field}**")
        lines.append("")
        lines.append(format_value(val))
        lines.append("")

    if extra_keys:
        lines.append("**Other Info**")
        lines.append("")
        for k in extra_keys:
            val = item.get(k)
            if is_uncertain(val, k, uncertain):
                continue
            lines.append(f"- **{k}**: {format_value(val)}")
        lines.append("")

    if uncertain:
        lines.append("**Uncertain fields** (omitted from above)")
        lines.append("")
        for u in uncertain:
            lines.append(f"- {u}")
        lines.append("")

    return "\n".join(lines)

def main():
    items = load_results()
    field_names = load_fields()
    groups = group_by_category(items)

    lines = []
    lines.append("# D3.js Outlier Visualization Techniques — Research Report")
    lines.append("")
    lines.append("> **Dataset**: 200 small business loans. 84% under $10K, median ~$6K. "
                 "10 outliers from $120K–$1.2M.")
    lines.append("")

    # TOC
    lines.append("## Table of Contents")
    lines.append("")
    n = 1
    category_labels = {
        "scale-transform": "Scale Transforms",
        "visual-encoding": "Visual Encoding",
        "interaction": "Interaction",
        "layout": "Layout",
    }
    for cat in CATEGORY_ORDER:
        cat_items = groups.get(cat, [])
        if not cat_items:
            continue
        lines.append(f"**{category_labels.get(cat, cat)}**")
        lines.append("")
        for item in cat_items:
            lines.append(toc_line(n, item))
            n += 1
        lines.append("")

    # Detail sections
    lines.append("---")
    lines.append("")
    lines.append("## Detailed Findings")
    lines.append("")

    for cat in CATEGORY_ORDER:
        cat_items = groups.get(cat, [])
        if not cat_items:
            continue
        lines.append(f"## {category_labels.get(cat, cat)}")
        lines.append("")
        for item in cat_items:
            lines.append(item_section(item, field_names))
            lines.append("---")
            lines.append("")

    report = "\n".join(lines)
    with open(OUTPUT_MD, "w") as f:
        f.write(report)
    print(f"Report written to {OUTPUT_MD} ({len(items)} items)")

if __name__ == "__main__":
    main()
