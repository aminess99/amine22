import fs from 'fs';
import path from 'path';
import https from 'https';

const fontsDir = path.join(process.cwd(), 'fonts');
if (!fs.existsSync(fontsDir)) {
  fs.mkdirSync(fontsDir, { recursive: true });
}

// Map the family name we request, to the file name we save
const fontFamilies = [
  { fam: 'Inter:wght@700', name: 'Inter' },
  { fam: 'Anton', name: 'Anton' },
  { fam: 'Roboto:wght@900', name: 'Roboto' },
  { fam: 'Merriweather:wght@700', name: 'Merriweather' },
  { fam: 'Space+Mono:wght@700', name: 'Space Mono' }, // name must match what we use in ASS generator
  { fam: 'Tajawal:wght@700', name: 'Tajawal' },
  { fam: 'Cairo:wght@700', name: 'Cairo' },
];

const fetchCss = (famStr) => {
  return new Promise((resolve, reject) => {
    https.get(`https://fonts.googleapis.com/css2?family=${famStr}&display=swap`, {
      headers: {
        // old Safari or Android to get TTF
        'User-Agent': 'Mozilla/5.0 (Linux; U; Android 4.1.1; en-gb; Build/KLP) AppleWebKit/534.30 (KHTML, like Gecko) Version/4.0 Safari/534.30'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
};

const downloadFile = (url, dest) => {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        return downloadFile(response.headers.location, dest).then(resolve).catch(reject);
      }
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download ${url}: ${response.statusCode}`));
        return;
      }
      const file = fs.createWriteStream(dest);
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
      });
  });
};

async function main() {
  for (const font of fontFamilies) {
    try {
      console.log(`Fetching CSS for ${font.name}...`);
      const css = await fetchCss(font.fam);
      const urlMatch = css.match(/url\((https:\/\/[^)]+\.ttf[^)]*)\)/);
      if (urlMatch && urlMatch[1]) {
        let ttfUrl = urlMatch[1];
        // replace any quotes
        ttfUrl = ttfUrl.replace(/['"]/g, '');
        const savePath = path.join(fontsDir, `${font.name}.ttf`);
        console.log(`Downloading TTF from ${ttfUrl} to ${savePath}...`);
        await downloadFile(ttfUrl, savePath);
        console.log(`Successfully downloaded ${font.name}`);
      } else {
        console.error(`Could not find TTF url for ${font.name} in CSS:\n${css}`);
      }
    } catch (e) {
      console.error(`Error processing ${font.name}:`, e.message);
    }
  }
}

main();
