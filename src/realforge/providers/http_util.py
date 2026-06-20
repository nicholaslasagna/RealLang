from __future__ import annotations

import json
import re
import urllib.error
import urllib.request


class HTTPProviderError(Exception):
    pass


def post_json(url: str, payload: dict, *, timeout: float = 120.0) -> dict:
    body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read().decode("utf-8")
    except urllib.error.HTTPError as err:
        detail = err.read().decode("utf-8", errors="replace")
        raise HTTPProviderError(f"HTTP {err.code} from {url}: {detail}") from err
    except urllib.error.URLError as err:
        raise HTTPProviderError(f"request failed for {url}: {err}") from err

    try:
        return json.loads(raw)
    except json.JSONDecodeError as err:
        raise HTTPProviderError(f"invalid JSON response from {url}: {raw[:200]}") from err


def extract_json_object(text: str) -> dict:
    stripped = text.strip()
    if stripped.startswith("{") and stripped.endswith("}"):
        return json.loads(stripped)

    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", stripped, re.DOTALL)
    if fenced:
        return json.loads(fenced.group(1))

    start = stripped.find("{")
    end = stripped.rfind("}")
    if start != -1 and end != -1 and end > start:
        return json.loads(stripped[start : end + 1])

    raise ValueError("no JSON object found in model response")
