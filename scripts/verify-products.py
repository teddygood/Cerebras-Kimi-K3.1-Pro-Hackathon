#!/usr/bin/env python3
"""Verify returned retail product URLs live (HTTP 200, metadata, and Shopify availability)."""
import json
import re
import sys
import urllib.request
from html.parser import HTMLParser


class HeadParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.data = {}
        self._in_title = False
        self._title = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "meta" and a.get("property") in ("og:title", "og:url", "og:type"):
            self.data[a["property"]] = a.get("content")
        if tag == "link" and a.get("rel") == "canonical":
            self.data["canonical"] = a.get("href")
        if tag == "title":
            self._in_title = True

    def handle_endtag(self, tag):
        if tag == "title":
            self._in_title = False

    def handle_data(self, data):
        if self._in_title:
            self._title.append(data)

    @property
    def title(self):
        return "".join(self._title).strip()


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        return resp.status, resp.geturl(), resp.read()


def main():
    text = sys.stdin.read()
    urls = list(dict.fromkeys(re.findall(r"https://[^\s\)\]<>\"']+/products/[^\s\)\]<>\"']+", text)))
    proof = []
    for raw_url in urls:
        url = raw_url.rstrip(").,*]`")
        entry = {"url": url}
        try:
            status, final_url, page = fetch(url)
            parser = HeadParser()
            parser.feed(page.decode(errors="replace"))
            entry.update(
                {
                    "status": status,
                    "final": final_url,
                    "page_title": parser.title,
                    "head": parser.data,
                }
            )
            try:
                _, _, payload = fetch(url.split("?")[0] + ".js")
                prod = json.loads(payload)
                entry.update(
                    {
                        "shopify_title": prod.get("title"),
                        "shopify_id": prod.get("id"),
                        "available": prod.get("available"),
                    }
                )
            except Exception:
                pass
        except Exception as exc:
            entry["error"] = str(exc)
        proof.append(entry)
    print(json.dumps(proof, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
