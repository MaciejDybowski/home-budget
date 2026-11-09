#!/usr/bin/env python3
"""Installer contract tests without Docker, images, production data or secrets."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent.parent


class InstallerTests(unittest.TestCase):
    def setUp(self):
        parent = '/tmp/opencode' if Path('/tmp/opencode').is_dir() else None
        self.temp = tempfile.TemporaryDirectory(prefix='homebudget-installer-', dir=parent)
        self.directory = Path(self.temp.name)
        shutil.copy(ROOT / 'install.sh', self.directory / 'install.sh')
        (self.directory / 'docker-compose.yml').write_text('services: {}\n')
        binary = self.directory / 'bin'
        binary.mkdir()
        mock = binary / 'docker'
        mock.write_text('#!/bin/sh\nprintf "%s\\n" "$*" >> docker-calls.log\n'
                        'case "$*" in *"compose pull"*) [ "${FAIL_PULL:-}" != yes ] ;; *) exit 0 ;; esac\n')
        mock.chmod(0o755)
        self.env = {k: v for k, v in os.environ.items() if not k.startswith(('AUTH_', 'APP_ORIGIN', 'HOMEBUDGET_'))}
        self.env['PATH'] = str(binary) + os.pathsep + self.env['PATH']

    def tearDown(self):
        self.temp.cleanup()

    def run_installer(self, *args, **env):
        return subprocess.run(['sh', 'install.sh', *args], cwd=self.directory,
                              env={**self.env, **env}, input='', text=True,
                              stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                              start_new_session=True)

    def test_explicit_none_and_update_preserve_configuration(self):
        first = self.run_installer('--no-auth')
        self.assertEqual(first.returncode, 0, first.stderr)
        path = self.directory / '.env'
        original = path.read_bytes()
        self.assertIn(b'AUTH_MODE=none', original)
        self.assertEqual(path.stat().st_mode & 0o777, 0o600)
        second = self.run_installer()
        self.assertEqual(second.returncode, 0, second.stderr)
        self.assertEqual(path.read_bytes(), original)

    def test_new_noninteractive_install_requires_a_choice(self):
        result = self.run_installer()
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.directory / '.env').exists())

    def test_existing_credentials_cannot_be_disabled_by_a_flag(self):
        path = self.directory / '.env'
        original = 'POSTGRES_PASSWORD=existing\nAUTH_MODE=local\n'
        path.write_text(original)
        result = self.run_installer('--no-auth')
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(path.read_text(), original)

    def test_missing_auth_settings_fail_closed_before_start(self):
        result = self.run_installer('--auth')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('AUTH_MODE=local', (self.directory / '.env').read_text())
        self.assertNotIn('compose up', (self.directory / 'docker-calls.log').read_text())

    def test_local_mode_needs_no_credentials_until_the_first_browser_visit(self):
        result = self.run_installer('--auth', APP_ORIGIN='https://budget.example.org')
        self.assertEqual(result.returncode, 0, result.stderr)
        text = (self.directory / '.env').read_text()
        self.assertNotIn('AUTH_PASSWORD_HASH', text)
        self.assertIn('AUTH_COOKIE_SECURE=true', text)
        self.assertIn('first browser visit', result.stdout)

    def test_image_pull_failure_does_not_stop_existing_services(self):
        result = self.run_installer('--no-auth', FAIL_PULL='yes')
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn('compose stop', (self.directory / 'docker-calls.log').read_text())


if __name__ == '__main__':
    unittest.main()
