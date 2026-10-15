"""Only reviewed pure modules; no project config/env/preloads, kernel-denied network.
Not a PostgreSQL/authentication harness. Linux x86_64 required; fail closed otherwise.
"""
import ctypes
import os
from pathlib import Path
import platform
import re
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
FILES = ['engine/rational.ts', 'engine/calculate.ts', 'engine/projection.ts',
         'security/contracts.ts', 'tests/fixtures.ts', 'tests/engine.test.ts', 'tests/phase5.test.ts']
IMPORT = re.compile(r"(?:import|export)\s+(?:type\s+)?[^;]*?from\s*['\"]([^'\"]+)['\"]")
FORBIDDEN = re.compile(r'\b(?:process|Bun|Deno|fetch|XMLHttpRequest|WebSocket|Worker|SharedWorker|require|eval|Function|globalThis|window|document|setTimeout|setInterval|navigator)\b|import\s*\(|import\s*[\'\"]|import\.meta')

class Filter(ctypes.Structure):
    _fields_ = [('code', ctypes.c_ushort), ('jt', ctypes.c_ubyte), ('jf', ctypes.c_ubyte), ('k', ctypes.c_uint32)]
class Program(ctypes.Structure):
    _fields_ = [('len', ctypes.c_ushort), ('filter', ctypes.POINTER(Filter))]

def deny_network():
    libc = ctypes.CDLL(None, use_errno=True)
    # seccomp arch must match x86_64; kill wrong ABI, deny all socket transports (EPERM).
    rules = [Filter(0x20,0,0,4),Filter(0x15,1,0,0xC000003E),Filter(0x06,0,0,0x80000000),Filter(0x20,0,0,0)]
    for syscall in [41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,288,299,307,425,426,427]:
        rules += [Filter(0x15,0,1,syscall),Filter(0x06,0,0,0x00050001)]
    # x32 ABI may otherwise evade native syscall numbers.
    rules += [Filter(0x45,0,1,0x40000000),Filter(0x06,0,0,0x80000000),Filter(0x06,0,0,0x7fff0000)]
    filters = (Filter * len(rules))(*rules)
    program = Program(len(rules), filters)
    if libc.prctl(38,1,0,0,0) != 0 or libc.prctl(22,2,ctypes.byref(program),0,0) != 0:
        os._exit(125)

def main():
    if platform.system()!='Linux' or platform.machine()!='x86_64':
        raise SystemExit('REFUSED: supported kernel network-denial harness required')
    reviewed = {}
    for name in FILES:
        path = ROOT/name
        if path.is_symlink(): raise SystemExit('REFUSED: symlink source')
        text = path.read_text()
        if FORBIDDEN.search(text): raise SystemExit(f'REFUSED: capability in {name}')
        for target in IMPORT.findall(text):
            if target=='bun:test': continue
            resolved = (path.parent/(target+'.ts')).resolve()
            if not target.startswith('.') or resolved not in [(ROOT/f).resolve() for f in FILES]:
                raise SystemExit(f'REFUSED: import outside reviewed graph in {name}')
        reviewed[name]=text
    bun = shutil.which('bun')
    if not bun: raise SystemExit('REFUSED: installed Bun absent')
    with tempfile.TemporaryDirectory(prefix='v4-offline-') as tmp:
        base = Path(tmp)
        for name,text in reviewed.items():
            dest = base/name;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_text(text)
        env = {'PATH':str(Path(bun).parent)+':/usr/bin:/bin','HOME':tmp,'TMPDIR':tmp}
        # Independent positive control proves sockets are blocked before any unit test is run.
        probe = subprocess.run([sys.executable,'-c',"import socket;\ntry: socket.socket(); raise SystemExit(1)\nexcept PermissionError: print('NETWORK_DENIAL_VERIFIED')"],cwd=tmp,env=env,preexec_fn=deny_network,close_fds=True)
        if probe.returncode: raise SystemExit('REFUSED: network denial probe failed')
        print('REVIEWED_GRAPH=7; ENVIRONMENT_SCRUBBED; NO_APP_CONFIG; NETWORK_DENIED',flush=True)
        result = subprocess.run([bun,'test','./tests/engine.test.ts','./tests/phase5.test.ts'],cwd=tmp,env=env,preexec_fn=deny_network,close_fds=True)
        raise SystemExit(result.returncode)

if __name__=='__main__': main()