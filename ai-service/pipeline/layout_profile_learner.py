"""
Layout profile learning and matching system.

Enables auto-learning from successful extractions:
- Save layout signatures after successful extraction
- Index profiles by content hash
- Match against known profiles for faster reuse
- Accumulate extraction patterns over time

This enables the system to recognize similar layouts
even if they've never been seen before during training.
"""

from __future__ import annotations

from dataclasses import dataclass, field, asdict
import hashlib
import json
from pathlib import Path
from typing import Dict, List, Optional, Any
import logging


logger = logging.getLogger(__name__)


@dataclass
class LayoutProfile:
    """Learned profile of a successful extraction."""
    
    # Identity and versioning
    profile_id: str
    created_timestamp: str
    last_used_timestamp: str
    usage_count: int = 1
    
    # Content signature (hash of structural characteristics)
    content_hash: str = ""
    structure_complexity: str = ""  # "simple", "moderate", "complex"
    
    # Structural characteristics
    table_count: int = 0
    has_projects: bool = False
    has_employee_ids: bool = False
    has_attendance_markers: bool = False
    
    # Learned extraction patterns
    header_mappings: Dict[str, Dict[str, Any]] = field(default_factory=dict)
    financial_block_patterns: Dict[str, str] = field(default_factory=dict)
    column_spacing_clusters: List[Dict[str, float]] = field(default_factory=list)
    
    # Extraction quality metrics
    extraction_confidence: float = 0.0
    ocr_quality_score: float = 0.0
    
    # Extraction results for validation
    extracted_rows_count: int = 0
    extracted_deduction: float = 0.0
    extracted_vat_rate: float = 0.05
    
    # Metadata
    source_pdf_name: str = ""
    notes: str = ""
    
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert profile to JSON-serializable dict."""
        return asdict(self)
    
    @staticmethod
    def from_dict(data: Dict[str, Any]) -> LayoutProfile:
        """Create profile from dict."""
        return LayoutProfile(**data)


class LayoutProfileStore:
    """Persistent store for learned layout profiles."""
    
    def __init__(self, storage_dir: str = "./pipeline/profile_store"):
        self.storage_dir = Path(storage_dir)
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        self.profiles_index_file = self.storage_dir / "profiles_index.json"
        self._index: Dict[str, str] = self._load_index()
    
    def _load_index(self) -> Dict[str, str]:
        """Load profile index from disk."""
        if self.profiles_index_file.exists():
            try:
                with open(self.profiles_index_file, 'r') as f:
                    return json.load(f)
            except (json.JSONDecodeError, IOError) as e:
                logger.warning(f"Failed to load profile index: {e}")
                return {}
        return {}
    
    def _save_index(self) -> None:
        """Save profile index to disk."""
        try:
            with open(self.profiles_index_file, 'w') as f:
                json.dump(self._index, f, indent=2)
        except IOError as e:
            logger.warning(f"Failed to save profile index: {e}")
    
    def save_profile(self, profile: LayoutProfile) -> None:
        """Save a profile to storage."""
        profile_file = self.storage_dir / f"{profile.profile_id}.json"
        
        try:
            with open(profile_file, 'w') as f:
                json.dump(profile.to_dict(), f, indent=2)
            
            # Update index
            self._index[profile.profile_id] = str(profile_file)
            self._save_index()
            
            logger.debug(f"Saved profile: {profile.profile_id}")
        except IOError as e:
            logger.error(f"Failed to save profile: {e}")
    
    def load_profile(self, profile_id: str) -> Optional[LayoutProfile]:
        """Load a profile from storage."""
        if profile_id not in self._index:
            return None
        
        profile_file = Path(self._index[profile_id])
        
        try:
            if not profile_file.exists():
                logger.warning(f"Profile file missing: {profile_file}")
                return None
            
            with open(profile_file, 'r') as f:
                data = json.load(f)
                return LayoutProfile.from_dict(data)
        except (json.JSONDecodeError, IOError) as e:
            logger.error(f"Failed to load profile {profile_id}: {e}")
            return None
    
    def find_similar_profile(
        self,
        content_hash: str,
        complexity: str,
        has_projects: bool,
        threshold: float = 0.8,
    ) -> Optional[LayoutProfile]:
        """
        Find a similar profile for reuse.
        
        Matches by:
        1. Exact content hash (best match)
        2. Similar structure (complexity + layout type)
        
        Args:
            content_hash: Hash of new document structure
            complexity: "simple", "moderate", "complex"
            has_projects: Whether document appears project-based
            threshold: Minimum similarity score (0.0-1.0)
        
        Returns:
            Best matching profile or None
        """
        best_profile: Optional[LayoutProfile] = None
        best_score = 0.0
        
        for profile_id in self._index:
            profile = self.load_profile(profile_id)
            if not profile:
                continue
            
            # Exact hash match = perfect
            if profile.content_hash == content_hash:
                return profile
            
            # Similarity score based on structure
            score = 0.0
            
            # Complexity match
            if profile.structure_complexity == complexity:
                score += 0.4
            
            # Layout type match
            if profile.has_projects == has_projects:
                score += 0.3
            
            # Table count similarity (within ±1)
            # (would need current table_count to compare)
            score += 0.3
            
            if score > best_score and score >= threshold:
                best_score = score
                best_profile = profile
        
        return best_profile
    
    def list_profiles(self) -> List[LayoutProfile]:
        """List all profiles in store."""
        profiles = []
        for profile_id in self._index:
            profile = self.load_profile(profile_id)
            if profile:
                profiles.append(profile)
        return profiles


def compute_content_hash(
    characteristics: Dict[str, float],
    table_count: int,
) -> str:
    """
    Compute hash of document content characteristics.
    
    Used to identify similar layouts.
    """
    key_parts = [
        f"tc:{int(table_count)}",
        f"proj:{int(characteristics.get('has_projects', 0))}",
        f"emp:{int(characteristics.get('has_employee_ids', 0))}",
        f"att:{int(characteristics.get('has_attendance_markers', 0))}",
        f"kdens:{int(characteristics.get('keyword_density', 0) * 100)}",
    ]
    
    key_str = "|".join(key_parts)
    return hashlib.sha256(key_str.encode()).hexdigest()[:16]


def build_profile_from_extraction(
    extraction_result: Dict[str, Any],
    characteristics: Dict[str, float],
    source_pdf_name: str = "",
) -> LayoutProfile:
    """
    Build a profile from successful extraction.
    
    Args:
        extraction_result: Complete extraction result dict
        characteristics: Document characteristics from classification
        source_pdf_name: Source PDF filename
    
    Returns:
        New LayoutProfile
    """
    from datetime import datetime
    import uuid
    
    profile_id = f"profile_{uuid.uuid4().hex[:8]}"
    now = datetime.utcnow().isoformat()
    
    # Compute content hash
    table_count = int(characteristics.get("table_count", 0))
    content_hash = compute_content_hash(characteristics, table_count)
    
    # Determine complexity
    complexity = "simple"
    if table_count >= 5:
        complexity = "complex"
    elif table_count >= 2:
        complexity = "moderate"
    
    # Build profile
    profile = LayoutProfile(
        profile_id=profile_id,
        created_timestamp=now,
        last_used_timestamp=now,
        usage_count=1,
        content_hash=content_hash,
        structure_complexity=complexity,
        table_count=table_count,
        has_projects=bool(characteristics.get("has_projects", 0)),
        has_employee_ids=bool(characteristics.get("has_employee_ids", 0)),
        has_attendance_markers=bool(characteristics.get("has_attendance_markers", 0)),
        extraction_confidence=extraction_result.get("extraction_confidence", 0.0),
        ocr_quality_score=extraction_result.get("ocr_quality_score", 0.0),
        extracted_rows_count=len(extraction_result.get("rows", [])),
        extracted_deduction=extraction_result.get("financials", {}).get("total_deduction", 0.0),
        extracted_vat_rate=extraction_result.get("vat_rate", 0.05),
        source_pdf_name=source_pdf_name,
        notes=extraction_result.get("extraction_notes", ""),
    )
    
    return profile


def should_save_profile(
    extraction_result: Dict[str, Any],
    confidence_threshold: float = 0.8,
) -> bool:
    """
    Determine if extraction should be saved as profile.
    
    Profiles are saved when:
    - Extraction confidence is high
    - All financial fields were successfully extracted
    - Rows were successfully extracted
    """
    confidence = extraction_result.get("extraction_confidence", 0.0)
    if confidence < confidence_threshold:
        return False
    
    rows = extraction_result.get("rows", [])
    if len(rows) == 0:
        return False
    
    financials = extraction_result.get("financials", {})
    if not financials.get("subtotal") or not financials.get("total_deduction"):
        return False
    
    return True
