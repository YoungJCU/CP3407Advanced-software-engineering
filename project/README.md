# Campus Navigation

Express + SQLite (`server/`) serves the site and API. Static UI is in `client/`.

## One-click start / stop

In **Terminal** (macOS: Terminal.app or Cursor terminal):

```bash
cd "/path/to/test web/project"
chmod +x run_all.sh stop_all.sh
./run_all.sh
```

Then open **http://localhost:3000/** in your browser.

To stop:

```bash
./stop_all.sh
```

Do **not** open `client/index.html` by double-click — use the URL above after `./run_all.sh`.

---

## Sign-in

Email is stored in the browser (`localStorage`) for the header only. Password is validated on the page and not stored.
