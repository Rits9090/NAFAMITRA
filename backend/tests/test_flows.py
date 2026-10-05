"""NafaMitra acceptance flows (spec §97–§101) as pytest.

Runs the full sequence against a live server (REACT_APP_BACKEND_URL).
Kept as one ordered scenario because the flows build on each other:
billing → credit → loyalty → void → isolation → portal → roles.
"""
import os
import runpy
import sys

BASE = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
E2E = os.path.join(os.path.dirname(__file__), 'e2e_flows.py')


def test_full_acceptance_flows():
    assert BASE, 'Set REACT_APP_BACKEND_URL to a running NafaMitra API'
    sys.path.insert(0, os.path.dirname(E2E))
    runpy.run_path(E2E, run_name='__main__')
