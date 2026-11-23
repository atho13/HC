#!/usr/bin/env python3
import socket
import sys
import threading
import time

def format_payload(raw_payload, host, port):
    p = raw_payload
    p = p.replace('[host_port]', f'{host}:{port}')
    p = p.replace('[host]', host)
    p = p.replace('[port]', str(port))
    p = p.replace('[protocol]', 'HTTP/1.1')
    p = p.replace('[crlf]', '\r\n')
    p = p.replace('[lf]', '\n')
    p = p.replace('[cr]', '\r')
    p = p.replace('\\r\\n', '\r\n')
    p = p.replace('\\n', '\n')
    p = p.replace('\\r', '\r')
    return p

def forward(src, dst, strip_http=False):
    first_chunk = True
    try:
        while True:
            data = src.recv(16384)
            if not data:
                break
            if strip_http and first_chunk:
                first_chunk = False
                # Jika server membalas HTTP 200 OK sebelum banner SSH-2.0, buang header HTTP-nya
                if data.startswith(b'HTTP/') and b'\r\n\r\n' in data:
                    _, remainder = data.split(b'\r\n\r\n', 1)
                    if remainder:
                        dst.sendall(remainder)
                    continue
            dst.sendall(data)
    except Exception:
        pass
    finally:
        try:
            src.close()
        except Exception:
            pass
        try:
            dst.close()
        except Exception:
            pass

def handle_client(client_socket, target_host, target_port, raw_payload):
    remote_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    remote_socket.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
    remote_socket.setsockopt(socket.SOL_SOCKET, socket.SO_KEEPALIVE, 1)
    remote_socket.settimeout(15)

    try:
        remote_socket.connect((target_host, int(target_port)))
        remote_socket.settimeout(None)

        formatted = format_payload(raw_payload, target_host, target_port)
        # Mendukung fitur [split] jika ada di dalam payload
        if '[split]' in formatted:
            parts = formatted.split('[split]')
            for i, part in enumerate(parts):
                if part:
                    remote_socket.sendall(part.encode('utf-8', errors='ignore'))
                if i < len(parts) - 1:
                    time.sleep(0.1)
        else:
            if formatted:
                remote_socket.sendall(formatted.encode('utf-8', errors='ignore'))

        t1 = threading.Thread(target=forward, args=(client_socket, remote_socket, False), daemon=True)
        t2 = threading.Thread(target=forward, args=(remote_socket, client_socket, True), daemon=True)
        t1.start()
        t2.start()
    except Exception as e:
        print(f"[Injector Error] {e}", flush=True)
        try:
            client_socket.close()
        except Exception:
            pass
        try:
            remote_socket.close()
        except Exception:
            pass

def main():
    if len(sys.argv) < 4:
        print("Usage: httpcustom_payload.py <host> <port> <payload>", flush=True)
        sys.exit(1)

    target_host = sys.argv[1]
    target_port = sys.argv[2]
    raw_payload = sys.argv[3]

    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server.bind(('127.0.0.1', 8989))
    server.listen(16)
    print(f"Injector listening on 127.0.0.1:8989 -> {target_host}:{target_port}", flush=True)

    while True:
        client_sock, _ = server.accept()
        client_sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
        threading.Thread(
            target=handle_client,
            args=(client_sock, target_host, target_port, raw_payload),
            daemon=True
        ).start()

if __name__ == '__main__':
    main()
