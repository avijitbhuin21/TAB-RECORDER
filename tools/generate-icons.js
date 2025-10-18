const fs = require('fs');

function createIconSVG(size) {
  const centerX = size / 2;
  const centerY = size / 2;
  const circleRadius = size * 0.35;
  const innerCircleRadius = circleRadius * 0.4;
  const triangleSize = size * 0.15;
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad${size}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
    </linearGradient>
  </defs>
  
  <rect width="${size}" height="${size}" fill="url(#grad${size})"/>
  
  <circle cx="${centerX}" cy="${centerY}" r="${circleRadius}" fill="white"/>
  
  <circle cx="${centerX}" cy="${centerY}" r="${innerCircleRadius}" fill="#ef4444"/>
  
  <polygon points="${centerX - triangleSize * 0.3},${centerY - triangleSize * 0.5} ${centerX - triangleSize * 0.3},${centerY + triangleSize * 0.5} ${centerX + triangleSize * 0.6},${centerY}" fill="white"/>
</svg>`;
}

const sizes = [16, 48, 128];

sizes.forEach(size => {
  const svg = createIconSVG(size);
  const filename = `icon${size}.svg`;
  fs.writeFileSync(filename, svg);
  console.log(`Created ${filename}`);
});

console.log('\nSVG icons created successfully!');
console.log('Note: These are SVG files. For PNG conversion, you can:');
console.log('1. Use an online converter like https://cloudconvert.com/svg-to-png');
console.log('2. Or rename them to .png and the extension will work with SVG');
console.log('3. Or use ImageMagick: magick convert icon16.svg icon16.png');