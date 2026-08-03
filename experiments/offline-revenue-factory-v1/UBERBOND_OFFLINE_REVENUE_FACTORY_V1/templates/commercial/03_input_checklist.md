# Input checklist — [LANE]

Nothing on this list is fetched, scraped, or inferred by the system.
Every item must be supplied by the buyer/partner as a local file before
`init-run` is called. Missing **required** files block `execute`
(critical issue, no findings produced); missing **optional** files
produce a minor issue and reduced coverage, not a hard stop.

## msft_csp (all required)
- [ ] `incident_timeline.json`
- [ ] `service_health_timeline.json`
- [ ] `subscription_metadata.json`
- [ ] `affected_services.json`
- [ ] `rule_source_registry.json`

## hospital_mrf
- [ ] At least one MRF candidate file (JSON, optionally gzip-compressed)
- [ ] (optional) `http_metadata.json`
- [ ] (optional) `filename_metadata.json`
- [ ] (optional) `link_map.json`
- [ ] (optional) `root_mrf_list.txt`

## agency_rfp
- [ ] `metadata.json` (`document_filename`, optional `amendment_filename`, `capture_note`)
- [ ] The RFP document itself, in this lane's self-defined line-based markup (`rfp.txt`) — real PDF/DOCX text must be transcribed into this format by a human first; the system does not parse binary office formats
- [ ] (if amended) `amendment.txt` in the same markup

## accessibility
- [ ] `automated_scan.json` (required)
- [ ] (optional) `manual_checklist.json`
- [ ] (optional) `page_inventory.json`

## lead_path
- [ ] `funnel_steps.json` (required)
- [ ] `form_fields.json` (required)
- [ ] (optional) `tracking_config.json`
- [ ] (optional) `synthetic_funnel_log.json`

## Before you send this to the buyer
- [ ] Confirm every file the buyer will supply is **not** production/live credential, PHI, or payment data — the system will force-quarantine (`PROHIBITED`) anything that matches `data_safety/classify.py` patterns, but do not rely on that as your only check.
- [ ] Confirm the buyer understands input is processed offline, once, and not retained beyond the run's own package output.
