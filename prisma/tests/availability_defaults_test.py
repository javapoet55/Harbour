"""Run with python3 -m unittest discover -s prisma/tests -p '*_test.py'."""
import pathlib
import sqlite3
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]


class AvailabilityDefaultsTest(unittest.TestCase):
    def test_existing_defaults_custom_preferences_and_new_accounts(self):
        with sqlite3.connect(':memory:') as db:
            db.executescript((ROOT / 'sqlite/migrations/0_init/migration.sql').read_text())
            db.execute('ALTER TABLE UserPreference ADD COLUMN phoneNumber TEXT')
            db.execute('ALTER TABLE UserPreference ADD COLUMN personalizationEnabled BOOLEAN NOT NULL DEFAULT false')
            db.execute('ALTER TABLE UserPreference ADD COLUMN personalizationConsentAt DATETIME')
            for name in ('standard', 'custom', 'new'):
                db.execute('INSERT INTO User (id,email,name,passwordHash,updatedAt) VALUES (?,?,?,?,CURRENT_TIMESTAMP)',
                           (name, name + '@example.test', name, 'test'))
            for name in ('standard', 'custom'):
                db.execute('INSERT INTO UserPreference (id,userId,updatedAt) VALUES (?,?,CURRENT_TIMESTAMP)', (name, name))
            db.execute("UPDATE UserPreference SET workingDays='1,3,5', workStart='10:00', quietEnd='08:00' WHERE id='custom'")
            db.commit()
            db.executescript((ROOT / 'sqlite/migrations/z_20261019000000_availability_defaults/migration.sql').read_text())
            db.execute("INSERT INTO UserPreference (id,userId,updatedAt) VALUES ('new','new',CURRENT_TIMESTAMP)")
            rows = dict((row[0], row[1:]) for row in db.execute(
                'SELECT id,workingDays,workStart,workEnd,quietStart,quietEnd FROM UserPreference'))
            expected = ('0,1,2,3,4,5,6', '06:00', '21:00', '21:00', '06:00')
            self.assertEqual(rows['standard'], expected)
            self.assertEqual(rows['new'], expected)
            self.assertEqual(rows['custom'], ('1,3,5', '10:00', '17:00', '21:00', '08:00'))
            self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(), [])
