#!/usr/bin/env python3
import base64
import os
import random
import re
import socket
import ssl
import sys
import threading
import time

SO_MARK = 36

def write_all(fd, data):
    while data:
        n = os.write(fd, data)
        data = data[n:]

def pump_fd_to_sock(src_fd, sock):
    try:
        while True:
            data = os.read(src_fd, 262144)
            if not data:
                break
            sock.sendall(data)
    except OSError:
        pass
    finally:
        try:
            sock.shutdown(socket.SHUT_RDWR)
        except OSError:
            pass

def pump_sock_to_fd(sock, dst_fd):
    try:
        while True:
            data = sock.recv(262144)
            if not data:
                break
            write_all(dst_fd, data)
    except OSError:
        pass
    finally:
        try:
            sock.close()
        except OSError:
            pass

def expand_rotate_random(text):
    rot_file = "/tmp/frdmxtunnel_rotate.idx"
    def repl_rotate(m):
        items = [x.strip() for x in m.group(1).split(";") if x.strip()]
        if not items:
            return ""
        idx = 0
        try:
            if os.path.exists(rot_file):
                idx = int(open(rot_file).read().strip() or 0)
        except Exception:
            idx = 0
        val = items[idx % len(items)]
        try:
            with open(rot_file, "w") as wf:
                wf.write(str((idx + 1) % len(items)))
        except Exception:
            pass
        return val

    def repl_random(m):
        items = [x.strip() for x in m.group(1).split(";") if x.strip()]
        return random.choice(items) if items else ""

    text = re.sub(r"\[rotate=([^\]]+)\]", repl_rotate, text)
    text = re.sub(r"\[random=([^\]]+)\]", repl_random, text)
    return text

def build_payload(raw, host, port, sni="", target_ip="", proxy_host="", proxy_port=""):
    key = base64.b64encode(os.urandom(16)).decode("ascii")
    sni_val = sni if sni else host
    ip_val = target_ip if target_ip else host
    px_host = proxy_host if proxy_host else ""
    px_port = str(proxy_port) if proxy_port else ("80" if px_host else "")
    ua_val = "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/116.0.0.0 Mobile Safari/537.36"

    if not raw or not raw.strip():
        return (
            f"GET / HTTP/1.1\r\n"
            f"Host: {host}\r\n"
            f"User-Agent: {ua_val}\r\n"
            f"Upgrade: websocket\r\n"
            f"Connection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {key}\r\n"
            f"Sec-WebSocket-Version: 13\r\n\r\n"
        )

    first_line = raw.strip().splitlines()[0] if raw.strip() else ""
    method = first_line.split()[0].upper() if first_line else "CONNECT"
    if method not in ("GET", "POST", "CONNECT", "HEAD", "PUT", "DELETE"):
        method = "CONNECT"
    raw_req = f"{method} {host}:{port} HTTP/1.1"

    replacements = {
        "[host_no_port]": host.split(":")[0],
        "[host_port]": f"{host}:{port}",
        "[ssh_host]": host,
        "[ssh_port]": str(port),
        "[ip_port]": f"{ip_val}:{port}",
        "[proxy_host]": px_host,
        "[proxy_port]": px_port,
        "[sni_host]": sni_val,
        "[sni_port]": str(port),
        "[real_raw]": raw_req,
        "[realData]": raw_req,
        "[netData]": raw_req,
        "[protocol]": "HTTP/1.1",
        "[server]": host,
        "[ws_key]": key,
        "[ws-key]": key,
        "[method]": method,
        "[proxy]": f"{px_host}:{px_port}" if px_host else "",
        "[host]": host,
        "[port]": str(port),
        "[ssh]": host,
        "[sni]": sni_val,
        "[bug]": sni_val,
        "[raw]": raw_req,
        "[ip]": ip_val,
        "[ua]": ua_val,
        "[ssh_banner]": "SSH-2.0-OpenSSH_9.6\r\n",
    }

    p = expand_rotate_random(raw)
    for k in sorted(replacements.keys(), key=len, reverse=True):
        p = p.replace(k, replacements[k])

    def repeat_char(match):
        ctype = match.group(1)
        count = int(match.group(2)) if match.group(2) else 1
        cmap = {"crlf": "\r\n", "cr": "\r", "lf": "\n"}
        return cmap[ctype] * count

    p = re.sub(r"\[(crlf|cr|lf)(?:\*(\d+))?\]", repeat_char, p)
    p = p.replace("\\r\\n", "\r\n").replace("\\n", "\n")

    if p.lstrip().upper().startswith("CONNECT "):
        if "Proxy-Connection:" not in p:
            p = p.rstrip("\r\n") + "\r\nProxy-Connection: Keep-Alive\r\n\r\n"
        elif not p.endswith("\r\n\r\n"):
            p = p.rstrip("\r\n") + "\r\n\r\n"
        return p

    if "Upgrade: websocket" in p and "Sec-WebSocket-Key" not in p:
        extra = ""
        if "Connection:" not in p:
            extra += "\r\nConnection: Upgrade"
        if "User-Agent:" not in p:
            extra += f"\r\nUser-Agent: {ua_val}"
        p = p.rstrip("\r\n") + f"{extra}\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n"
    elif not p.endswith("\r\n\r\n"):
        p = p.rstrip("\r\n") + "\r\n\r\n"

    return p

def connect_with_mark(host, port, sni="", use_tls=False, timeout=10):
    err = None
    for res in socket.getaddrinfo(host, port, socket.AF_UNSPEC, socket.SOCK_STREAM):
        af, socktype, proto, canonname, sa = res
        s = None
        try:
            s = socket.socket(af, socktype, proto)
            s.setsockopt(socket.SOL_SOCKET, SO_MARK, 255)
            s.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
            s.setsockopt(socket.SOL_SOCKET, socket.SO_KEEPALIVE, 1)
            s.setsockopt(socket.SOL_SOCKET, socket.SO_RCVBUF, 1048576)
            s.setsockopt(socket.SOL_SOCKET, socket.SO_SNDBUF, 1048576)
            s.settimeout(timeout)
            s.connect(sa)

            if use_tls:
                ctx = ssl.create_default_context()
                ctx.check_hostname = False
                ctx.verify_mode = ssl.CERT_NONE
                s = ctx.wrap_socket(s, server_hostname=sni if sni else host)

            return s
        except OSError as e:
            err = e
            if s:
                s.close()
    raise err or OSError("Unable to connect")

def main():
    if len(sys.argv) < 3:
        sys.exit(1)

    dial_host = sys.argv[1]
    dial_port = int(sys.argv[2])
    raw_payload = open(sys.argv[3]).read() if (len(sys.argv) > 3 and os.path.isfile(sys.argv[3])) else (sys.argv[3] if len(sys.argv) > 3 else "")
    sni_host = sys.argv[4] if len(sys.argv) > 4 else ""
    mode = sys.argv[5] if len(sys.argv) > 5 else ""

    real_host = os.environ.get("REAL_HOST") or dial_host
    real_port = os.environ.get("REAL_PORT") or str(dial_port)
    real_ip = os.environ.get("REAL_IP") or real_host
    proxy_host = os.environ.get("PROXY_HOST") or ""
    proxy_port = os.environ.get("PROXY_PORT") or ""

    if mode in ("stunnel_payload", "payload", "proxy_ssl"):
        use_tls = False
    else:
        use_tls = dial_port in (443, 8443, 2053, 2083, 2087, 2096)

    try:
        sock = connect_with_mark(dial_host, dial_port, sni_host, use_tls=use_tls, timeout=10)
    except OSError as e:
        sys.stderr.write(f"tunnel: connect failed ({dial_host}:{dial_port}): {e}\n")
        sys.exit(1)

    payload_str = build_payload(raw_payload, real_host, real_port, sni_host, real_ip, proxy_host, proxy_port)
    tokens = re.split(r"(\[split\]|\[delay_split(?:=\d+)?\])", payload_str)

    def read_http_header(s, timeout=15):
        buf = b""
        s.settimeout(timeout)
        while b"\r\n\r\n" not in buf:
            chunk = s.recv(4096)
            if not chunk:
                break
            buf += chunk
            # Jika 5 byte awal bukan HTTP/ (misal langsung banner SSH-2.0-), langsung loloskan
            if len(buf) >= 5 and not buf.startswith(b"HTTP/"):
                break
            if len(buf) > 32768:
                break
        return buf

    try:
        resp = b""
        for i, token in enumerate(tokens):
            if not token:
                continue
            elif token == "[split]":
                # Two-stage split: tunggu balasan HTTP pertama jika blok sebelumnya lengkap
                prev_tok = tokens[i - 1] if i > 0 else ""
                has_next = any(t and t not in ("[split]", "[delay_split]") for t in tokens[i + 1:])
                if prev_tok.endswith("\r\n\r\n") and has_next:
                    first_resp = read_http_header(sock, timeout=10)
                    if b"\r\n\r\n" in first_resp:
                        _, extra = first_resp.split(b"\r\n\r\n", 1)
                        resp = extra
                else:
                    time.sleep(0.05)
            elif token.startswith("[delay_split"):
                m_ms = re.search(r"(\d+)", token)
                time.sleep((int(m_ms.group(1)) / 1000.0) if m_ms else 0.5)
            else:
                sock.sendall(token.encode("utf-8", "ignore"))

        if b"\r\n\r\n" not in resp:
            resp += read_http_header(sock, timeout=15)

        leftover = b""
        if b"\r\n\r\n" in resp:
            header, leftover = resp.split(b"\r\n\r\n", 1)
            first_line = header.splitlines()[0].decode("ascii", "replace") if header.splitlines() else ""
            if not any(code in first_line for code in (" 101 ", " 200 ", " 101", " 200")):
                sys.stderr.write(f"tunnel: unexpected handshake: {first_line}\n")
                sys.exit(1)
            while leftover.startswith(b"HTTP/1.") and b"\r\n\r\n" in leftover:
                _, leftover = leftover.split(b"\r\n\r\n", 1)
        if mode == "proxy_ssl":
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            sock = ctx.wrap_socket(sock, server_hostname=sni_host if sni_host else real_host)
        sock.settimeout(None)
    except OSError as e:
        sys.stderr.write(f"tunnel: handshake error: {e}\n")
        sys.exit(1)

    if leftover:
        write_all(1, leftover)

    t1 = threading.Thread(target=pump_fd_to_sock, args=(0, sock), daemon=True)
    t2 = threading.Thread(target=pump_sock_to_fd, args=(sock, 1), daemon=True)
    t1.start()
    t2.start()
    t1.join()
    t2.join()

if __name__ == "__main__":
    main()
