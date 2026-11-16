import re, os
base = "https://sonorbooks.github.io/podcast-feeds"
size = os.path.getsize("site/cta.mp3")
src = open("p7.xml", encoding="utf-8").read()
head, rest = src.split("<item>", 1)
items = ["<item>" + x for x in ("<item>" + rest).split("<item>")[1:]]
items[-1] = items[-1].split("</channel>")[0]
items = items[:50]
head = head.replace("Free Audiobooks in English Test", "Free Audiobooks in English T8")
head = re.sub(r'<atom:link href="[^"]+"', '<atom:link href="%s/t8.xml"' % base, head)
head = re.sub(r'https://srv1644251\.hstgr\.cloud/sonorbooks-catalogo-us/podcast-cover\.jpg', base + "/cover.jpg", head)
out = []
for it in items:
    it = it.replace("sonorbooks-us-t7:", "sonorbooks-us-t8:")
    it = re.sub(r'<enclosure url="[^"]+" type="audio/mpeg" length="\d+"',
                '<enclosure url="%s/cta.mp3" type="audio/mpeg" length="%d"' % (base, size), it)
    it = re.sub(r'\s*<itunes:image href="[^"]+" />', "", it)
    out.append(it.rstrip() + "\n    ")
xml = head + "".join(out).rstrip() + "\n  </channel>\n</rss>\n"
assert "hstgr" not in xml, "vps url left"
open("site/t8.xml", "w", encoding="utf-8").write(xml)

t9 = f'''<?xml version="1.0" encoding="utf-8"?>
<rss xmlns:atom="http://www.w3.org/2005/Atom" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" version="2.0">
  <channel>
    <title>Audiobook Picks in English</title>
    <link>https://sonorbooks.com/us/</link>
    <description>Short notes about audiobooks you can listen to for free in English.</description>
    <language>en</language>
    <atom:link href="{base}/t9.xml" rel="self" type="application/rss+xml" />
    <itunes:author>Audiobook Picks</itunes:author>
    <itunes:owner><itunes:name>Audiobook Picks</itunes:name><itunes:email>us@sonorbooks.com</itunes:email></itunes:owner>
    <itunes:category text="Arts"><itunes:category text="Books" /></itunes:category>
    <itunes:explicit>false</itunes:explicit>
    <itunes:image href="{base}/cover.jpg" />
    <image><url>{base}/cover.jpg</url><title>Audiobook Picks in English</title><link>https://sonorbooks.com/us/</link></image>
    <item>
      <title>Welcome to Audiobook Picks</title>
      <description>Welcome. Find free audiobooks in English at https://sonorbooks.com/us/</description>
      <guid isPermaLink="false">sonorbooks-us-t9:welcome</guid>
      <pubDate>Mon, 16 Nov 2026 22:00:00 GMT</pubDate>
      <enclosure url="{base}/cta.mp3" type="audio/mpeg" length="{size}" />
      <itunes:duration>10</itunes:duration>
      <itunes:explicit>false</itunes:explicit>
    </item>
  </channel>
</rss>
'''
open("site/t9.xml", "w", encoding="utf-8").write(t9)
open("site/index.html", "w").write("ok")
print("built", len(xml), xml.count("<item>"), size)

# t10: same as prueba-7 (audio and covers on the VPS), only the feed URL on github.io
h10 = src.split("<item>", 1)[0].replace("Free Audiobooks in English Test", "Free Audiobooks in English T10")
h10 = re.sub(r'<atom:link href="[^"]+"', '<atom:link href="%s/t10.xml"' % base, h10)
o10 = [it.replace("sonorbooks-us-t7:", "sonorbooks-us-t10:").rstrip() + "\n    " for it in items]
x10 = h10 + "".join(o10).rstrip() + "\n  </channel>\n</rss>\n"
open("site/t10.xml", "w", encoding="utf-8").write(x10)
print("t10", len(x10), x10.count("<item>"), x10.count("hstgr"))
