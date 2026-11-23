#!/bin/sh
# HTTP Custom Core Engine - Synced with LuCI main.js

LOG_FILE="/var/log/httpcustom.log"
: > "$LOG_FILE"
log() { echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" >> "$LOG_FILE"; }

# 1. Baca konfigurasi UCI (menggunakan indeks @profile[0] sesuai TypedSection di main.js)
ENABLED=$(uci -q get httpcustom.main.enabled)
[ "$ENABLED" != "1" ] && exit 0

PROTO=$(uci -q get httpcustom.@profile[0].proto)
MODE=$(uci -q get httpcustom.@profile[0].mode)
SERVER=$(uci -q get httpcustom.@profile[0].server)
PORT=$(uci -q get httpcustom.@profile[0].port)
USER=$(uci -q get httpcustom.@profile[0].username)
PASS=$(uci -q get httpcustom.@profile[0].password)
PAYLOAD=$(uci -q get httpcustom.@profile[0].payload)
SNI=$(uci -q get httpcustom.@profile[0].sni)

log "Starting HTTP Custom Core..."
log "Target: $SERVER:$PORT | Protocol: $PROTO | Mode: $MODE"

# 2. Optimasi Kernel TCP
sysctl -w net.ipv4.tcp_rmem="8192 262144 33554432" >/dev/null 2>&1
sysctl -w net.ipv4.tcp_wmem="8192 262144 33554432" >/dev/null 2>&1
sysctl -w net.ipv4.tcp_mtu_probing=1 >/dev/null 2>&1

# 3. Protocol & Mode Routing Logic
if [ "$PROTO" = "ssh" ]; then
    if [ "$MODE" = "payload" ]; then
        log "Starting HTTP Payload Injector (127.0.0.1:8989)..."
        python3 -u /usr/bin/httpcustom_payload.py "$SERVER" "$PORT" "$PAYLOAD" >> "$LOG_FILE" 2>&1 &
        sleep 2
        log "Connecting SSH via Payload Injector (SOCKS5 0.0.0.0:1080)..."
        exec sshpass -p "$PASS" ssh \
            -o StrictHostKeyChecking=no \
            -o UserKnownHostsFile=/dev/null \
            -o ServerAliveInterval=15 \
            -o ServerAliveCountMax=3 \
            -o ProxyCommand="nc 127.0.0.1 8989" \
            -N -D 0.0.0.0:1080 "$USER@$SERVER" >> "$LOG_FILE" 2>&1

    elif [ "$MODE" = "ssl" ]; then
        log "Starting Stunnel SSL/TLS with SNI ($SNI) on 127.0.0.1:8990..."
        cat > /tmp/stunnel_custom.conf <<EOF
foreground = yes
client = yes
[ssh-tls]
accept = 127.0.0.1:8990
connect = $SERVER:$PORT
sni = ${SNI:-$SERVER}
EOF
        stunnel /tmp/stunnel_custom.conf >> "$LOG_FILE" 2>&1 &
        sleep 2
        log "Connecting SSH via SSL/TLS Tunnel (SOCKS5 0.0.0.0:1080)..."
        exec sshpass -p "$PASS" ssh \
            -o StrictHostKeyChecking=no \
            -o UserKnownHostsFile=/dev/null \
            -o ServerAliveInterval=15 \
            -o ServerAliveCountMax=3 \
            -N -D 0.0.0.0:1080 -p 8990 "$USER@127.0.0.1" >> "$LOG_FILE" 2>&1

    else
        log "Connecting Direct SSH (SOCKS5 0.0.0.0:1080)..."
        exec sshpass -p "$PASS" ssh \
            -o StrictHostKeyChecking=no \
            -o UserKnownHostsFile=/dev/null \
            -o ServerAliveInterval=15 \
            -o ServerAliveCountMax=3 \
            -N -D 0.0.0.0:1080 -p "$PORT" "$USER@$SERVER" >> "$LOG_FILE" 2>&1
    fi

elif [ "$PROTO" = "vless" ]; then
    # Di main.js, UUID disimpan di opsi 'password'
    UUID="$PASS"
    log "Generating Xray Configuration for VLESS+WS+TLS (SNI: ${SNI:-$SERVER})..."
    
    cat > /tmp/xray_custom.json <<EOF
{
  "inbounds": [
    {"port": 1080, "listen": "0.0.0.0", "protocol": "socks", "settings": {"udp": true}}
  ],
  "outbounds": [{
    "protocol": "vless",
    "settings": { "vnext": [{ "address": "$SERVER", "port": $PORT, "users": [{"id": "$UUID", "encryption": "none"}] }] },
    "streamSettings": {
      "network": "ws",
      "security": "tls",
      "tlsSettings": { "serverName": "${SNI:-$SERVER}", "allowInsecure": true },
      "wsSettings": { "path": "/" }
    }
  }]
}
EOF
    log "Starting Xray Core (SOCKS5 0.0.0.0:1080)..."
    exec xray run -c /tmp/xray_custom.json >> "$LOG_FILE" 2>&1

elif [ "$PROTO" = "ovpn" ]; then
    log "Starting OpenVPN Client..."
    if [ -f "/etc/httpcustom/client.ovpn" ]; then
        printf "%s\n%s\n" "$USER" "$PASS" > /tmp/ovpn_auth.txt
        chmod 600 /tmp/ovpn_auth.txt
        exec openvpn --config /etc/httpcustom/client.ovpn --remote "$SERVER" "$PORT" --auth-user-pass /tmp/ovpn_auth.txt >> "$LOG_FILE" 2>&1
    else
        log "Error: /etc/httpcustom/client.ovpn not found!"
        exit 1
    fi
else
    log "Error: Unknown protocol '$PROTO'"
    exit 1
fi
