from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlparse


class ResearchSafetyError(Exception):
    pass


BLOCKED_HOSTNAMES = frozenset(
    {
        "localhost",
        "metadata.google.internal",
        "metadata.google.internal.",
    }
)


def normalize_domain(domain: str) -> str:
    return domain.strip().lower().rstrip(".")


def domain_allowed(hostname: str, allow_domain: str) -> bool:
    host = normalize_domain(hostname.split(":", 1)[0])
    allowed = normalize_domain(allow_domain)
    if not host or not allowed:
        return False
    return host == allowed or host.endswith(f".{allowed}")


def _is_blocked_ip(address: ipaddress._BaseAddress) -> bool:
    return bool(
        address.is_loopback
        or address.is_private
        or address.is_link_local
        or address.is_multicast
        or address.is_reserved
        or address.is_unspecified
        or str(address) == "169.254.169.254"
    )


def _hostname_is_ip(hostname: str) -> bool:
    try:
        ipaddress.ip_address(hostname)
        return True
    except ValueError:
        return False


def validate_research_url(url: str, *, allow_domain: str) -> str:
    parsed = urlparse(url.strip())
    if parsed.scheme != "https":
        raise ResearchSafetyError("only HTTPS URLs are allowed for research")
    if parsed.username or parsed.password:
        raise ResearchSafetyError("URLs with embedded credentials are not allowed")
    if not parsed.hostname:
        raise ResearchSafetyError("URL must include a hostname")
    hostname = parsed.hostname.lower()
    if hostname in BLOCKED_HOSTNAMES:
        raise ResearchSafetyError(f"blocked hostname: {hostname}")
    if _hostname_is_ip(hostname):
        ip = ipaddress.ip_address(hostname)
        if _is_blocked_ip(ip):
            raise ResearchSafetyError(f"blocked IP address: {hostname}")
        raise ResearchSafetyError("direct IP URLs are not allowed; use a domain name")
    if not domain_allowed(hostname, allow_domain):
        raise ResearchSafetyError(
            f"domain {hostname!r} is not allowed by --allow-domain {allow_domain!r}"
        )
    return url.strip()


def validate_redirect_url(url: str, *, allow_domain: str) -> str:
    return validate_research_url(url, allow_domain=allow_domain)


def resolve_and_validate_host(hostname: str, *, allow_domain: str) -> None:
    host = hostname.lower()
    if host in BLOCKED_HOSTNAMES:
        raise ResearchSafetyError(f"blocked hostname: {host}")
    if not domain_allowed(host, allow_domain):
        raise ResearchSafetyError(
            f"domain {host!r} is not allowed by --allow-domain {allow_domain!r}"
        )
    try:
        infos = socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)
    except socket.gaierror as err:
        raise ResearchSafetyError(f"unable to resolve host {host!r}: {err}") from err
    for info in infos:
        ip_str = info[4][0]
        ip = ipaddress.ip_address(ip_str)
        if _is_blocked_ip(ip):
            raise ResearchSafetyError(f"resolved address blocked for {host!r}: {ip_str}")
