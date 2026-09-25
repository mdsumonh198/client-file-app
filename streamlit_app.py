import os
import sys

# Ensure root & package directory are on path
current_dir = os.path.dirname(os.path.abspath(__file__))
pkg_dir = os.path.join(current_dir, "lottery_optimizer_package")
if pkg_dir not in sys.path:
    sys.path.insert(0, pkg_dir)
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

# Import and execute the app
from lottery_optimizer_package.streamlit_app import *
