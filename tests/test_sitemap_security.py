"""Static unit tests for the legacy sitemap crawler's outbound URL guard."""
import ast
import unittest
from pathlib import Path
from urllib.parse import urlparse

APP_PATH = Path(__file__).resolve().parents[1] / "app.py"
TREE = ast.parse(APP_PATH.read_text(encoding="utf-8"))
FUNCTION = next(
    node for node in TREE.body
    if isinstance(node, ast.FunctionDef) and node.name == "_is_allowed_sitemap_url"
)
NAMESPACE = {"urlparse": urlparse}
exec(compile(ast.Module(body=[FUNCTION], type_ignores=[]), str(APP_PATH), "exec"), NAMESPACE)
is_allowed = NAMESPACE["_is_allowed_sitemap_url"]


class SitemapSecurityTests(unittest.TestCase):
    def test_allows_public_ip_on_standard_http_or_https_ports(self):
        addresses = {"8.8.8.8": ["8.8.8.8"]}
        self.assertTrue(is_allowed("https://8.8.8.8/sitemap.xml", "8.8.8.8", addresses))
        self.assertTrue(is_allowed("http://8.8.8.8/sitemap.xml", "8.8.8.8", addresses))

    def test_rejects_private_and_loopback_ip_addresses(self):
        for host in ("127.0.0.1", "10.0.0.1", "192.168.1.1", "169.254.1.1"):
            self.assertFalse(is_allowed(f"http://{host}/sitemap.xml", host, {host: [host]}))

    def test_rejects_external_host_even_when_public(self):
        self.assertFalse(is_allowed("https://attacker.example/sitemap.xml", "vu.edu.in", {}))

    def test_rejects_unsupported_schemes_and_nonstandard_ports(self):
        self.assertFalse(is_allowed("file:///etc/passwd", "vu.edu.in", {}))
        self.assertFalse(is_allowed("https://vu.edu.in:8080/sitemap.xml", "vu.edu.in", {}))
        self.assertFalse(is_allowed("http://vu.edu.in:443/sitemap.xml", "vu.edu.in", {}))

    def test_rejects_url_credentials(self):
        self.assertFalse(is_allowed("https://user:pass@vu.edu.in/sitemap.xml", "vu.edu.in", {}))

    def test_rejects_non_global_dns_answers(self):
        self.assertFalse(
            is_allowed("https://vu.edu.in/sitemap.xml", "vu.edu.in", {"vu.edu.in": ["10.0.0.1"]})
        )


if __name__ == "__main__":
    unittest.main()
