# Running the Prototype Viewer Locally

The viewer (`index.html`) uses `fetch()` to load `flow.json` and prototype `.md` files.
**`fetch()` does not work when you open `index.html` directly from Finder** — the browser
blocks it due to CORS restrictions on `file://` URLs. You must serve the folder with a
local HTTP server.

## Quickstart

```bash
# From the root of this repo:
python3 -m http.server 8000
```

Then open **http://localhost:8000** in your browser.

## Alternatives

```bash
# Node (if you have npx):
npx serve .

# Ruby:
ruby -run -e httpd . -p 8000
```

## Notes

- Any port works — just make sure `index.html` is at the root being served.
- No internet connection required. Everything runs from local files.
- Stop the server with `Ctrl+C` when you're done.
