"""Asset Code Generator - Generate unique asset codes in format AST-YYYY-NNN"""
from utils.timezone import utcnow
from sqlalchemy.orm import Session
from models import AssetCommon


def get_next_asset_code(db: Session) -> str:
    current_year = utcnow().year
    year_prefix = str(current_year)
    
    codes = db.query(AssetCommon.asset_code).filter(
        AssetCommon.asset_code.like(f"AST-{year_prefix}-%")
    ).all()
    
    max_sequence = 0
    for (code,) in codes:
        try:
            parts = code.split("-")
            if len(parts) == 3:
                seq = int(parts[2])
                if seq > max_sequence:
                    max_sequence = seq
        except (ValueError, IndexError):
            continue
    
    next_sequence = max_sequence + 1
    sequence_str = str(next_sequence).zfill(3)
    
    return f"AST-{year_prefix}-{sequence_str}"


def validate_asset_code(asset_code: str) -> bool:
    """
    Validate asset code format: AST-YYYY-NNN
    
    Args:
        asset_code: Asset code to validate
        
    Returns:
        True if valid format
    """
    import re
    pattern = r"^AST-\d{4}-\d{3}$"
    return bool(re.match(pattern, asset_code))


def parse_asset_code(asset_code: str) -> dict:
    """
    Parse asset code into components
    
    Args:
        asset_code: Asset code to parse (e.g., AST-2026-001)
        
    Returns:
        Dictionary with year and sequence
    """
    if not validate_asset_code(asset_code):
        return None
    
    parts = asset_code.split("-")
    return {
        "prefix": parts[0],  # AST
        "year": int(parts[1]),  # 2026
        "sequence": int(parts[2])  # 001
    }
