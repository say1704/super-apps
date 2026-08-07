import re
import logging

logger = logging.getLogger(__name__)

_BATCH_MARKER = "===BATCH_FILE_START==="
_BATCH_END = "@@@BATCH_END@@@"


def build_batch_cmd(file_paths: list[str]) -> str:
    """Build a single SSH command that reads multiple files with separable markers.
    
    Each file is wrapped: ===BATCH_FILE_START===/path/file@@@BATCH_END@@@
    followed by file content + unique end-of-content marker.
    Returns empty string if no files.
    """
    if not file_paths:
        return ""

    parts = []
    for f in file_paths:
        safe = re.sub(r'[^a-zA-Z0-9/_.\-]', '', f)
        parts.append(f"printf '{_BATCH_MARKER}{safe}{_BATCH_END}\\n'")
        parts.append(f"cat {safe} 2>/dev/null || echo ''")
        parts.append(f"printf '\\n{_BATCH_END}\\n'")

    return "; ".join(parts)


def parse_batch_output(output: str) -> dict[str, str]:
    """Parse batch command output into {filepath: content} dict.
    
    Returns empty dict if output is empty or malformed.
    Content is empty string for files that failed to read.
    """
    if not output:
        return {}

    result = {}
    marker_esc = re.escape(_BATCH_MARKER)
    end_esc = re.escape(_BATCH_END)
    pattern = marker_esc + r'([^@]+)' + end_esc + r'\s*(.*?)' + end_esc
    matches = re.findall(pattern, output, re.DOTALL)

    for filepath, content in matches:
        result[filepath.strip()] = content.strip()

    logger.info(f"[BATCH-READER] Parsed {len(result)} files from batch output")
    return result
