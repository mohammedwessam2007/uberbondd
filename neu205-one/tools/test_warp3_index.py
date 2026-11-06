"""Re-export local WARP3 synthetic tests for the repository's tools/ discovery."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent / 'omega_atlas'))
from test_warp3_evidence_packets import WARP3Tests  # noqa: F401
