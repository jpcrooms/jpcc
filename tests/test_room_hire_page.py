"""Source-level checks for the public Quarto room hire enquiry page."""
from pathlib import Path
import re
import unittest

from bs4 import BeautifulSoup
import yaml

ROOT = Path(__file__).resolve().parents[1]


class RoomHirePageTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        qmd = (ROOT / 'room-hire.qmd').read_text()
        cls.page = qmd
        cls.html = BeautifulSoup(qmd, 'html.parser')
        cls.config = yaml.safe_load((ROOT / '_quarto.yml').read_text())

    def test_nav_and_sidebar(self):
        navbar = self.config['website']['navbar']['left']
        self.assertIn({'text': 'Room Hire', 'href': 'room-hire.qmd'}, navbar)
        self.assertIn('room-hire.qmd', self.config['website']['sidebar']['contents'][0]['contents'])

    def test_form_is_linked_to_supplied_formspree_endpoint(self):
        form = self.html.find('form', id='jpcc-room-hire-form')
        self.assertIsNotNone(form)
        self.assertEqual(form['action'], 'https://formspree.io/f/meagqraw')
        self.assertEqual(form['method'], 'POST')
        required_names = {'name','email','hall','attendees','start_date','finish_date','start_time',
                          'end_time','hire_type','event_purpose','acknowledge_enquiry_only'}
        found = {field.get('name') for field in form.find_all(['input','select','textarea']) if field.get('required') is not None}
        self.assertTrue(required_names.issubset(found), required_names - found)
        hall = form.find('select', attrs={'name': 'hall'})
        options = {o.get('value'): int(o.get('data-capacity')) for o in hall.find_all('option') if o.has_attr('data-capacity')}
        self.assertEqual(options, {'Large Hall': 80, 'Small Hall': 25})

    def test_free_plan_formspree_honeypot(self):
        form = self.html.find('form', id='jpcc-room-hire-form')
        traps = form.find_all('input', attrs={'name': '_gotcha'})
        self.assertEqual(len(traps), 1)
        trap = traps[0]
        self.assertEqual(trap['type'], 'text')  # Not type=hidden: simple bots can fill it.
        self.assertEqual(trap['autocomplete'], 'off')
        self.assertEqual(trap['tabindex'], '-1')
        self.assertFalse(trap.has_attr('disabled'))  # Must be included in FormData.
        self.assertFalse(trap.has_attr('required'))
        self.assertEqual(trap.parent.get('aria-hidden'), 'true')
        stylesheet = (ROOT / 'styles.css').read_text()
        self.assertIn('.room-hire-honeypot', stylesheet)
        self.assertIn('display: none !important', stylesheet)
        self.assertIsNone(trap.find_previous_sibling('label'))
        self.assertNotIn('Website', trap.parent.get_text())

    def test_shared_script_and_enquiry_only(self):
        scripts = self.html.find_all('script', src=True)
        self.assertEqual(len(scripts), 1)
        self.assertEqual(scripts[0]['src'], 'assets/js/jpcc-events.js')
        self.assertIn('does not reserve a hall', self.page)
        self.assertNotIn('bookings.json', self.page)

    def test_facilities_and_fees(self):
        for term in ['kitchen', 'wheelchair-accessible entrances', 'accessible toilets',
                     'accessible parking', 'additional cleaning fee']:
            self.assertIn(term, self.page)


if __name__ == '__main__':
    unittest.main()
