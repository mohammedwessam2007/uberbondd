// Reading an Avengers artifact, and saying what it means when there is none.
//
// The arsenal chain is doctor -> plan -> tick, each step reading what the last
// one wrote. When a step is missing its input, the fact worth reporting is which
// step has not run, not which byte the JSON parser gave up on.
//
// Before this, all four paths threw and were caught by a generic handler that
// printed the raw error: `AVENGERS_TICK_CRASHED / ENOENT: no such file or
// directory, open '.../avengers-squad-plan.json'`. That is the arsenal's most
// common state -- nothing is callable on a host with no configured provider, so
// the planner refuses and writes no plan -- and it was being reported as a crash
// about a filename.
//
// A missing artifact is not a crash. It is a step that has not run yet, and the
// operator's next move is knowable, so it is named here rather than inferred by
// whoever is reading the stack trace.
import { readFileSync } from 'node:fs';

/**
 * @param {string} file absolute path to the artifact
 * @param {{kind: string, producedBy: string, describes: string}} spec
 */
export function readAvengersArtifact(file, spec) {
  const kind = String(spec?.kind || 'artifact').toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  const slug = String(spec?.kind || 'artifact').toLowerCase().replace(/[^a-z0-9]+/g, '-');

  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return {
        ok: false,
        status: `AVENGERS_${kind}_NOT_GENERATED`,
        reasonCodes: [`${slug}-artifact-not-generated`],
        file,
        nextStep: spec?.producedBy || null,
        // Said plainly, because the producing step can itself be legitimately
        // blocked: with no configured provider nothing is callable, the planner
        // refuses, and no plan is written. That is the system working, and it
        // should not read as a missing file.
        detail: `${spec?.describes || 'This artifact'} has not been generated yet.`
          + (spec?.producedBy ? ` Run \`${spec.producedBy}\` first; note that it may itself refuse if the arsenal has nothing callable.` : '')
      };
    }
    return {
      ok: false,
      status: `AVENGERS_${kind}_UNREADABLE`,
      reasonCodes: [`${slug}-artifact-unreadable`],
      file,
      nextStep: spec?.producedBy || null,
      detail: `${spec?.describes || 'This artifact'} exists but could not be read: ${error?.code || error?.message || error}.`
    };
  }

  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (error) {
    return {
      ok: false,
      status: `AVENGERS_${kind}_MALFORMED`,
      reasonCodes: [`${slug}-artifact-malformed`],
      file,
      nextStep: spec?.producedBy || null,
      // A half-written artifact is worse than an absent one, because everything
      // downstream would otherwise treat whatever parsed as truth. Regenerating
      // is the fix; patching the file by hand is how a corrupt artifact becomes
      // durable.
      detail: `${spec?.describes || 'This artifact'} is not valid JSON (${error?.message || error}).`
        + (spec?.producedBy ? ` Regenerate it with \`${spec.producedBy}\` rather than editing it.` : '')
    };
  }
}
