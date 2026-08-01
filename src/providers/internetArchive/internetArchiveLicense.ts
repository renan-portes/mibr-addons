const CREATIVE_COMMONS_HOSTS = new Set(["creativecommons.org", "www.creativecommons.org"]);
const PUBLIC_DOMAIN_PATH_PATTERN =
  /^\/publicdomain\/(?:mark|zero)\/1\.0(?:\/deed(?:\.[a-z0-9_-]+)?\/?)?\/?$/i;

export function isAcceptedInternetArchiveLicense(value: string): boolean {
  try {
    const url = new URL(value);

    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.username === "" &&
      url.password === "" &&
      url.port === "" &&
      CREATIVE_COMMONS_HOSTS.has(url.hostname.toLowerCase()) &&
      PUBLIC_DOMAIN_PATH_PATTERN.test(url.pathname)
    );
  } catch {
    return false;
  }
}
