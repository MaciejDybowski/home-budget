#!/usr/bin/env python3
"""Export current Git-known source files, without Git history or runtime data."""
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

root = Path(__file__).resolve().parent.parent
if len(sys.argv) != 2:
    raise SystemExit('Usage: python3 scripts/export-source.py /outside/repository/new-directory')
destination = Path(sys.argv[1]).expanduser().resolve()
if destination == root or root in destination.parents:
    raise SystemExit('Destination must be outside the source repository.')
if destination.exists() or not destination.parent.is_dir():
    raise SystemExit('Destination must not exist and its parent must already exist.')
paths = subprocess.check_output(
    ['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], cwd=root,
).decode().split('\0')
excluded = {'.git', '.idea', 'node_modules', 'dist', 'pgdata', 'backups', 'data',
            'test-results', 'playwright-report', 'coverage', '__pycache__'}
count = 0
with tempfile.TemporaryDirectory(prefix='homebudget-export-', dir=destination.parent) as staging:
    content = Path(staging) / 'source'
    content.mkdir()
    for relative in sorted(set(paths)):
        if not relative:
            continue
        path = Path(relative)
        if path.is_absolute() or '..' in path.parts or excluded.intersection(path.parts):
            continue
        if (path.name.startswith('.env') and path.name != '.env.example') or \
                path.name.startswith(('compose.override.', 'docker-compose.override.')) or \
                path.name in {'.DS_Store', 'nextcloud-credentials.json', 'nextcloud-login.json'} or \
                path.name.endswith(('.dump', '.sql.gz', '.tar.gz', '.tar.zst', '.pem', '.key', '.p12')):
            continue
        if path.suffix.lower() == '.csv' and path.parts[0] != 'examples' and 'fixtures' not in path.parts:
            continue
        source = root / path
        if source.is_symlink():
            raise SystemExit(f'Symlink requires manual review: {relative}')
        if not source.is_file():
            continue  # Git still lists a file removed from the working tree.
        target = content / path
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
        count += 1
    os.rename(content, destination)
print(f'Exported {count} current source files to {destination}, without .git or runtime data.')
print('Review this snapshot before creating or publishing a new repository.')
