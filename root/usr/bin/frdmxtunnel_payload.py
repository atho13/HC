#!/usr/bin/env python3
import base64, os, socket, sys, threading, time

def write_all(fd, data):
    while data:
        n = os.write(fd, data)
        data = data[n:]

def pump(src_fd, dst_fd, sock):
    try:
        while True:
            data = os.read(src_fd, 65536)
            if not data:
                break
            write_all(dst_fd, data)
    except OSError:
        pass
    finally:
        try:
            sock.shutdown(socket.SHUT_RDWR)
        except OSError:
            pass

def build_payload(raw, host, port):
    key = base64.b64encode(os.urandom(16)).decode("ascii")
    if not raw or not raw.strip():
        return (
            "GET / HTTP/1.1\r\n"
            "Host: " + host + "\r\n"
            "User-Agent: Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36\r\n"
            "Origin: http://" + host + "\r\n"
            "Upgrade: websocket\r\n"
            "Connection: Upgrade\r\n"
            "Sec-WebSocket-Key: " + key + "\r\n"
            "Sec-WebSocket-Version: 13\r\n\r\n"
        )
    p = raw.replace("[host]", host).replace("[port]", str(port)).replace("[host_port]", f"{host}:{port}")
    p = p.replace("[protocol]", "HTTP/1.1").replace("[ua]", "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36")
    p = p.replace("[crlf]", "\r\n").replace("[lf]", "\n").replace("[cr]", "\r")
    p = p.replace("\\r\\n", "\r\n").replace("\\n", "\n")

    # Optimasi jalur CONNECT (corkscrew mode)
    if p.lstrip().upper().startswith("CONNECT "):
        if "Proxy-Connection:" not in p:
            p = p.rstrip("\r\n") + "\r\nProxy-Connection: Keep-Alive\r\n\r\n"
        elif not p.endswith("\r\n\r\n"):
            p = p.rstrip("\r\n") + "\r\n\r\n"
        return p

    # Optimasi jalur WebSocket (ws-tunnel mode)
    if "Sec-WebSocket-Key" not in p and "Upgrade: websocket" in p:
        p = p.rstrip("\r\n") + f"\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n"
    elif not p.endswith("\r\n\r\n"):
        p = p.rstrip("\r\n") + "\r\n\r\n"
    return p

def main():
    if len(sys.argv) < 3:
        sys.exit(1)
    target_host = sys.argv[1]
    target_port = int(sys.argv[2])
    raw_payload = sys.argv[3] if len(sys.argv) > 3 else ""

    try:
        sock = socket.create_connection((target_host, target_port), timeout=10)
        sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_KEEPALIVE, 1)
    except OSError as e:
        sys.stderr.write(f"tunnel: connect failed: {e}\n")
        sys.exit(1)

    payload_str = build_payload(raw_payload, target_host, target_port)
    parts = payload_str.split("[split]")
    try:
        for i, part in enumerate(parts):
            if part:
                sock.sendall(part.encode("utf-8", "ignore"))
            if i < len(parts) - 1:
                time.sleep(0.2)

        resp = b""
        sock.settimeout(10)
        while b"\r\n\r\n" not in resp:
            chunk = sock.recv(4096)
            if not chunk:
                break
            resp += chunk
            if len(resp) > 32768:
                break

        leftover = b""
        if b"\r\n\r\n" in resp:
            header, leftover = resp.split(b"\r\n\r\n", 1)
            first_line = header.splitlines()[0].decode("ascii", "replace") if header.splitlines() else ""
            if not any(code in first_line for code in (" 101 ", " 200 ", " 101", " 200")):
                sys.stderr.write(f"tunnel: unexpected handshake: {first_line}\n")
                sys.exit(1)
        sock.settimeout(None)
    except OSError as e:
        sys.stderr.write(f"tunnel: handshake error: {e}\n")
        sys.exit(1)

    if leftover:
        write_all(1, leftover)

    t1 = threading.Thread(target=pump, args=(0, sock.fileno(), sock), daemon=True)
    t2 = threading.Thread(target=pump, args=(sock.fileno(), 1, sock), daemon=True)
    t1.start()
    t2.start()
    t1.join()
    t2.join()

if __name__ == "__main__":
    main()
