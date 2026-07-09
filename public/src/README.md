# Frontend Source Files (Editable)

This folder contains the **split, easy-to-edit** version of the frontend:

```
src/
├── index.html   ← page structure (HTML only)
├── style.css    ← all styling (CSS only)
└── app.js       ← all logic & API calls (JavaScript only)
```

## How to edit

- **Change colors, fonts, spacing, layout** → edit `style.css`
- **Change page structure, add new sections, edit text** → edit `index.html`
- **Change behavior, API calls, AI logic** → edit `app.js`

## How to preview your changes

Open `src/index.html` directly using the **Live Server** extension in VS Code,
or run the full project (`npm start` in the project root) and visit:
```
http://localhost:3000/src/index.html
```

⚠️ Note: `src/index.html` calls the same backend (`/api/...`) as the main app,
so the Node.js server must be running for movies/AI features to work.

## Production file

`public/index.html` (one level up, NOT inside `src/`) is the **all-in-one bundled
version** that the server actually serves at `http://localhost:3000`. After
editing files in `src/`, if you want your changes reflected on the main site,
either:

1. Point your browser to `/src/index.html` instead of `/`, OR
2. Copy your edited CSS/JS back into `public/index.html` manually

Both versions are functionally identical — `src/` is just split up for easier editing.
