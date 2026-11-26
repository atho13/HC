#!/usr/bin/env python3
import json, os, sys

cfg_path = "/tmp/xray_custom.json"
if not os.path.exists(cfg_path):
    sys.exit(0)

with open(cfg_path, "r") as f:
    cfg = json.load(f)

ASSET_DIRS = ["/root/frdmxtunnel", "/usr/share/frdmxtunnel", "/usr/share/xray", "/usr/share/v2ray"]
has_geosite = any(os.path.exists(os.path.join(d, "geosite.dat")) for d in ASSET_DIRS)

block_ads = os.environ.get("BLOCK_ADS", "0") == "1"
block_porn = os.environ.get("BLOCK_PORN", "0") == "1"
direct_bank = os.environ.get("DIRECT_BANK", "0") == "1"
route_game = os.environ.get("ROUTE_GAME", "proxy")
route_stream = os.environ.get("ROUTE_STREAM", "proxy")
route_conf = os.environ.get("ROUTE_CONF", "proxy")

tags = {o.get("tag") for o in cfg.get("outbounds", [])}
if "direct" not in tags:
    cfg["outbounds"].append({
        "tag": "direct",
        "protocol": "freedom",
        "streamSettings": {"sockopt": {"mark": 255}}
    })
if "block" not in tags:
    cfg["outbounds"].append({"tag": "block", "protocol": "blackhole"})

rules = [
    {"type": "field", "inboundTag": ["dns-in"], "outboundTag": "dns-out"},
    {"type": "field", "inboundTag": ["dns-module"], "balancerTag": cfg["routing"]["balancers"][0]["tag"]} if cfg.get("routing", {}).get("balancers") else {"type": "field", "inboundTag": ["dns-module"], "outboundTag": "proxy"},
    {
        "type": "field",
        "ip": ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "127.0.0.0/8", "169.254.0.0/16"],
        "outboundTag": "direct"
    }
]

if block_ads:
    ads_dom = ["geosite:category-ads-all"] if has_geosite else [
        "domain:doubleclick.net", "domain:googlesyndication.com", "domain:googleadservices.com",
        "domain:admob.com", "domain:applovin.com", "keyword:adservice", "keyword:analytics"
    ]
    rules.append({"type": "field", "domain": ads_dom, "outboundTag": "block"})

if block_porn:
    porn_dom = ["geosite:category-porn"] if has_geosite else [
        "keyword:adult", "keyword:pornography", "keyword:restricted"
    ]
    rules.append({"type": "field", "domain": porn_dom, "outboundTag": "block"})

if direct_bank:
    bank_dom = [
        "regexp:.*\\.id$",
        "domain:bca.co.id", "domain:klikbca.com", "domain:mybca.bca.co.id",
        "domain:bri.co.id", "domain:brimo.bri.co.id",
        "domain:bankmandiri.co.id", "domain:livin.bankmandiri.co.id",
        "domain:bni.co.id", "domain:wondr.bni.co.id",
        "domain:bankbsi.co.id", "domain:bsimobile.co.id",
        "domain:cimbniaga.co.id", "domain:octomobile.co.id",
        "domain:danamon.co.id", "domain:permatabank.com", "domain:btn.co.id",
        "domain:seabank.co.id", "domain:jago.com", "domain:blubybcadigital.id",
        "domain:bankneocommerce.co.id", "domain:allobank.com",
        "domain:dana.id", "domain:ovo.id", "domain:gopay.co.id", "domain:gojek.com",
        "domain:shopeepay.co.id", "domain:shopee.co.id", "domain:tokopedia.com",
        "domain:linkaja.id", "domain:flip.id", "domain:qris.id",
        "domain:telkomsel.com", "domain:indosatooredoo.com", "domain:xl.co.id", "domain:axis.co.id", "domain:tri.co.id"
    ]
    if has_geosite:
        bank_dom.insert(0, "geosite:id")
    rules.append({"type": "field", "domain": bank_dom, "outboundTag": "direct"})

if route_game == "direct":
    game_dom = ["geosite:category-games"] if has_geosite else [
        "domain:mobilelegends.com", "domain:youngjoygame.com", "domain:moonton.com",
        "domain:pubgmobile.com", "domain:proximabeta.com", "domain:tencent.com",
        "domain:garena.com", "domain:freefiremobile.com", "domain:riotgames.com",
        "domain:steampowered.com", "domain:roblox.com", "domain:supercell.com",
        "domain:hoyoverse.com", "domain:mihoyo.com"
    ]
    rules.append({"type": "field", "domain": game_dom, "outboundTag": "direct"})

if route_stream == "direct":
    stream_dom = ["geosite:youtube", "geosite:netflix", "geosite:tiktok", "geosite:disney", "geosite:spotify"] if has_geosite else [
        "domain:youtube.com", "domain:googlevideo.com", "domain:ytimg.com",
        "domain:netflix.com", "domain:nflxvideo.net", "domain:tiktok.com", "domain:tiktokv.com",
        "domain:vidio.com", "domain:viu.com", "domain:disneyplus.com", "domain:spotify.com"
    ]
    rules.append({"type": "field", "domain": stream_dom, "outboundTag": "direct"})

if route_conf == "direct":
    conf_dom = ["geosite:zoom", "geosite:google-meet", "geosite:microsoft"] if has_geosite else [
        "domain:zoom.us", "domain:zoomgov.com", "domain:google.com",
        "domain:microsoft.com", "domain:webex.com"
    ]
    rules.append({"type": "field", "domain": conf_dom, "outboundTag": "direct"})

existing_routing = cfg.get("routing", {})
balancers = existing_routing.get("balancers", [])

if balancers:
    rules.append({"type": "field", "network": "tcp,udp", "balancerTag": balancers[0]["tag"]})
    cfg["routing"] = {"domainStrategy": "IPIfNonMatch", "balancers": balancers, "rules": rules}
else:
    main_proxy_tag = next((o["tag"] for o in cfg.get("outbounds", []) if o.get("tag") not in ("direct", "block", "dns-out")), "proxy")
    rules.append({"type": "field", "network": "tcp,udp", "outboundTag": main_proxy_tag})
    cfg["routing"] = {"domainStrategy": "IPIfNonMatch", "rules": rules}

with open(cfg_path, "w") as f:
    json.dump(cfg, f, indent=2)
