import fs from 'fs';
import path from 'path';
import https from 'https';

const fontsDir = path.join(process.cwd(), 'fonts');
if (!fs.existsSync(fontsDir)) {
  fs.mkdirSync(fontsDir, { recursive: true });
}

const fonts = {
  'Inter-Bold.ttf': 'https://raw.githubusercontent.com/google/fonts/main/ofl/inter/static/Inter-Bold.ttf',
  'Anton-Regular.ttf': 'https://raw.githubusercontent.com/google/fonts/main/ofl/anton/Anton-Regular.ttf',
  'Roboto-Black.ttf': 'https://raw.githubusercontent.com/google/fonts/main/ofl/roboto/Roboto-Black.ttf',
  'Merriweather-Bold.ttf': 'https://raw.githubusercontent.com/google/fonts/main/ofl/merriweather/Merriweather-Bold.ttf',
  'SpaceMono-Bold.ttf': 'https://raw.githubusercontent.com/google/fonts/main/ofl/spacemono/SpaceMono-Bold.ttf',
  'Tajawal-Bold.ttf': 'https://raw.githubusercontent.com/google/fonts/main/ofl/tajawal/Tajawal-Bold.ttf',
  'Cairo-Bold.ttf': 'https://raw.githubusercontent.com/google/fonts/main/ofl/cairo/static/Cairo-Bold.ttf'
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
  for (const [name, url] of Object.entries(fonts)) {
    console.log(`Downloading ${name}...`);
    try {
      await downloadFile(url, path.join(fontsDir, name));
      console.log(`Successfully downloaded ${name}`);
    } catch (e) {
      console.error(`Error downloading ${name}:`, e.message);
    }
  }
}

main();
