// Regenerates test/plate.jpg (already included). Optional: npm i -D sharp
const sharp = require('sharp');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1200">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8d8f91"/><stop offset="1" stop-color="#5d6062"/></linearGradient>
<linearGradient id="p" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e9e6dc"/><stop offset="1" stop-color="#cfcabd"/></linearGradient></defs>
<rect width="1600" height="1200" fill="url(#g)"/>
<rect x="220" y="230" width="1160" height="740" rx="18" fill="url(#p)" stroke="#333" stroke-width="4"/>
<text x="280" y="340" font-family="Arial" font-weight="700" font-size="78" fill="#111">SAMSUNG</text>
<line x1="280" y1="375" x2="1320" y2="375" stroke="#222" stroke-width="3"/>
<text x="280" y="470" font-family="Courier New, monospace" font-size="54" fill="#111">MODEL  RF28HFEDBSR/AA</text>
<text x="280" y="560" font-family="Courier New, monospace" font-size="54" fill="#111">SERIAL 0ALY4BBK500812A</text>
<text x="280" y="660" font-family="Arial" font-size="40" fill="#333">115V~ 60Hz  11.5A   REFRIGERANT R-600a 3.0 oz</text>
<text x="280" y="740" font-family="Arial" font-size="34" fill="#444">MADE IN MEXICO   ETL LISTED   MFG DATE 2016.03</text>
<rect x="1080" y="790" width="220" height="130" fill="none" stroke="#222" stroke-width="3"/>
<text x="1110" y="870" font-family="Arial" font-weight="700" font-size="44" fill="#222">ETL</text>
</svg>`;
sharp(Buffer.from(svg)).jpeg({ quality: 88 }).toFile('test/plate.jpg').then(i => console.log('plate.jpg', i.width, i.height, i.size));
