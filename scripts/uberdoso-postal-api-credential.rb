# frozen_string_literal: true

# Run inside pinned Postal 3.3.7 with Rails loaded:
#   bundle exec rails runner /config/uberdoso-postal-api-credential.rb
#
# Creates exactly one API credential for the canonical UberDoso server.
# The raw key is emitted exactly once by Postal on creation. Callers MUST
# redirect stdout to a root-only file. If the credential already exists this
# script refuses to reveal/rotate anything because Postal credentials are
# immutable and the old raw secret should not be re-exported.

require "json"
require "digest"

VERSION = "uberbond.uberdoso-postal-api-credential.v1"
ORG_PERMALINK = "uberdoso"
SERVER_PERMALINK = "outbound"
CREDENTIAL_NAME = "UberBond Runtime API"

def sha256(value)
  Digest::SHA256.hexdigest(value.to_s)
end

def emit(value)
  puts JSON.generate(value)
end

begin
  organization = Organization.find_by(permalink: ORG_PERMALINK)
  raise "uberdoso-organization-not-found" unless organization

  server = organization.servers.find_by(permalink: SERVER_PERMALINK)
  raise "uberdoso-server-not-found" unless server

  existing = server.credentials.where(type: "API", name: CREDENTIAL_NAME).order(:id).to_a
  if existing.length > 1
    emit({
      ok: false,
      schemaVersion: VERSION,
      status: "UBERDOSO_POSTAL_API_CREDENTIAL_AMBIGUOUS",
      credentialCount: existing.length,
      secretReturned: false,
      rotationAuthority: "NONE"
    })
    exit 2
  end

  if existing.length == 1
    emit({
      ok: false,
      schemaVersion: VERSION,
      status: "UBERDOSO_POSTAL_API_CREDENTIAL_ALREADY_EXISTS_SECRET_NOT_RECOVERABLE",
      credentialUuid: existing.first.uuid,
      credentialName: existing.first.name,
      secretReturned: false,
      rotationAuthority: "EXPLICIT_SEPARATE_ACTION_REQUIRED",
      truthBoundary: "An API credential already exists. This script will not reveal, replace or rotate it. Use the protected first-boot secret file if it still exists; otherwise perform an explicit credential rotation workflow."
    })
    exit 3
  end

  credential = server.credentials.build(type: "API", name: CREDENTIAL_NAME, hold: false)
  credential.save!

  emit({
    ok: true,
    schemaVersion: VERSION,
    status: "UBERDOSO_POSTAL_API_CREDENTIAL_CREATED",
    credentialUuid: credential.uuid,
    credentialName: credential.name,
    apiKey: credential.key,
    apiKeyDigest: sha256(credential.key),
    secretReturned: true,
    rotationAuthority: "NONE",
    truthBoundary: "The raw API key is returned only by this first creation receipt. It proves a local Postal API credential exists; it does not grant campaign, recipient, DNS, deliverability or external-send authority."
  })
rescue StandardError => error
  emit({
    ok: false,
    schemaVersion: VERSION,
    status: "UBERDOSO_POSTAL_API_CREDENTIAL_FAILED",
    errorClass: error.class.name,
    errorDigest: sha256(error.message),
    secretReturned: false,
    rotationAuthority: "NONE"
  })
  exit 4
end
