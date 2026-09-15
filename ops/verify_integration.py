"""Explicit suite selection; no model or DB dependency in ordinary CI.

Run from the repository root. Live modes require a separately verified staging
environment; setting the attestation is not itself proof of provider isolation.
"""
import argparse
import os
from pathlib import Path
import subprocess
import sys
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
READ_DB = ['tests/golden.py', 'tests/test_brief_live.py', 'tests/test_pins_live.py',
           'tests/test_storehub_tools_live.py']
APP_DB = ['tests/test_page_reader_live.py', 'tests/test_page_workshop_live.py',
          'tests/test_thread_as_page_live.py']


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('suite', choices=['pure', 'contracts', 'read-db', 'app-db', 'model'])
    args = parser.parse_args()
    env = dict(os.environ)
    env['ENVIRONMENT'] = 'staging'
    env.pop('GEORGE_LOG_DATABASE_URL', None)
    if args.suite in {'pure', 'contracts'}:
        files = [str(p.relative_to(ROOT)) for p in sorted((ROOT / 'tests').glob('test_*.py'))
                 if not p.name.endswith('_live.py')
                 and (args.suite == 'pure' or p.name.endswith('_contract.py'))]
        # Override any dotenv defaults as well as inherited credentials.
        env['DATABASE_URL'] = 'postgresql+asyncpg://unused:unused@127.0.0.1:1/unused'
        env['GEORGE_DATABASE_URL'] = ''
    else:
        required = ['GEORGE_DATABASE_URL']
        if args.suite == 'app-db':
            required.append('DATABASE_URL')
        if args.suite == 'model':
            required.append('ANTHROPIC_API_KEY')
            if env.get('GEORGE_EVALS') != '1':
                parser.error('model suite requires explicit GEORGE_EVALS=1 approval')
        if env.get('STAGING_DATABASE_VERIFIED') != '1':
            parser.error('live suites require STAGING_DATABASE_VERIFIED=1 after target verification')
        if any(not env.get(k) for k in required):
            parser.error('required live-suite credentials are missing (values never logged)')
        files = {'read-db': READ_DB, 'app-db': APP_DB,
                 'model': ['tests/evals']}[args.suite]
    if args.suite != 'model':
        env['GEORGE_EVALS'] = '0'
        env['GEORGE_EVAL_JUDGE'] = '0'
        env['ANTHROPIC_API_KEY'] = ''
        env.pop('ANTHROPIC_AUTH_TOKEN', None)
    report = ROOT / 'verification' / (args.suite + '.xml')
    report.parent.mkdir(exist_ok=True)
    result = subprocess.run([sys.executable, '-m', 'pytest', *files, '-q', '--tb=short',
                             '-o', 'xfail_strict=true', '--junitxml=' + str(report)], cwd=ROOT, env=env)
    if result.returncode:
        return result.returncode
    cases = list(ET.parse(report).getroot().iter('testcase'))
    skipped = [s for c in cases for s in c.findall('skipped')]
    unexpected = [s for s in skipped if args.suite != 'model' or s.get('type') != 'pytest.xfail']
    if not cases or unexpected or len(skipped) == len(cases):
        print('FAIL: suite did not execute completely; inspect the test report')
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
