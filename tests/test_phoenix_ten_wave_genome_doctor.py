"""Full eight-wave source-pinned PHOENIX research inventory tests."""
import importlib.util
import json
import pathlib
import shutil
import tempfile
import unittest

REPO=pathlib.Path(__file__).resolve().parents[1]
TARGET=REPO/'scripts/phoenix-ten-wave-genome-doctor.py'
spec=importlib.util.spec_from_file_location('phoenix_genome_doctor',TARGET)
doctor=importlib.util.module_from_spec(spec)
spec.loader.exec_module(doctor)

class FullSourceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.full=doctor.build()

    def test_all_source_identities_preserved(self):
        self.assertEqual(self.full['recovered_proposals'],1560)
        self.assertEqual(self.full['wave4_unrecovered_proposal_count'],0)
        self.assertEqual(self.full['repository_urls'],243)
        self.assertEqual(self.full['family_groups'],122)
        self.assertEqual(len({x['id'] for x in self.full['records']}),1560)

    def test_no_capability_has_production_authority(self):
        self.assertEqual({x['promotion_authority'] for x in self.full['records']},{'NONE'})
        self.assertEqual({x['truth_class'] for x in self.full['records']},{'PROPOSED_RESEARCH_ONLY'})
        self.assertEqual(self.full['supplier_security_review_status'],'NOT_DONE')

    def test_original_pointer_resolves_exact_row(self):
        for row in self.full['records']:
            original=json.loads((REPO/row['source_path']).read_text())
            root,idx=row['source_pointer'].split('/')[1:]
            self.assertEqual(original[root][int(idx)]['id'],row['id'])

    def test_search_is_deterministic_and_not_promotion(self):
        a=doctor.search(self.full,'model verification tools',limit=10)
        b=doctor.search(self.full,'model verification tools',limit=10)
        self.assertEqual(a,b)
        self.assertTrue(a)
        self.assertTrue(all(x['promotion_authority']=='NONE' for x in a))
        self.assertEqual(doctor.search(self.full,'!!!'),[])

    def test_one_exact_title_collision_not_overwritten(self):
        self.assertGreaterEqual(len(self.full['exact_normalized_title_collision_groups']),1)
        self.assertTrue(all(len(group)>=2 for group in self.full['exact_normalized_title_collision_groups']))

    def test_wave4_identity_and_trust_class(self):
        wave4=[row for row in self.full['records'] if row['wave']==4]
        self.assertEqual(len(wave4),256)
        self.assertEqual(wave4[0]['id'],'phoenix-wave4-0001')
        self.assertTrue(all(r['promotion_authority']=='NONE' for r in wave4))

class HostileCorpusTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root=pathlib.Path(self.temp.name)
        shutil.copytree(REPO/doctor.REL,self.root/doctor.REL)
        target=self.root/'artifacts/research/founder-moonshot-literal-corpus'
        target.mkdir(parents=True)
        shutil.copyfile(REPO/target.relative_to(self.root)/'manifest.json',target/'manifest.json')

    def test_modified_candidate_fails_closed(self):
        target=self.root/doctor.REL/'original-genomes'/doctor.FILES[3][0]
        data=json.loads(target.read_text())
        data['capabilities'][0]['name']='FORGED TITLE'
        target.write_text(json.dumps(data))
        with self.assertRaisesRegex(ValueError,'SOURCE_SEMANTIC_HASH_MISMATCH'):
            doctor.build(self.root)

    def test_wave4_tampering_fails_closed(self):
        target=self.root/doctor.REL/'original-genomes'/doctor.FILES[4][0]
        original=target.read_text()
        target.write_text(original.replace('"priority": "P0"','"priority": "P9"',1))
        with self.assertRaisesRegex(ValueError,'WAVE4_PINNED_BLOB_MISMATCH'):
            doctor.build(self.root)

    def test_missing_source_fails_closed(self):
        (self.root/doctor.REL/'original-genomes'/doctor.FILES[7][0]).unlink()
        with self.assertRaisesRegex(ValueError,'MISSING_OR_SYMLINK_SOURCE'):
            doctor.build(self.root)

    def test_duplicate_json_key_fails_closed(self):
        target=self.root/doctor.REL/'original-genomes'/doctor.FILES[5][0]
        raw=target.read_text()
        target.write_text(raw.replace('"date":', '"date":"forged", "date":',1))
        with self.assertRaisesRegex(ValueError,'DUPLICATE_JSON_KEY'):
            doctor.build(self.root)

    def test_manifest_modification_fails_closed(self):
        target=self.root/doctor.REL/'repositories.urls.txt'
        target.write_text(target.read_text().replace('github.com','evil.example',1))
        with self.assertRaisesRegex(ValueError,'REPOSITORY_MANIFEST_HASH_OR_COUNT'):
            doctor.build(self.root)

    def test_missing_founder_source_fails_closed(self):
        (self.root/'artifacts/research/founder-moonshot-literal-corpus/manifest.json').unlink()
        with self.assertRaisesRegex(ValueError,'FOUNDER_890_MANIFEST_MISSING'):
            doctor.build(self.root)

if __name__=='__main__':
    unittest.main()
