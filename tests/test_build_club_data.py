"""Integration tests: Quarto club front matter is the source of schedule data."""
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class BuildClubDataTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        (self.root / 'clubs').mkdir()
        (self.root / 'data').mkdir()
        (self.root / 'scripts').mkdir()
        for p in (ROOT / 'clubs').glob('*.qmd'):
            shutil.copy2(p, self.root / 'clubs' / p.name)
        shutil.copy2(ROOT / 'data' / 'rooms.json', self.root / 'data' / 'rooms.json')
        shutil.copy2(ROOT / 'scripts' / 'build-club-data.py', self.root / 'scripts' / 'build-club-data.py')

    def run_builder(self):
        return subprocess.run([sys.executable, str(self.root / 'scripts' / 'build-club-data.py')],
                              capture_output=True, text=True)

    def test_original_pages_are_collected_without_inventing_times(self):
        completed = self.run_builder()
        self.assertEqual(completed.returncode, 0, completed.stderr)
        clubs = json.loads((self.root / 'data' / 'clubs.json').read_text())
        self.assertEqual(len(clubs), 2)
        radio = next(c for c in clubs if c['id'] == 'vk5alm')
        self.assertEqual(radio['events'][0]['startTime'], '19:00')
        self.assertNotIn('endTime', radio['events'][0])
        self.assertNotIn('roomId', radio['events'][0])
        christ = next(c for c in clubs if c['id'] == 'murray-bridge-christadelphians')
        self.assertEqual(christ['events'], [])

    def test_new_club_qmd_is_discovered_automatically(self):
        (self.root / 'clubs' / 'new-club.qmd').write_text("""---
title: New Club
jpcc:
  id: example-club
  name: Example Club
  events:
    - id: weekly
      title: Example practice
      frequency: weekly
      weekdays: [mon]
      startDate: '2026-11-01'
      startTime: '18:00'
      endTime: '19:00'
      roomId: room-2
---
A club page.
""")
        completed = self.run_builder()
        self.assertEqual(completed.returncode, 0, completed.stderr)
        clubs = json.loads((self.root / 'data' / 'clubs.json').read_text())
        self.assertEqual(len(clubs), 3)
        new_club = next(c for c in clubs if c['id'] == 'example-club')
        self.assertEqual(new_club['events'][0]['roomId'], 'room-2')

    def test_room_assignment_requires_end_time(self):
        radio = self.root / 'clubs' / 'VK5ALM-radio-club.qmd'
        radio.write_text(radio.read_text().replace('      startTime: \'19:00\'',
                                                    '      startTime: \'19:00\'\n      roomId: room-1'))
        completed = self.run_builder()
        self.assertNotEqual(completed.returncode, 0)
        self.assertIn('needs endTime', completed.stderr)


if __name__ == '__main__':
    unittest.main()
