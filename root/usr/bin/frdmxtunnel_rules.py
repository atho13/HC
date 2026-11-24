#!/usr/bin/env python3
import json, os, sys

cfg_path = "/tmp/xray_custom.json"
if not os.path.exists(cfg_path):
    sys.exit(0)

with open(cfg_path, "r") as f:
    cfg = json.load(f)

has_geosite = os.path.exists("/root/frdmxtunnel/geosite.dat") or os.path.exists("/usr/share/xray/geosite.dat") or os.path.exists("/usr/share/v2ray/geosite.dat")
has_geoip = os.path.exists("/root/frdmxtunnel/geoip.dat") or os.path.exists("/usr/share/xray/geoip.dat") or os.path.exists("/usr/share/v2ray/geoip.dat")

block_ads = os.environ.get("BLOCK_ADS", "0") == "1"
block_porn = os.environ.get("BLOCK_PORN", "0") == "1"
direct_bank = os.environ.get("DIRECT_BANK", "0") == "1"
route_game = os.environ.get("ROUTE_GAME", "proxy")
route_stream = os.environ.get("ROUTE_STREAM", "proxy")
route_conf = os.environ.get("ROUTE_CONF", "proxy")

tags = {o.get("tag") for o in cfg.get("outbounds", [])}
if "direct" not in tags:
    cfg["outbounds"].append({"tag": "direct", "protocol": "freedom", "streamSettings": {"sockopt": {"mark": 255}}})
if "block" not in tags:
    cfg["outbounds"].append({"tag": "block", "protocol": "blackhole"})

rules = [{"type": "field", "inboundTag": ["dns-module"], "outboundTag": "direct"}]

# 1. Block Ads
if block_ads:
    ads_dom = ["geosite:category-ads-all"] if has_geosite else [
        "domain:doubleclick.net", "domain:googlesyndication.com", "domain:googleadservices.com",
        "domain:admob.com", "domain:applovin.com", "keyword:adservice", "keyword:analytics"
    ]
    rules.append({"type": "field", "domain": ads_dom, "outboundTag": "block"})

# 2. Block Adult / 18+ Sites
if block_porn:
    porn_dom = ["geosite:category-porn"] if has_geosite else [
        "keyword:porn", "keyword:xxx", "keyword:xvideos", "keyword:xnxx",
        "keyword:xhamster", "keyword:hentai", "keyword:jav"
    ]
    rules.append({"type": "field", "domain": porn_dom, "outboundTag": "block"})

# 3. Direct M-Banking & Indonesia (.id)
if direct_bank:
    bank_dom = ["geosite:category-bank-id", "regexp:.*\\.id$"] if has_geosite else [
        "regexp:.*\\.id$", "domain:bca.co.id", "domain:klikbca.com", "domain:bri.co.id",
        "domain:bankmandiri.co.id", "domain:bni.co.id", "domain:bankbsi.co.id",
        "domain:dana.id", "domain:ovo.id", "domain:gopay.co.id", "domain:shopeepay.co.id"
    ]
    rules.append({"type": "field", "domain": bank_dom, "outboundTag": "direct"})
    rules.append({"type": "field", "ip": ["geoip:id", "geoip:private"] if has_geoip else ["geoip:private"], "outboundTag": "direct"})

# 4. Game Online Traffic
if route_game == "direct":
    game_dom = ["geosite:category-games"] if has_geosite else [
        "domain:mobilelegends.com", "domain:youngjoygame.com", "domain:pubgmobile.com",
        "domain:garena.com", "domain:freefiremobile.com", "domain:riotgames.com",
        "domain:steampowered.com", "domain:roblox.com", "domain:supercell.com"
    ]
    rules.append({"type": "field", "domain": game_dom, "outboundTag": "direct"})

# 5. Streaming
if route_stream == "direct":
    stream_dom = ["geosite:youtube", "geosite:netflix", "geosite:tiktok", "geosite:disney", "geosite:spotify"] if has_geosite else [
        "domain:youtube.com", "domain:googlevideo.com", "domain:ytimg.com",
        "domain:netflix.com", "domain:nflxvideo.net", "domain:tiktok.com", "domain:tiktokv.com"
    ]
    rules.append({"type": "field", "domain": stream_dom, "outboundTag": "direct"})

# 6. Video Conference
if route_conf == "direct":
    conf_dom = ["geosite:zoom", "geosite:google-meet", "geosite:microsoft"] if has_geosite else [
        "domain:zoom.us", "domain:zoomgov.com", "domain:meet.google.com",
        "domain:teams.microsoft.com", "domain:webex.com"
    ]
    rules.append({"type": "field", "domain": conf_dom, "outboundTag": "direct"})

cfg["routing"] = {"domainStrategy": "IPIfNonMatch", "rules": rules}
with open(cfg_path, "w") as f:
    json.dump(cfg, f, indent=2)
