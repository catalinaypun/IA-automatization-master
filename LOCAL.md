# Running the Prototype Viewer Locally

The viewer (`index.html`) reads the flow manifest from an embedded `<script>` block —
no network requests. **You can double-click `index.html` from Finder and it will work.**

## Optional: local HTTP server

A local server is only needed if you want the browser to resolve relative paths for
prototype `.html` files that themselves load external resources. To spin one up:

```bash
# From the root of this repo:
python3 -m http.server 8000
```

Then open **http://localhost:8000** in your browser.

### Alternatives

```bash
# Node (if you have npx):
npx serve .

# Ruby:
ruby -run -e httpd . -p 8000
```
