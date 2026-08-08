import fs from 'node:fs/promises';
import { bindConstitution, ConstitutionBindingError } from '../src/omnia-v9/constitution.mjs';

const manifestPath = new URL('../config/omnia-v9/constitution-sources.json', import.meta.url);

async function run() {
  let manifest;
  try {
    manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  } catch (error) {
    return {
      schemaVersion: 'omnia.v9.verify.p2',
      status: 'FAIL',
      reason: `manifest-unreadable:${String(error?.message || error)}`
    };
  }

  const sources = new Map();
  const missing = [];
  for (const source of manifest.sources || []) {
    try {
      const bytes = await fs.readFile(new URL(`../${source.path}`, import.meta.url));
      sources.set(source.role, bytes);
    } catch (error) {
      missing.push({ role: source.role, path: source.path, error: String(error?.code || error?.message || error) });
    }
  }
  if (missing.length) {
    return {
      schemaVersion: 'omnia.v9.verify.p2',
      status: 'INCOMPLETE',
      missing,
      truthRule: 'Missing normative source means INCOMPLETE, never a partial constitution.'
    };
  }

  try {
    const first = bindConstitution({ manifest, sourceBytesByRole: sources });
    const second = bindConstitution({ manifest, sourceBytesByRole: sources });
    if (first.constitutionDigest !== second.constitutionDigest) {
      return {
        schemaVersion: 'omnia.v9.verify.p2',
        status: 'FAIL',
        reason: 'nondeterministic-constitution-digest',
        first: first.constitutionDigest,
        second: second.constitutionDigest
      };
    }
    return {
      schemaVersion: 'omnia.v9.verify.p2',
      status: 'P2_CONSTITUTION_BOUND',
      constitutionDigest: first.constitutionDigest,
      sourceSetDigest: first.sourceSetDigest,
      semantics: first.semantics,
      sources: first.sourceSet.sources,
      precedenceRules: first.sourceSet.precedenceRules,
      truthRule: 'This binds exact normative sources and explicit precedence. It does not claim Markdown is executable policy.'
    };
  } catch (error) {
    if (error instanceof ConstitutionBindingError) {
      return {
        schemaVersion: 'omnia.v9.verify.p2',
        status: error.code === 'INCOMPLETE' ? 'INCOMPLETE' : 'CANONICAL_CONFLICT',
        reason: error.message,
        detail: error.detail
      };
    }
    return {
      schemaVersion: 'omnia.v9.verify.p2',
      status: 'FAIL',
      reason: String(error?.stack || error)
    };
  }
}

const report = await run();
console.log(JSON.stringify(report, null, 2));
process.exit(report.status === 'P2_CONSTITUTION_BOUND' ? 0 : report.status === 'INCOMPLETE' ? 2 : 1);
