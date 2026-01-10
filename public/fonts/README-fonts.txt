Place a Korean Unicode TTF here to embed in exported PDFs.

Recommended:
- NotoSansKR-Regular.ttf (Apache-2.0)
- NotoSansKR-VariableFont_wght.ttf (works as regular; bold/italic are mapped programmatically)
- Pretendard-Regular.ttf (OFL-like)

Why: jsPDF's built-in fonts don't contain Korean glyphs. Without a TTF, your PDF will show garbled text.

How to use:
1) Download a Korean TTF: NotoSansKR-Regular.ttf (or NotoSansKR-VariableFont_wght.ttf)
   - Official repo: https://github.com/googlefonts/noto-cjk
   - Convenient mirror: https://cdn.jsdelivr.net/gh/googlefonts/noto-cjk@v2.004/Sans/TTF/NotoSansKR-Regular.ttf
2) Put the file at public/fonts (no rename required; the app will try Regular, Variable, Bold)
3) Re-export the PDF from the app. The app auto-loads this font.

Notes:
- If no local font is found, the app tries a CORS-enabled CDN fallback.
- For best quality, prefer the local file (faster and works offline/build).
