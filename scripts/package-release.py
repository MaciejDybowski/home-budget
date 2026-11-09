#!/usr/bin/env python3
"""Create a source-free deployment bundle for an immutable image version."""
from pathlib import Path
import re
import sys
import tarfile

if len(sys.argv) not in (3, 4):
    raise SystemExit('Usage: python3 scripts/package-release.py VERSION NEW_DIRECTORY [GHCR_OWNER]')
version, destination = sys.argv[1], Path(sys.argv[2]).expanduser().resolve()
owner = sys.argv[3].lower() if len(sys.argv) == 4 else 'maciejdybowski'
if not re.fullmatch(r'(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?', version):
    raise SystemExit('Expected a version such as 2026.11.0 or 2026.11.1-rc.1, without v.')
if not re.fullmatch(r'[a-z0-9][a-z0-9-]*', owner):
    raise SystemExit('Invalid GHCR owner.')
if destination.exists() or not destination.parent.is_dir():
    raise SystemExit('Destination must not exist and its parent must exist.')
root = Path(__file__).resolve().parent.parent
destination.mkdir()
for name in ['docker-compose.yml', 'install.sh', 'env.example', 'LICENSE',
              'docs/backups.md', 'docs/deployment.md', 'docs/database.md', 'docs/development.md',
              'docs/authentication.md', 'docs/external-deployment.md']:
    text = (root / name).read_text()
    text = re.sub(
        r'\$\{HOMEBUDGET_VERSION:-[^}]+\}',
        '${HOMEBUDGET_VERSION:-' + version + '}',
        text,
    )
    text = re.sub(
        r'^HOMEBUDGET_VERSION=.*$',
        'HOMEBUDGET_VERSION=' + version,
        text,
        flags=re.MULTILINE,
    )
    text = text.replace('ghcr.io/maciejdybowski/', f'ghcr.io/{owner}/')
    # Forks must download the deployment bundle from their own releases too.
    text = text.replace('github.com/MaciejDybowski/home-budget/releases/', f'github.com/{owner}/home-budget/releases/')
    target = destination / name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text)
(destination / 'README.md').write_text(
    f'# HomeBudget {version}\n\n'
    'Run `sh install.sh` to download images and start the application. '
    'No application sources or local image builds are needed.\n\n'
    'For manual installation, copy `env.example` to `.env`, set a random hex '
    'POSTGRES_PASSWORD and configure authentication (see docs/authentication.md), '
    'then run `docker compose up -d`.\n\n'
    'See `docs/deployment.md` and `docs/backups.md`. '
    'Author: Maciej Dybowski (https://github.com/MaciejDybowski). License: MIT.\n'
)
files = sorted(path for path in destination.rglob('*') if path.is_file())
with tarfile.open(destination / 'homebudget-compose.tar.gz', 'w:gz') as archive:
    for path in files:
        archive.add(path, arcname=str(path.relative_to(destination)))
print(f'Created deployment bundle for {version}: {destination}')
