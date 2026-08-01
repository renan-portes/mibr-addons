import http.client
import sys


def main() -> int:
    if len(sys.argv) != 4:
        return 1

    path = sys.argv[1]
    timeout_seconds = int(sys.argv[2])
    max_bytes = int(sys.argv[3])
    if timeout_seconds != 20 or max_bytes != 1_048_576:
        return 1

    connection = http.client.HTTPConnection("torrent-indexer", 7006, timeout=timeout_seconds)
    connection._http_vsn = 10
    connection._http_vsn_str = "HTTP/1.0"
    captured = bytearray()
    try:
        connection.request("GET", path)
        response = connection.getresponse()
        print(f"HTTP_STATUS={response.status}", file=sys.stderr)
        while True:
            chunk = response.read(64 * 1024)
            if not chunk:
                break
            if len(captured) <= max_bytes:
                captured.extend(chunk[: max_bytes + 1 - len(captured)])
    finally:
        connection.close()

    sys.stdout.buffer.write(captured)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
