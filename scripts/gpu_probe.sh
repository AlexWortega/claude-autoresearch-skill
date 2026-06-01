#!/usr/bin/env bash
# autoresearch — local compute probe.
# Usage: gpu_probe.sh
# Prints one key=value line per fact. Always exits 0 so auto-detect never crashes.
#   local_gpu=yes|no
#   gpu_name=<name>        (per GPU, only when present)
#   gpu_free_mib=<int>     (per GPU, only when present)
#   cuda=yes|no
#   torch_cuda=yes|no|unknown

set -u

if command -v nvidia-smi >/dev/null 2>&1; then
  echo "local_gpu=yes"
  echo "cuda=yes"
  nvidia-smi --query-gpu=name,memory.free --format=csv,noheader,nounits 2>/dev/null \
    | while IFS=',' read -r name free; do
        name="$(echo "$name" | sed 's/^ *//;s/ *$//')"
        free="$(echo "$free" | sed 's/^ *//;s/ *$//')"
        echo "gpu_name=${name}"
        echo "gpu_free_mib=${free}"
      done
else
  echo "local_gpu=no"
  echo "cuda=no"
fi

# Optional: confirm a torch CUDA build is importable (best-effort, short timeout-free check).
if command -v python3 >/dev/null 2>&1; then
  tc="$(python3 - <<'PY' 2>/dev/null
try:
    import torch
    print("yes" if torch.cuda.is_available() else "no")
except Exception:
    print("unknown")
PY
)"
  echo "torch_cuda=${tc:-unknown}"
else
  echo "torch_cuda=unknown"
fi

exit 0
