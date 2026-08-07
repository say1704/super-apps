"""
Server Clustering using KMeans
================================
Groups backup servers into clusters based on behavior patterns:
- large_stable: High size, low variance
- fast_growing: High growth rate
- volatile: High variance, unpredictable
- small_stable: Low size, low variance
- at_risk: Declining size or missing backups
"""

from datetime import date
from typing import Optional
import math


def cluster_servers(servers: list[dict]) -> dict:
    """
    Cluster servers using simple rule-based clustering (no sklearn needed).
    
    Each server dict should contain:
    - server_ip: str
    - avg_size_gb: float (average backup size in GB)
    - growth_rate_pct: float (daily growth percentage)
    - variance_cv: float (coefficient of variation)
    - consistency_pct: float (0-100, backup consistency)
    - freshness_days: int (days since last backup)
    
    Returns:
        {
            "clusters": {
                "large_stable": [server_ips],
                "fast_growing": [server_ips],
                "volatile": [server_ips],
                "small_stable": [server_ips],
                "at_risk": [server_ips]
            },
            "cluster_details": {
                "large_stable": {"count": int, "avg_size_gb": float, ...},
                ...
            },
            "server_assignments": {server_ip: cluster_name}
        }
    """
    clusters = {
        "large_stable": [],
        "fast_growing": [],
        "volatile": [],
        "small_stable": [],
        "at_risk": []
    }
    
    cluster_details = {
        "large_stable": {"count": 0, "avg_size_gb": 0, "avg_growth_pct": 0, "avg_consistency": 0, "servers": []},
        "fast_growing": {"count": 0, "avg_size_gb": 0, "avg_growth_pct": 0, "avg_consistency": 0, "servers": []},
        "volatile": {"count": 0, "avg_size_gb": 0, "avg_growth_pct": 0, "avg_consistency": 0, "servers": []},
        "small_stable": {"count": 0, "avg_size_gb": 0, "avg_growth_pct": 0, "avg_consistency": 0, "servers": []},
        "at_risk": {"count": 0, "avg_size_gb": 0, "avg_growth_pct": 0, "avg_consistency": 0, "servers": []}
    }
    
    server_assignments = {}
    cluster_sizes = {k: [] for k in clusters}
    cluster_growths = {k: [] for k in clusters}
    cluster_consistencies = {k: [] for k in clusters}
    
    for server in servers:
        ip = server.get("server_ip", "unknown")
        avg_size_gb = server.get("avg_size_gb", 0)
        growth_rate_pct = server.get("growth_rate_pct", 0)
        variance_cv = server.get("variance_cv", 0)
        consistency_pct = server.get("consistency_pct", 50)
        freshness_days = server.get("freshness_days", 999)
        
        # Classification rules
        if freshness_days > 7 or consistency_pct < 30:
            cluster = "at_risk"
        elif growth_rate_pct > 3:  # >3% daily growth
            cluster = "fast_growing"
        elif variance_cv > 0.5:
            cluster = "volatile"
        elif avg_size_gb > 10:  # >10GB average
            cluster = "large_stable"
        else:
            cluster = "small_stable"
        
        clusters[cluster].append(ip)
        server_assignments[ip] = cluster
        cluster_sizes[cluster].append(avg_size_gb)
        cluster_growths[cluster].append(growth_rate_pct)
        cluster_consistencies[cluster].append(consistency_pct)
    
    # Calculate cluster details
    for cluster_name in clusters:
        count = len(clusters[cluster_name])
        cluster_details[cluster_name]["count"] = count
        cluster_details[cluster_name]["servers"] = clusters[cluster_name]
        if count > 0:
            cluster_details[cluster_name]["avg_size_gb"] = round(
                sum(cluster_sizes[cluster_name]) / count, 2
            )
            cluster_details[cluster_name]["avg_growth_pct"] = round(
                sum(cluster_growths[cluster_name]) / count, 2
            )
            cluster_details[cluster_name]["avg_consistency"] = round(
                sum(cluster_consistencies[cluster_name]) / count, 1
            )
    
    return {
        "clusters": clusters,
        "cluster_details": cluster_details,
        "server_assignments": server_assignments,
        "total_servers": len(servers)
    }


def calculate_server_features(
    backup_dates: list[date],
    sizes: list[int],
) -> dict:
    """
    Calculate features for a single server to be used in clustering.
    
    Returns:
        {
            "avg_size_gb": float,
            "growth_rate_pct": float,
            "variance_cv": float,
            "consistency_pct": float,
            "freshness_days": int
        }
    """
    if not sizes:
        return {
            "avg_size_gb": 0,
            "growth_rate_pct": 0,
            "variance_cv": 0,
            "consistency_pct": 0,
            "freshness_days": 999
        }
    
    # Average size in GB
    avg_size_bytes = sum(sizes) / len(sizes)
    avg_size_gb = avg_size_bytes / (1024 ** 3)
    
    # Growth rate (daily %)
    growth_rate_pct = _calculate_growth_rate(sizes)
    
    # Variance (coefficient of variation)
    variance_cv = _calculate_cv(sizes)
    
    # Consistency
    consistency_pct = _calculate_consistency(backup_dates)
    
    # Freshness
    if backup_dates:
        last_backup = max(backup_dates)
        from datetime import date as date_type
        freshness_days = (date_type.today() - last_backup).days
    else:
        freshness_days = 999
    
    return {
        "avg_size_gb": round(avg_size_gb, 3),
        "growth_rate_pct": round(growth_rate_pct, 4),
        "variance_cv": round(variance_cv, 4),
        "consistency_pct": round(consistency_pct, 1),
        "freshness_days": freshness_days
    }


def _calculate_growth_rate(sizes: list[int]) -> float:
    """Calculate daily growth percentage."""
    if len(sizes) < 2:
        return 0.0
    
    first = sizes[0]
    last = sizes[-1]
    
    if first == 0:
        return 0.0
    
    total_growth = ((last - first) / first) * 100
    days = max(1, len(sizes) - 1)
    
    return total_growth / days


def _calculate_cv(sizes: list[int]) -> float:
    """Calculate coefficient of variation."""
    if len(sizes) < 2:
        return 0.0
    
    mean = sum(sizes) / len(sizes)
    if mean == 0:
        return 0.0
    
    variance = sum((x - mean) ** 2 for x in sizes) / len(sizes)
    std_dev = math.sqrt(variance)
    
    return std_dev / mean


def _calculate_consistency(backup_dates: list[date]) -> float:
    """Calculate backup consistency percentage."""
    if len(backup_dates) < 2:
        return 30.0
    
    sorted_dates = sorted(backup_dates)
    total_span = (sorted_dates[-1] - sorted_dates[0]).days
    
    if total_span == 0:
        return 50.0
    
    # Expected backups (1 per day)
    expected = total_span + 1
    actual = len(set(backup_dates))
    
    return min(100, (actual / expected) * 100)
