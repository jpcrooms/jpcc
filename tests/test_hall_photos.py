"""Tests of photo copying and manifest generation without real hall photographs."""
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


class HallPhotoTests(unittest.TestCase):
    def test_generated_manifest_and_clickable_photo_assets(self):
        with tempfile.TemporaryDirectory() as folder:
            work = Path(folder)
            (work / 'scripts').mkdir()
            shutil.copy2(ROOT / 'scripts/build-hall-photos.py', work / 'scripts/build-hall-photos.py')
            for hall in ('large', 'small'):
                (work / 'hall-photos-source' / hall).mkdir(parents=True)
            (work / 'hall-photos-source' / 'large' / 'Main view.jpg').write_bytes(b'FAKE IMAGE DATA')
            (work / 'hall-photos-source' / 'small' / 'meeting.webp').write_bytes(b'FAKE WEBP DATA')
            subprocess.run([sys.executable, str(work / 'scripts/build-hall-photos.py')], check=True, capture_output=True)
            manifest = json.loads((work / 'assets/hall-photos/manifest.json').read_text())
            self.assertEqual([len(h['photos']) for h in manifest], [1, 1])
            self.assertEqual(manifest[0]['photos'][0]['src'], 'assets/hall-photos/large/main-view-jpg.jpg')
            self.assertTrue((work / manifest[0]['photos'][0]['src']).exists())
            self.assertTrue((work / manifest[1]['photos'][0]['src']).exists())

    def test_thank_you_page_and_fallback_behavior(self):
        page = (ROOT / 'room-hire-thank-you.qmd').read_text()
        self.assertIn('not yet a confirmed booking', page)
        form = (ROOT / 'room-hire.qmd').read_text()
        self.assertIn('id="hire-form-status"', form)
        self.assertIn('data-hall-photos="large"', form)
        self.assertIn('data-hall-photos="small"', form)
        self.assertIn('data-select-hall="Large Hall"', form)
        self.assertIn('data-select-hall="Small Hall"', form)


if __name__ == '__main__':
    unittest.main()
