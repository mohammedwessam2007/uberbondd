# frozen_string_literal: true

# Run inside pinned Postal 3.3.7 with Rails loaded:
#   bundle exec rails runner /config/uberdoso-postal-provision.rb
#
# This creates only UberDoso's organization, Live server, the two fixed roots,
# and any outreach-fleet sender domains named explicitly in
# UBERDOSO_POSTAL_SENDER_DOMAINS (comma-separated). A sender domain must be in
# OUTREACH_FLEET, which tests keep identical to src/outreach-domain-fleet.mjs.
# All 30 owned domains are outreach domains; adding more of them spreads
# sending reputation instead of concentrating it on the two roots.
# It never marks domains verified, never creates/export credentials, and never sends mail.

require "json"
require "digest"

VERSION = "uberbond.uberdoso-postal-provision.v1"
ROOTS = ["uberbond.agency", "uberbond.cloud"].freeze
OUTREACH_FLEET = %w[
  uberbond.site uberbondai.shop uberbondapp.site uberbondcloud.shop uberbondconnect.online
  uberbondcore.space uberbondengine.website uberbondflow.space uberbondforge.space uberbondglobal.website
  uberbondgrid.space uberbondgroup.site uberbondgrowth.online uberbondhq.site uberbondinfo.site
  uberbondlabs.site uberbondlaunch.website uberbondlink.shop uberbondops.website uberbondpartners.online
  uberbondpilot.website uberbondpro.shop uberbondpro.website uberbondreach.online uberbondsmail.site
  uberbondstack.website uberbondworks.site uberbondworks.website
].freeze
ORG_PERMALINK = "uberdoso"
SERVER_PERMALINK = "outbound"

class UberDosoProvisionError < StandardError; end

def text(value, max = 500)
  value.to_s.strip[0, max]
end

def fail!(code, detail = nil)
  suffix = detail.to_s.strip
  raise UberDosoProvisionError, suffix.empty? ? code : "#{code}:#{suffix}"
end

def sha256(value)
  Digest::SHA256.hexdigest(value.to_s)
end

def select_admin!
  requested = text(ENV["UBERDOSO_POSTAL_OWNER_EMAIL"], 255).downcase
  unless requested.empty?
    user = User.find_by(email_address: requested)
    fail!("postal-owner-user-not-found", requested) unless user
    fail!("postal-owner-user-not-admin", requested) unless user.admin?
    return user
  end
  admins = User.where(admin: true).order(:id).limit(2).to_a
  fail!("postal-admin-user-required") if admins.empty?
  fail!("multiple-postal-admins-require-owner-email") if admins.length > 1
  admins.first
end

def ensure_organization!(owner)
  organization = Organization.find_or_initialize_by(permalink: ORG_PERMALINK)
  if organization.persisted? && organization.owner_id != owner.id
    fail!("uberdoso-organization-owner-mismatch")
  end
  organization.name = "UberDoso"
  organization.time_zone = "UTC"
  organization.owner = owner
  organization.save!
  organization
end

def ensure_server!(organization)
  server = organization.servers.find_or_initialize_by(permalink: SERVER_PERMALINK)
  server.name = "UberDoso Outbound"
  server.mode = "Live"
  server.privacy_mode = true if server.respond_to?(:privacy_mode=)
  server.log_smtp_data = false if server.respond_to?(:log_smtp_data=)
  server.save!
  server
end

def uberdoso_domains(requested_env)
  requested = text(requested_env, 4000).split(",").map { |name| name.strip.downcase.chomp(".") }.reject(&:empty?)
  fail!("duplicate-sender-domain") if requested.uniq.length != requested.length
  requested.each do |name|
    fail!("sender-domain-not-in-verified-outreach-fleet", name) unless OUTREACH_FLEET.include?(name)
  end
  ROOTS + requested
end

def ensure_domain!(server, root)
  fail!("domain-not-uberdoso-root", root) unless ROOTS.include?(root) || OUTREACH_FLEET.include?(root)
  domain = server.domains.find_or_initialize_by(name: root)
  domain.verification_method = "DNS"
  domain.save!
  fail!("provisioner-illegally-verified-domain", root) if domain.verified?
  domain
end

# UBERDOSO_PROVISION_LIBRARY_ONLY=1 loads the definitions without touching Postal,
# so the domain-selection rules can be tested outside the Rails runtime.
return if ENV["UBERDOSO_PROVISION_LIBRARY_ONLY"] == "1"

begin
  selected = uberdoso_domains(ENV["UBERDOSO_POSTAL_SENDER_DOMAINS"])
  owner = select_admin!
  organization = ensure_organization!(owner)
  server = ensure_server!(organization)
  domains = selected.map { |root| ensure_domain!(server, root) }

  receipts = domains.map do |domain|
    {
      root: domain.name,
      role: ROOTS.include?(domain.name) ? "CANONICAL_ROOT" : "OUTREACH_FLEET_SENDER",
      uuid: domain.uuid,
      verified: domain.verified?,
      verificationMethod: domain.verification_method,
      verificationTokenDigest: sha256(domain.verification_token),
      verificationTxtValue: domain.dns_verification_string,
      dkimRecordHost: "#{domain.dkim_record_name}.#{domain.name}",
      dkimRecordValue: domain.dkim_record,
      spfRecordValue: domain.spf_record,
      returnPathHost: domain.return_path_domain,
      returnPathTarget: Postal::Config.dns.return_path_domain,
      mxRecords: Postal::Config.dns.mx_records,
      postalSpfInclude: Postal::Config.dns.spf_include
    }
  end

  puts JSON.generate({
    ok: true,
    schemaVersion: VERSION,
    status: "UBERDOSO_POSTAL_PROVISIONED_UNVERIFIED",
    organization: { uuid: organization.uuid, permalink: organization.permalink },
    server: { uuid: server.uuid, permalink: server.permalink, mode: server.mode },
    domains: receipts,
    credentialAuthority: "NONE__PRIVATE_RUNTIME_BOUNDARY_REQUIRED",
    sendAuthority: "NONE_UNTIL_POSTAL_DOMAIN_VERIFIED_AND_UBERBOND_GATES_PASS",
    externalEffectAuthority: "LOCAL_POSTAL_STATE_ONLY",
    truthBoundary: "This proves local Postal provisioning and generated DNS material only. Domains remain unverified. It does not prove public DNS, PTR, port 25, reputation, warm-up, deliverability, outreach authorization, or a sent message."
  })
rescue UberDosoProvisionError => error
  warn JSON.generate({ ok: false, schemaVersion: VERSION, status: "UBERDOSO_POSTAL_PROVISION_REFUSED", reasonCode: error.message, externalEffectAuthority: "NONE" })
  exit 2
rescue StandardError => error
  warn JSON.generate({ ok: false, schemaVersion: VERSION, status: "UBERDOSO_POSTAL_PROVISION_FAILED", errorClass: error.class.name, errorDigest: sha256(error.message), externalEffectAuthority: "NONE" })
  exit 3
end
