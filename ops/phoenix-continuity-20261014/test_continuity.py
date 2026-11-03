import contextlib, importlib.util, io, json, os, pathlib, subprocess, sys, unittest
sys.path.insert(0,str(pathlib.Path(__file__).parent))
import continuity as c

class CryptoAdmission(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Independent production-format generator uses native Node crypto, not Python decrypt code.
        code = "const c=require('crypto'),k=Buffer.alloc(32,7),iv=Buffer.alloc(12,3),x=c.createCipheriv('aes-256-gcm',k,iv);const data=Buffer.concat([x.update(JSON.stringify({smtpPassword:'synthetic-fixture-only'})),x.final()]);console.log(JSON.stringify({key:k.toString('hex'),blob:{iv:iv.toString('base64'),tag:x.getAuthTag().toString('base64'),data:data.toString('base64')}}));"
        cls.fixture=json.loads(subprocess.check_output(['node','-e',code],text=True))
    def test_native_node_format_authenticates(self):
        self.assertIs(c.compatible_tokens([self.fixture['blob']],self.fixture['key']),True)
    def test_wrong_key_refuses(self):
        self.assertIs(c.compatible_tokens([self.fixture['blob']],'08'*32),False)
    def test_corrupt_tag_refuses(self):
        b=dict(self.fixture['blob']);b['tag']='AAAAAAAAAAAAAAAAAAAAAA=='
        self.assertIs(c.compatible_tokens([b],self.fixture['key']),False)
    def test_missing_and_empty_refuse(self):
        for value in ([],None,[{}],[None]):
            self.assertIs(c.compatible_tokens(value,self.fixture['key']),False)
    def test_malformed_base64_refuses(self):
        b=dict(self.fixture['blob']);b['data']='!notbase64'
        self.assertIs(c.compatible_tokens([b],self.fixture['key']),False)
    def test_unbounded_accounts_refuse(self):
        self.assertIs(c.compatible_tokens([self.fixture['blob']]*(c.MAX_ENCRYPTED_ACCOUNTS+1),self.fixture['key']),False)
    def test_unknown_envelope_refuses(self):
        b=dict(self.fixture['blob']);b['extra']='ambiguous'
        self.assertIs(c.compatible_tokens([b],self.fixture['key']),False)
    def test_no_plaintext_or_exception_output(self):
        out=io.StringIO()
        with contextlib.redirect_stdout(out),contextlib.redirect_stderr(out):
            c.compatible_tokens([self.fixture['blob']],self.fixture['key'])
            c.compatible_tokens([{'iv':'secret-error'}],'invalid-key')
        self.assertEqual(out.getvalue(),'')
    def test_disabled_gate_has_no_secret_or_network_dependency(self):
        env=dict(os.environ)
        try:
            os.environ.clear()
            out=io.StringIO()
            with contextlib.redirect_stdout(out): c.job()
            self.assertIn('WAITING_FOR_EXACT_GATE',out.getvalue())
        finally:
            os.environ.clear();os.environ.update(env)
    def test_source_pin_refuses_before_secret_read(self):
        env=dict(os.environ)
        try:
            os.environ.clear();os.environ['CONTINUITY_EXECUTION_GATE']=c.GATE
            out=io.StringIO()
            with contextlib.redirect_stdout(out): c.job()
            self.assertIn('REFUSED_UNREVIEWED_SOURCE',out.getvalue())
        finally: os.environ.clear();os.environ.update(env)
    def test_expired_approval_refuses_before_secret_read(self):
        env=dict(os.environ)
        try:
            os.environ.clear();os.environ.update(CONTINUITY_EXECUTION_GATE=c.GATE,CONTINUITY_REVIEWED_SHA='a'*40,RENDER_GIT_COMMIT='a'*40,CONTINUITY_APPROVAL_EXPIRES_AT='2020-01-01T00:00:00Z')
            out=io.StringIO()
            with contextlib.redirect_stdout(out): c.job()
            self.assertIn('REFUSED_EXPIRED_APPROVAL',out.getvalue())
        finally: os.environ.clear();os.environ.update(env)

if __name__=='__main__':unittest.main()
