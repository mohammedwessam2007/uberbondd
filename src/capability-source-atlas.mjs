export const CAPABILITY_SOURCE_ATLAS_VERSION='uberbond.capability-source-atlas.v1';
export const CAPABILITY_OBJECT_TARGET=1_000_000_000;
export const SOURCE_FAMILIES=Object.freeze([
 'github','gitlab','codeberg-forgejo-gitea','software-heritage','huggingface','model-hubs','npm','pypi','crates','rubygems','go-modules','maven-central','nuget-packagist','oci-registries','mcp-registry','a2a-agent-cards','plugin-ecosystems','arxiv','crossref','openalex','semantic-scholar','pubmed-pmc','datacite-zenodo-openml','benchmarks-leaderboards','uspto','epo-wipo','standards-rfcs','formal-proof-ecosystems','scientific-databases','robotics-simulation','hardware-compilers','osv-nvd-cisa','openssf-sigstore','x','bluesky','mastodon','reddit','youtube','hackernews','stackexchange','authorized-discord-telegram','rss-changelogs-mailinglists','commoncrawl','public-web-search','wikimedia-knowledge-graphs','government-open-data','sec-company-filings','procurement-grants-jobs','news-audio-video-metadata'
]);

export const HIGH_PRIORITY_DOMAINS=Object.freeze([
 'reasoning','memory','retrieval','formal-proof','causal-inference','forecasting','optimization','planning','code-intelligence','scientific-ai','robotics','simulation','world-models','hardware-acceleration','compilers','security','evaluation','multimodal','speech','creativity','learning-science','health-support','economic-intelligence','personal-knowledge','agent-protocols'
]);

export function buildCapabilitySourceAtlas(){
 return {version:CAPABILITY_SOURCE_ATLAS_VERSION,objectTarget:CAPABILITY_OBJECT_TARGET,sourceFamilyCount:SOURCE_FAMILIES.length,sourceFamilies:[...SOURCE_FAMILIES],priorityDomains:[...HIGH_PRIORITY_DOMAINS],truthBoundary:'ADDRESSABLE_TARGET_NOT_MEASURED_COUNT'};
}
