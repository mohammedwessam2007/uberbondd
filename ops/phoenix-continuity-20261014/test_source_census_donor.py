"""Synthetic-only adversarial tests; never connect to a real Render or Neon DB."""
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch
import source_census_donor as c

NOW=datetime(2026,10,16,3,0,tzinfo=timezone.utc)
SHA='a'*40

def approval(**change):
    x=dict(scope=c.SCOPE,reviewed_source_sha=SHA,
           expires_at=(NOW+timedelta(minutes=4)).isoformat(),
           verified_activity=True)
    x.update(change)
    return x

class FakeConnection:
    autocommit=False

class TestCensus(unittest.TestCase):
    def test_requires_external_approval_verifier(self):
        x=c.census_source_readonly(FakeConnection(),approval(),SHA,lambda:NOW,None)
        self.assertFalse(x['census_ok'])
        self.assertFalse(x['source_read_only'])
        self.assertFalse(x['cutover_allowed'])
    def test_self_submitted_verifier_is_not_accepted(self):
        x=approval(verifier=lambda _:True)
        out=c.census_source_readonly(FakeConnection(),x,SHA,lambda:NOW,lambda _:True)
        self.assertFalse(out['census_ok'])
        self.assertEqual(out['refusal'],'APPROVAL_INVALID')
    def test_expired_wrong_scope_or_changed_sha_is_denied(self):
        for bad in [
            approval(scope='phoenix:restore'),
            approval(reviewed_source_sha='b'*40),
            approval(expires_at=(NOW-timedelta(seconds=1)).isoformat()),
            approval(verified_activity=False)
        ]:
            out=c.census_source_readonly(FakeConnection(),bad,SHA,lambda:NOW,lambda _:True)
            self.assertFalse(out['census_ok'])
    def test_untrusted_connection_denied_before_queries(self):
        conn=FakeConnection()
        with patch.object(c,'_live_read_only_txn',return_value=False):
            out=c.census_source_readonly(conn,approval(),SHA,lambda:NOW,lambda _:True)
        self.assertEqual(out['refusal'],'SOURCE_TRANSACTION_NOT_LIVE_READ_ONLY')
    def test_no_isolation_or_wrong_db_identity_denied(self):
        conn=FakeConnection()
        with patch.object(c,'_live_read_only_txn',return_value=True), \
            patch.object(c,'_live_isolation',return_value=False):
            out=c.census_source_readonly(conn,approval(),SHA,lambda:NOW,lambda _:True)
        self.assertEqual(out['refusal'],'SOURCE_ISOLATION_NOT_REPEATABLE_READ_ONLY')
        with patch.object(c,'_live_read_only_txn',return_value=True), \
            patch.object(c,'_live_isolation',return_value=True), \
            patch.object(c.r,'query',return_value=[('wrong-source',16)]):
            out=c.census_source_readonly(conn,approval(),SHA,lambda:NOW,lambda _:True)
        self.assertEqual(out['refusal'],'SOURCE_IDENTITY_OR_VERSION_MISMATCH')
    def test_approved_private_read_only_census_only_outputs_digests(self):
        conn=FakeConnection()
        inv={'tables':[('public','some_table','r')],'columns':[],'schemas':[]}
        fingerprints=[{'schema':'public','table':'some_table','rows':7,
                       'sorted_row_md5_sha256':'a'*64}]
        with patch.object(c,'_live_read_only_txn',return_value=True), \
            patch.object(c,'_live_isolation',return_value=True), \
            patch.object(c.r,'query',return_value=[(c.r.SOURCE_DB,16)]), \
            patch.object(c.r,'inventory',return_value=inv), \
            patch.object(c.r,'fingerprints',return_value=fingerprints), \
            patch.object(c.r,'sequence_states',return_value=[]):
            x=c.census_source_readonly(conn,approval(),SHA,lambda:NOW,lambda _:True)
        self.assertTrue(x['census_ok'])
        self.assertEqual(x['row_count'],7)
        self.assertTrue(x['source_read_only'] if 'source_read_only' in x else x['transaction_read_only'])
        self.assertFalse(x['cutover_allowed'])
        self.assertFalse(x['source_current_finalized'])
        self.assertTrue(x['point_in_time_only'])
        self.assertNotIn('some_table',str(x))

if __name__=='__main__': unittest.main()
